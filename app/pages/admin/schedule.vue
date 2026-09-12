<script setup lang="ts">
import type { Database } from '~/types/database.types'
import type { MatchWithTeams } from '~/composables/useSchedule'

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

// Inline edit of a matchup's teams and lanes. The away select can't hold an
// empty value, so a bye is a sentinel item here and null in the database.
const BYE = 'bye'
const awayItems = computed(() => [{ label: 'Bye', value: BYE }, ...teamItems.value])

const editing = ref<{ id: string, home: string, away: string, lanes: string } | null>(null)
const savingEdit = ref(false)

function startEdit(match: MatchWithTeams) {
  editing.value = {
    id: match.id,
    home: match.home_team_id,
    away: match.away_team_id ?? BYE,
    lanes: match.lanes ?? ''
  }
}

async function saveEdit(match: MatchWithTeams) {
  const edit = editing.value
  if (!edit?.home) return

  const away = edit.away === BYE ? null : edit.away
  if (edit.home === away) {
    return fail('Could not update the matchup', { message: 'A team can\'t play itself.' })
  }

  savingEdit.value = true

  // Payments belong to a team for this match, so a team that has paid toward it
  // can't be swapped out or its money would no longer count toward anything.
  const removed = [match.home_team_id, match.away_team_id]
    .filter((id): id is string => !!id && id !== edit.home && id !== away)

  if (removed.length) {
    const { count, error } = await client.from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', match.id).in('team_id', removed).in('status', ['pending', 'paid'])

    if (error || count) {
      savingEdit.value = false
      return fail('Could not update the matchup', error ?? {
        message: 'A team being swapped out has made payments toward this match.'
      })
    }
  }

  const { error } = await client.from('matches')
    .update({ home_team_id: edit.home, away_team_id: away, lanes: edit.lanes || null })
    .eq('id', match.id)

  savingEdit.value = false

  if (error) return fail('Could not update the matchup', error)

  editing.value = null
  await refresh()
  await refreshNuxtData('standings')
}

// Undoes an accidental result: back to scheduled with the score cleared, so it
// drops out of the standings.
async function reopenMatch(matchId: string) {
  const { error } = await client.from('matches')
    .update({ home_points: 0, away_points: 0, status: 'scheduled' })
    .eq('id', matchId)

  if (error) return fail('Could not reopen the match', error)

  await refresh()
  await refreshNuxtData('standings')
  toast.add({ title: 'Match reopened', color: 'success' })
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
              <form
                v-if="editing?.id === match.id"
                class="flex flex-1 flex-wrap items-center gap-2"
                @submit.prevent="saveEdit(match)"
              >
                <USelect
                  v-model="editing.home"
                  :items="teamItems"
                  value-key="value"
                  aria-label="Home team"
                  class="w-44"
                />
                <span class="text-muted">vs</span>
                <USelect
                  v-model="editing.away"
                  :items="awayItems"
                  value-key="value"
                  aria-label="Away team"
                  class="w-44"
                />
                <UInput
                  v-model="editing.lanes"
                  placeholder="Lanes"
                  aria-label="Lanes"
                  class="w-24"
                />
                <UButton
                  type="submit"
                  size="xs"
                  :loading="savingEdit"
                >
                  Save
                </UButton>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="editing = null"
                >
                  Cancel
                </UButton>
              </form>

              <template v-else>
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
                  v-if="match.status === 'completed'"
                  icon="i-lucide-rotate-ccw"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="reopenMatch(match.id)"
                >
                  Reopen
                </UButton>

                <UButton
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Edit matchup"
                  @click="startEdit(match)"
                />
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="Remove matchup"
                  @click="deleteMatch(match.id)"
                />
              </template>
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
