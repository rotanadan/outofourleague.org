<script setup lang="ts">
import type { Database, TeamMatchDue } from '~/types/database.types'

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

// Dues: what my team owes for each of its matches. Anyone on the team can pay
// any part of a match's balance.
const { data: dues, refresh: refreshDues } = await useAsyncData('my-dues', async () => {
  const teamId = membership.value?.team?.id
  if (!teamId) return []

  const { data } = await client
    .from('team_match_dues')
    .select('*')
    .eq('team_id', teamId)
    .order('week_number')

  return data ?? []
}, { watch: [membership], default: () => [] })

const matchFee = computed(() => season.value?.league?.match_fee_cents ?? 0)
const outstanding = computed(() =>
  (dues.value ?? []).reduce((total, row) => total + row.remaining_cents, 0)
)

// What's left once teammates' checkouts in progress are set aside: the most the
// server will accept for this match right now.
function payable(row: TeamMatchDue) {
  return Math.max(row.remaining_cents - row.pending_cents, 0)
}

// Dollars typed into each match's pay field, starting at everything payable.
const amounts = reactive<Record<string, number>>({})

watchEffect(() => {
  for (const row of dues.value ?? []) {
    amounts[row.match_id] ??= payable(row) / 100
  }
})

const payingMatch = ref<string | null>(null)

async function payMatch(row: TeamMatchDue) {
  payingMatch.value = row.match_id
  try {
    const { url } = await $fetch<{ url: string }>('/api/stripe/checkout', {
      method: 'POST',
      body: { matchId: row.match_id, amountCents: Math.round((amounts[row.match_id] ?? 0) * 100) }
    })
    window.location.href = url
  } catch (error: unknown) {
    // Read the message from the JSON body: the HTTP status text is empty over
    // HTTP/2 (e.g. on Vercel).
    const message = (error as { data?: { statusMessage?: string } }).data?.statusMessage
    toast.add({ title: 'Could not start checkout', description: message ?? 'Something went wrong.', color: 'error' })
    // A teammate may have paid in the meantime, so show the current balance.
    await refreshDues()
  } finally {
    payingMatch.value = null
  }
}

// Coming back from Stripe: ?paid=1
const route = useRoute()
onMounted(async () => {
  if (route.query.paid) {
    await refreshDues()
    toast.add({
      title: 'Thanks — payment received',
      description: 'It can take a moment to show up against your team\'s balance.',
      color: 'success'
    })
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
              Team dues
            </h2>
            <p
              v-if="membership?.team"
              class="text-sm text-muted"
            >
              {{ formatMoney(matchFee) }} per match · {{ formatMoney(outstanding) }} outstanding
            </p>
          </div>
        </template>

        <p
          v-if="!membership?.team"
          class="text-sm text-muted"
        >
          You can pay dues once a league admin puts you on a team.
        </p>

        <p
          v-else-if="!dues?.length"
          class="text-sm text-muted"
        >
          No matches scheduled for {{ membership.team.name }} yet.
        </p>

        <template v-else>
          <p class="text-sm text-muted">
            Each team owes {{ formatMoney(matchFee) }} per match. Anyone on
            {{ membership.team.name }} can pay any part of what's left.
          </p>

          <ul class="mt-3 divide-y divide-default">
            <li
              v-for="row in dues"
              :key="row.match_id"
              class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p>
                  <span class="font-medium">Week {{ row.week_number }}</span>
                  <span class="ml-2 text-muted">{{ formatBowlDate(row.bowl_date) }} · vs {{ row.opponent_name }}</span>
                </p>
                <p class="text-muted">
                  {{ formatMoney(row.paid_cents) }} of {{ formatMoney(row.fee_cents) }} paid
                  <span v-if="row.pending_cents">· {{ formatMoney(row.pending_cents) }} in progress</span>
                </p>
              </div>

              <UBadge
                v-if="!row.fee_cents"
                color="neutral"
                variant="subtle"
              >
                No dues
              </UBadge>
              <UBadge
                v-else-if="!row.remaining_cents"
                color="success"
                variant="subtle"
              >
                Paid
              </UBadge>
              <form
                v-else
                class="flex items-center gap-2"
                @submit.prevent="payMatch(row)"
              >
                <span class="font-medium text-highlighted">
                  {{ formatMoney(row.remaining_cents) }} left
                </span>
                <UInput
                  v-model.number="amounts[row.match_id]"
                  type="number"
                  min="0.5"
                  :max="payable(row) / 100"
                  step="0.01"
                  required
                  :disabled="!payable(row)"
                  aria-label="Amount to pay"
                  class="w-28"
                >
                  <template #leading>
                    $
                  </template>
                </UInput>
                <UButton
                  type="submit"
                  size="sm"
                  :loading="payingMatch === row.match_id"
                  :disabled="!payable(row)"
                >
                  Pay
                </UButton>
              </form>
            </li>
          </ul>
        </template>
      </UCard>
    </div>
  </UContainer>
</template>
