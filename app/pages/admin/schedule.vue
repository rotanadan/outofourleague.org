<script setup lang="ts">
import type { Database } from '~/types/database.types'

definePageMeta({ middleware: 'admin' })

const client = useSupabaseClient<Database>()
const toast = useToast()
const { data: season } = await useActiveSeason()
const seasonId = computed(() => season.value?.id)
const { data: weeks, refresh } = await useSeasonSchedule(seasonId)

const { data: teams } = await useAsyncData('admin-schedule-teams', async () => {
  if (!season.value) return []
  const { data } = await client.from('teams').select('id, name')
    .eq('season_id', season.value.id).order('name')
  return data ?? []
}, { watch: [season], default: () => [] })

const teamItems = computed(() =>
  (teams.value ?? []).map(team => ({ label: team.name, value: team.id }))
)

// Payments pin the match (and so the week) they were made for, so those can't
// be deleted once a team has paid anything toward them.
const HAS_PAYMENTS = { message: 'A team has made payments toward it, so it can\'t be deleted.' }

function fail(title: string, error: { message: string }) {
  toast.add({ title, description: error.message, color: 'error' })
}

// ------------------------------------------------------------------- weeks --
const newWeekDate = ref('')
const addingWeek = ref(false)

const nextWeekNumber = computed(() => {
  const numbers = (weeks.value ?? []).map(week => week.week_number)
  return numbers.length ? Math.max(...numbers) + 1 : 1
})

async function addWeek() {
  if (!season.value || !newWeekDate.value) return

  addingWeek.value = true
  const { error } = await client.from('weeks').insert({
    season_id: season.value.id,
    week_number: nextWeekNumber.value,
    bowl_date: newWeekDate.value
  })
  addingWeek.value = false

  if (error) return fail('Could not add the week', error)

  newWeekDate.value = ''
  await refresh()
}

async function deleteWeek(id: string, weekNumber: number) {
  if (!confirm(`Delete week ${weekNumber} and its matchups?`)) return

  const { error } = await client.from('weeks').delete().eq('id', id)
  if (error) return fail('Could not delete the week', error.code === '23503' ? HAS_PAYMENTS : error)
  await refresh()
}

// ----------------------------------------------------------------- matches --
const draft = reactive<Record<string, { home: string, away: string, lanes: string }>>({})

function draftFor(weekId: string) {
  if (!draft[weekId]) draft[weekId] = { home: '', away: '', lanes: '' }
  return draft[weekId]
}

async function addMatch(weekId: string) {
  const entry = draftFor(weekId)
  if (!season.value || !entry.home) return

  const { error } = await client.from('matches').insert({
    season_id: season.value.id,
    week_id: weekId,
    home_team_id: entry.home,
    away_team_id: entry.away || null,
    lanes: entry.lanes || null
  })

  if (error) return fail('Could not add the matchup', error)

  draft[weekId] = { home: '', away: '', lanes: '' }
  await refresh()
}

async function saveResult(matchId: string, home: number, away: number) {
  const { error } = await client.from('matches')
    .update({ home_points: home, away_points: away, status: 'completed' })
    .eq('id', matchId)

  if (error) return fail('Could not save the result', error)

  await refresh()
  await refreshNuxtData('standings')
  toast.add({ title: 'Result saved', color: 'success' })
}

async function deleteMatch(matchId: string) {
  const { error } = await client.from('matches').delete().eq('id', matchId)
  if (error) return fail('Could not delete the matchup', error.code === '23503' ? HAS_PAYMENTS : error)
  await refresh()
}

useSeoMeta({ title: 'Schedule · admin' })
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Schedule"
      :description="season?.name ?? 'No active season'"
    >
      <template #links>
        <UButton
          to="/admin"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
        >
          Admin
        </UButton>
      </template>
    </UPageHeader>

    <UAlert
      v-if="!season"
      class="mt-8"
      color="warning"
      variant="subtle"
      title="No active season"
      description="Create and activate a season on the admin home page first."
    />

    <template v-else>
      <form
        class="mt-8 flex flex-wrap items-end gap-2"
        @submit.prevent="addWeek"
      >
        <UFormField :label="`Week ${nextWeekNumber} — bowl date`">
          <UInput
            v-model="newWeekDate"
            type="date"
          />
        </UFormField>
        <UButton
          type="submit"
          :loading="addingWeek"
          icon="i-lucide-plus"
        >
          Add week
        </UButton>
      </form>

      <div class="mt-6 space-y-4">
        <UCard
          v-for="week in weeks"
          :key="week.id"
        >
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <h2 class="font-semibold">
                Week {{ week.week_number }}
                <span class="ml-2 font-normal text-muted">{{ formatBowlDate(week.bowl_date) }}</span>
              </h2>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                aria-label="Delete week"
                @click="deleteWeek(week.id, week.week_number)"
              />
            </div>
          </template>

          <ul class="divide-y divide-default">
            <li
              v-for="match in week.matches"
              :key="match.id"
              class="flex flex-wrap items-center gap-3 py-2 text-sm"
            >
              <UBadge
                v-if="match.lanes"
                color="neutral"
                variant="subtle"
              >
                {{ match.lanes }}
              </UBadge>
              <span class="flex-1 min-w-40">
                {{ match.home?.name }} <span class="text-muted">vs</span>
                {{ match.away?.name ?? 'bye' }}
              </span>

              <UInput
                :model-value="Number(match.home_points)"
                type="number"
                step="0.5"
                class="w-20"
                :ui="{ base: 'text-center' }"
                @change="saveResult(match.id, Number(($event.target as HTMLInputElement).value), Number(match.away_points))"
              />
              <UInput
                :model-value="Number(match.away_points)"
                type="number"
                step="0.5"
                class="w-20"
                :ui="{ base: 'text-center' }"
                @change="saveResult(match.id, Number(match.home_points), Number(($event.target as HTMLInputElement).value))"
              />

              <UBadge
                v-if="match.status === 'completed'"
                color="success"
                variant="subtle"
              >
                final
              </UBadge>

              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Remove matchup"
                @click="deleteMatch(match.id)"
              />
            </li>
          </ul>

          <template #footer>
            <form
              class="flex flex-wrap items-end gap-2"
              @submit.prevent="addMatch(week.id)"
            >
              <UFormField label="Home">
                <USelect
                  v-model="draftFor(week.id).home"
                  :items="teamItems"
                  value-key="value"
                  placeholder="Team"
                  class="w-44"
                />
              </UFormField>
              <UFormField label="Away">
                <USelect
                  v-model="draftFor(week.id).away"
                  :items="teamItems"
                  value-key="value"
                  placeholder="Bye"
                  class="w-44"
                />
              </UFormField>
              <UFormField label="Lanes">
                <UInput
                  v-model="draftFor(week.id).lanes"
                  placeholder="1-2"
                  class="w-24"
                />
              </UFormField>
              <UButton
                type="submit"
                color="neutral"
                variant="subtle"
                icon="i-lucide-plus"
              >
                Add matchup
              </UButton>
            </form>
          </template>
        </UCard>
      </div>

      <p
        v-if="!weeks?.length"
        class="mt-6 text-muted"
      >
        No weeks yet. Add the first bowl date above.
      </p>
    </template>
  </UContainer>
</template>
