<script setup lang="ts">
import type { Database, League, Season } from '~/types/database.types'

definePageMeta({ middleware: 'admin' })

const client = useSupabaseClient<Database>()
const toast = useToast()

const { data: leagues, refresh: refreshLeagues } = await useAsyncData<League[]>(
  'admin-leagues',
  async () => {
    const { data } = await client.from('leagues').select('*').order('created_at')
    return data ?? []
  },
  { default: () => [] }
)

const league = computed(() => leagues.value?.[0] ?? null)

const leagueForm = reactive({
  name: '',
  venue: '',
  day_of_week: 4,
  start_time: '19:00',
  match_fee_dollars: 60,
  description: ''
})

watchEffect(() => {
  if (!league.value) return
  leagueForm.name = league.value.name
  leagueForm.venue = league.value.venue ?? ''
  leagueForm.day_of_week = league.value.day_of_week ?? 4
  leagueForm.start_time = league.value.start_time?.slice(0, 5) ?? '19:00'
  leagueForm.match_fee_dollars = league.value.match_fee_cents / 100
  leagueForm.description = league.value.description ?? ''
})

const dayItems = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 }
]

const savingLeague = ref(false)

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function saveLeague() {
  savingLeague.value = true

  const payload = {
    name: leagueForm.name,
    venue: leagueForm.venue || null,
    day_of_week: leagueForm.day_of_week,
    start_time: leagueForm.start_time || null,
    match_fee_cents: Math.round(leagueForm.match_fee_dollars * 100),
    description: leagueForm.description || null
  }

  const { error } = league.value
    ? await client.from('leagues').update(payload).eq('id', league.value.id)
    : await client.from('leagues').insert({ ...payload, slug: slugify(leagueForm.name) })

  savingLeague.value = false

  if (error) {
    toast.add({ title: 'Could not save the league', description: error.message, color: 'error' })
    return
  }

  await refreshLeagues()
  toast.add({ title: 'League saved', color: 'success' })
}

const { data: seasons, refresh: refreshSeasons } = await useAsyncData<Season[]>(
  'admin-seasons',
  async () => {
    const { data } = await client.from('seasons').select('*').order('starts_on', { ascending: false })
    return data ?? []
  },
  { default: () => [] }
)

const seasonForm = reactive({ name: '', starts_on: '', ends_on: '' })
const creatingSeason = ref(false)

async function createSeason() {
  if (!league.value || !seasonForm.name || !seasonForm.starts_on) return

  creatingSeason.value = true
  const { error } = await client.from('seasons').insert({
    league_id: league.value.id,
    name: seasonForm.name,
    starts_on: seasonForm.starts_on,
    ends_on: seasonForm.ends_on || null
  })
  creatingSeason.value = false

  if (error) {
    toast.add({ title: 'Could not create the season', description: error.message, color: 'error' })
    return
  }

  seasonForm.name = ''
  seasonForm.starts_on = ''
  seasonForm.ends_on = ''
  await refreshSeasons()
}

async function activate(season: Season) {
  // Only one season per league may be active, so stand the others down first.
  await client.from('seasons').update({ is_active: false })
    .eq('league_id', season.league_id).neq('id', season.id)

  const { error } = await client.from('seasons').update({ is_active: true }).eq('id', season.id)

  if (error) {
    toast.add({ title: 'Could not activate', description: error.message, color: 'error' })
    return
  }

  await refreshSeasons()
  await refreshNuxtData('active-season')
  toast.add({ title: `${season.name} is now the active season`, color: 'success' })
}

useSeoMeta({ title: 'League admin' })
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="League admin"
      description="Set up the league, its seasons, teams and schedule."
    />

    <div class="mt-6 grid gap-4 sm:grid-cols-3">
      <UPageCard
        to="/admin/members"
        icon="i-lucide-users"
        title="Members"
        description="Assign bowlers to teams."
        variant="subtle"
      />
      <UPageCard
        to="/admin/teams"
        icon="i-lucide-shield"
        title="Teams"
        description="Create teams and name captains."
        variant="subtle"
      />
      <UPageCard
        to="/admin/schedule"
        icon="i-lucide-calendar-days"
        title="Schedule"
        description="Weeks, matchups and results."
        variant="subtle"
      />
    </div>

    <div class="mt-8 grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <h2 class="font-semibold">
            {{ league ? 'League details' : 'Create your league' }}
          </h2>
        </template>

        <form
          class="space-y-4"
          @submit.prevent="saveLeague"
        >
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="leagueForm.name"
              class="w-full"
              required
            />
          </UFormField>

          <UFormField label="Venue">
            <UInput
              v-model="leagueForm.venue"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField label="Night">
              <USelect
                v-model="leagueForm.day_of_week"
                :items="dayItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Start time">
              <UInput
                v-model="leagueForm.start_time"
                type="time"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Match fee per team ($)">
              <UInput
                v-model.number="leagueForm.match_fee_dollars"
                type="number"
                min="0"
                step="0.5"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField label="Description">
            <UTextarea
              v-model="leagueForm.description"
              class="w-full"
              :rows="2"
            />
          </UFormField>

          <UButton
            type="submit"
            :loading="savingLeague"
          >
            Save league
          </UButton>
        </form>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">
            Seasons
          </h2>
        </template>

        <ul
          v-if="seasons?.length"
          class="divide-y divide-default"
        >
          <li
            v-for="season in seasons"
            :key="season.id"
            class="flex items-center justify-between gap-4 py-2 text-sm"
          >
            <div>
              <span class="font-medium">{{ season.name }}</span>
              <span class="ml-2 text-muted">
                {{ formatBowlDate(season.starts_on) }}<span v-if="season.ends_on"> – {{ formatBowlDate(season.ends_on) }}</span>
              </span>
            </div>

            <UBadge
              v-if="season.is_active"
              color="success"
              variant="subtle"
            >
              Active
            </UBadge>
            <UButton
              v-else
              size="xs"
              color="neutral"
              variant="subtle"
              @click="activate(season)"
            >
              Make active
            </UButton>
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-muted"
        >
          No seasons yet.
        </p>

        <template #footer>
          <form
            class="grid gap-3 sm:grid-cols-4 sm:items-end"
            @submit.prevent="createSeason"
          >
            <UFormField
              label="Name"
              class="sm:col-span-2"
            >
              <UInput
                v-model="seasonForm.name"
                placeholder="Fall 2026"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Starts">
              <UInput
                v-model="seasonForm.starts_on"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UButton
              type="submit"
              :loading="creatingSeason"
              :disabled="!league"
            >
              Add season
            </UButton>
          </form>
        </template>
      </UCard>
    </div>
  </UContainer>
</template>
