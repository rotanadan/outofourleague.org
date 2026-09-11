<script setup lang="ts">
import type { Database, TeamMatchDue } from '~/types/database.types'

definePageMeta({ middleware: 'admin' })

const client = useSupabaseClient<Database>()
const toast = useToast()
const { data: season } = await useActiveSeason()

const { data: teams, refresh } = await useAsyncData('admin-teams', async () => {
  if (!season.value) return []

  const { data } = await client
    .from('teams')
    .select('*, members:team_members(id, role, profile:profiles(id, full_name))')
    .eq('season_id', season.value.id)
    .order('name')

  return data ?? []
}, { watch: [season], default: () => [] })

const { data: members } = await useAsyncData('admin-roster-options', async () => {
  if (!season.value) return []

  const { data } = await client
    .from('team_members')
    .select('profile_id, profile:profiles(id, full_name)')
    .eq('season_id', season.value.id)

  return data ?? []
}, { watch: [season], default: () => [] })

const newTeamName = ref('')
const creating = ref(false)

async function createTeam() {
  if (!season.value || !newTeamName.value.trim()) return

  creating.value = true
  const { error } = await client
    .from('teams')
    .insert({ season_id: season.value.id, name: newTeamName.value.trim() })
  creating.value = false

  if (error) {
    toast.add({ title: 'Could not create the team', description: error.message, color: 'error' })
    return
  }

  newTeamName.value = ''
  await refresh()
}

async function renameTeam(id: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return

  const { error } = await client.from('teams').update({ name: trimmed }).eq('id', id)
  if (error) {
    toast.add({ title: 'Could not rename', description: error.message, color: 'error' })
    return
  }
  await refresh()
}

async function setCaptain(teamId: string, profileId: string | null) {
  const { error } = await client.from('teams').update({ captain_id: profileId }).eq('id', teamId)
  if (error) {
    toast.add({ title: 'Could not set the captain', description: error.message, color: 'error' })
    return
  }

  // Keep the roster role in step with the captain field.
  if (profileId) {
    await client.from('team_members').update({ role: 'bowler' })
      .eq('team_id', teamId).eq('role', 'captain')
    await client.from('team_members').update({ role: 'captain' })
      .eq('team_id', teamId).eq('profile_id', profileId)
  }

  await refresh()
}

async function deleteTeam(id: string, name: string) {
  if (!confirm(`Delete ${name}? Its roster spots and matches go with it.`)) return

  const { error } = await client.from('teams').delete().eq('id', id)
  if (error) {
    // Payments pin their team, so a team that has paid anything stays.
    const description = error.code === '23503'
      ? `${name} has made payments, so it can't be deleted.`
      : error.message
    toast.add({ title: 'Could not delete', description, color: 'error' })
    return
  }
  await refresh()
}

function captainOptions(teamId: string) {
  const team = teams.value?.find(candidate => candidate.id === teamId)
  return (team?.members ?? []).map(member => ({
    label: member.profile?.full_name ?? 'Unnamed bowler',
    value: member.profile?.id as string
  }))
}

// Dues: one row per team per match, summarised per team for the cards.
const { data: dues } = await useAsyncData('admin-team-dues', async () => {
  if (!season.value) return []

  const { data } = await client
    .from('team_match_dues')
    .select('*')
    .eq('season_id', season.value.id)
    .order('week_number')

  return data ?? []
}, { watch: [season], default: () => [] })

const today = new Date().toISOString().slice(0, 10)

type DuesSummary = { rows: TeamMatchDue[], paid: number, remaining: number, overdue: number }

const duesByTeam = computed(() => {
  const summaries = new Map<string, DuesSummary>()
  for (const row of dues.value ?? []) {
    const summary = summaries.get(row.team_id) ?? { rows: [], paid: 0, remaining: 0, overdue: 0 }
    summary.rows.push(row)
    summary.paid += row.paid_cents
    summary.remaining += row.remaining_cents
    // Still owing for a match that's already been bowled.
    if (row.bowl_date < today) summary.overdue += row.remaining_cents
    summaries.set(row.team_id, summary)
  }
  return summaries
})

function dueColor(row: TeamMatchDue): 'success' | 'warning' | 'error' | 'neutral' {
  if (!row.fee_cents) return 'neutral'
  if (!row.remaining_cents) return 'success'
  if (row.bowl_date < today) return 'error'
  return row.paid_cents ? 'warning' : 'neutral'
}

function dueLabel(row: TeamMatchDue) {
  if (!row.fee_cents) return 'no dues'
  if (!row.remaining_cents) return 'paid'
  if (row.paid_cents) return `${formatMoney(row.paid_cents)} of ${formatMoney(row.fee_cents)}`
  return 'unpaid'
}

function dueDetail(row: TeamMatchDue) {
  const parts = [`${formatBowlDate(row.bowl_date)} vs ${row.opponent_name}`]
  if (row.remaining_cents) parts.push(`${formatMoney(row.remaining_cents)} left`)
  if (row.pending_cents) parts.push(`${formatMoney(row.pending_cents)} in progress`)
  return parts.join(' · ')
}

useSeoMeta({ title: 'Teams · admin' })
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Teams"
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
        class="mt-8 flex gap-2"
        @submit.prevent="createTeam"
      >
        <UInput
          v-model="newTeamName"
          placeholder="New team name"
          class="flex-1"
        />
        <UButton
          type="submit"
          :loading="creating"
          icon="i-lucide-plus"
        >
          Add team
        </UButton>
      </form>

      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <UCard
          v-for="team in teams"
          :key="team.id"
        >
          <template #header>
            <div class="flex items-center gap-2">
              <UInput
                :model-value="team.name"
                class="flex-1"
                @change="renameTeam(team.id, ($event.target as HTMLInputElement).value)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                aria-label="Delete team"
                @click="deleteTeam(team.id, team.name)"
              />
            </div>
          </template>

          <UFormField label="Captain">
            <USelect
              :model-value="team.captain_id ?? undefined"
              :items="captainOptions(team.id)"
              value-key="value"
              placeholder="No captain"
              class="w-full"
              @update:model-value="setCaptain(team.id, $event as string)"
            />
          </UFormField>

          <ul class="mt-4 space-y-1 text-sm">
            <li
              v-for="member in team.members"
              :key="member.id"
              class="flex items-center gap-2"
            >
              <UIcon
                :name="member.role === 'captain' ? 'i-lucide-star' : 'i-lucide-user'"
                class="size-4 text-muted"
              />
              {{ member.profile?.full_name ?? 'Unnamed bowler' }}
            </li>
            <li
              v-if="!team.members?.length"
              class="text-muted"
            >
              No bowlers yet — assign them on the
              <NuxtLink
                to="/admin/members"
                class="text-primary"
              >
                members
              </NuxtLink>
              page.
            </li>
          </ul>

          <template #footer>
            <div class="flex items-baseline justify-between gap-2 text-sm">
              <span class="font-medium">Dues</span>
              <span class="text-muted">
                {{ formatMoney(duesByTeam.get(team.id)?.paid) }} paid ·
                {{ formatMoney(duesByTeam.get(team.id)?.remaining) }} outstanding
              </span>
            </div>

            <p
              v-if="duesByTeam.get(team.id)?.overdue"
              class="mt-1 text-sm text-error"
            >
              {{ formatMoney(duesByTeam.get(team.id)?.overdue) }} overdue for matches already bowled
            </p>

            <ul
              v-if="duesByTeam.get(team.id)?.rows.length"
              class="mt-3 flex flex-wrap gap-1.5"
            >
              <li
                v-for="row in duesByTeam.get(team.id)?.rows"
                :key="row.match_id"
              >
                <UBadge
                  :color="dueColor(row)"
                  variant="subtle"
                  :title="dueDetail(row)"
                >
                  Wk {{ row.week_number }} · {{ dueLabel(row) }}
                </UBadge>
              </li>
            </ul>
            <p
              v-else
              class="mt-2 text-sm text-muted"
            >
              No matches scheduled.
            </p>
          </template>
        </UCard>
      </div>

      <p
        v-if="!teams?.length"
        class="mt-6 text-muted"
      >
        No teams yet. Add the first one above.
      </p>

      <p
        v-if="!members?.length"
        class="mt-6 text-sm text-muted"
      >
        Tip: bowlers appear as captain options once they're on the team's roster.
      </p>
    </template>
  </UContainer>
</template>
