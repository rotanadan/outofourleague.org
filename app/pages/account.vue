<script setup lang="ts">
import type { Database, Payment } from '~/types/database.types'

definePageMeta({ middleware: 'auth' })

const client = useSupabaseClient<Database>()
const user = useSupabaseUser()
const userId = useUserId()
const toast = useToast()
const { profile, refresh: refreshProfile } = useProfile()
const { data: season } = await useActiveSeason()

const form = reactive({ full_name: '', phone: '' })
const saving = ref(false)

watchEffect(() => {
  form.full_name = profile.value?.full_name ?? ''
  form.phone = profile.value?.phone ?? ''
})

async function saveProfile() {
  if (!userId.value) return

  saving.value = true
  const { error } = await client
    .from('profiles')
    .update({ full_name: form.full_name || null, phone: form.phone || null })
    .eq('id', userId.value)
  saving.value = false

  if (error) {
    toast.add({ title: 'Could not save', description: error.message, color: 'error' })
    return
  }

  await refreshProfile()
  toast.add({ title: 'Profile saved', color: 'success' })
}

// Which team am I on this season?
const { data: membership } = await useAsyncData('my-team', async () => {
  if (!userId.value || !season.value) return null

  const { data } = await client
    .from('team_members')
    .select('role, team:teams(id, name)')
    .eq('profile_id', userId.value)
    .eq('season_id', season.value.id)
    .maybeSingle()

  return data
}, { watch: [userId, season] })

// Dues: every week of the season, paired with my payment for it (if any).
const { data: dues, refresh: refreshDues } = await useAsyncData('my-dues', async () => {
  if (!userId.value || !season.value) return []

  const [weeks, payments] = await Promise.all([
    client.from('weeks').select('*').eq('season_id', season.value.id).order('week_number'),
    client.from('payments').select('*').eq('profile_id', userId.value).eq('season_id', season.value.id)
  ])

  const byWeek = new Map<string, Payment>()
  for (const payment of payments.data ?? []) {
    if (payment.week_id) byWeek.set(payment.week_id, payment)
  }

  return (weeks.data ?? []).map(week => ({ week, payment: byWeek.get(week.id) ?? null }))
}, { watch: [userId, season], default: () => [] })

const weeklyFee = computed(() => season.value?.league?.weekly_fee_cents ?? 0)
const owed = computed(() =>
  (dues.value ?? []).filter(row => row.payment?.status !== 'paid').length * weeklyFee.value
)

const payingWeek = ref<string | null>(null)

async function payWeek(weekId: string) {
  payingWeek.value = weekId
  try {
    const { url } = await $fetch<{ url: string }>('/api/stripe/checkout', {
      method: 'POST',
      body: { weekId }
    })
    window.location.href = url
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'statusMessage' in error
      ? String((error as { statusMessage: string }).statusMessage)
      : 'Something went wrong.'
    toast.add({ title: 'Could not start checkout', description: message, color: 'error' })
  } finally {
    payingWeek.value = null
  }
}

// Coming back from Stripe: ?paid=1
const route = useRoute()
onMounted(async () => {
  if (route.query.paid) {
    await refreshDues()
    toast.add({ title: 'Thanks — payment received', color: 'success' })
  }
})

useSeoMeta({ title: 'My account' })
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="My account"
      :description="user?.email ?? undefined"
    />

    <div class="mt-8 grid gap-6 lg:grid-cols-3">
      <UCard class="lg:col-span-1">
        <template #header>
          <h2 class="font-semibold">
            Details
          </h2>
        </template>

        <form
          class="space-y-4"
          @submit.prevent="saveProfile"
        >
          <UFormField
            label="Name"
            name="full_name"
          >
            <UInput
              v-model="form.full_name"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Phone"
            name="phone"
          >
            <UInput
              v-model="form.phone"
              type="tel"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            :loading="saving"
          >
            Save
          </UButton>
        </form>

        <template #footer>
          <div class="text-sm">
            <p class="text-muted">
              Team this season
            </p>
            <NuxtLink
              v-if="membership?.team"
              :to="`/teams/${membership.team.id}`"
              class="font-medium hover:text-primary"
            >
              {{ membership.team.name }}
              <span class="text-muted">({{ membership.role }})</span>
            </NuxtLink>
            <p
              v-else
              class="text-muted italic"
            >
              Not assigned yet — ask a league admin.
            </p>
          </div>
        </template>
      </UCard>

      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-baseline justify-between gap-4">
            <h2 class="font-semibold">
              Weekly dues
            </h2>
            <p class="text-sm text-muted">
              {{ formatMoney(weeklyFee) }} per week · {{ formatMoney(owed) }} outstanding
            </p>
          </div>
        </template>

        <p
          v-if="!dues?.length"
          class="text-sm text-muted"
        >
          No weeks scheduled yet.
        </p>

        <ul
          v-else
          class="divide-y divide-default"
        >
          <li
            v-for="row in dues"
            :key="row.week.id"
            class="flex items-center justify-between gap-4 py-2 text-sm"
          >
            <div>
              <span class="font-medium">Week {{ row.week.week_number }}</span>
              <span class="ml-2 text-muted">{{ formatBowlDate(row.week.bowl_date) }}</span>
            </div>

            <UBadge
              v-if="row.payment?.status === 'paid'"
              color="success"
              variant="subtle"
            >
              Paid
            </UBadge>
            <UBadge
              v-else-if="row.payment?.status === 'pending'"
              color="warning"
              variant="subtle"
            >
              Pending
            </UBadge>
            <UButton
              v-else
              size="xs"
              color="neutral"
              variant="subtle"
              :loading="payingWeek === row.week.id"
              :disabled="!weeklyFee"
              @click="payWeek(row.week.id)"
            >
              Pay {{ formatMoney(weeklyFee) }}
            </UButton>
          </li>
        </ul>
      </UCard>
    </div>
  </UContainer>
</template>
