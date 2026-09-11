<script setup lang="ts">
import type { Database, MemberRole, TeamRole } from '~/types/database.types'

definePageMeta({ middleware: 'admin' })

const client = useSupabaseClient<Database>()
const toast = useToast()
const { data: season } = await useActiveSeason()

const { data: rows, refresh } = await useAsyncData('admin-members', async () => {
  const { data: profiles } = await client
    .from('profiles')
    .select('*')
    .order('full_name', { nullsFirst: false })

  if (!season.value) {
    return (profiles ?? []).map(profile => ({ profile, teamId: null as string | null, teamRole: 'bowler' as TeamRole }))
  }

  const { data: memberships } = await client
    .from('team_members')
    .select('profile_id, team_id, role')
    .eq('season_id', season.value.id)

  const byProfile = new Map((memberships ?? []).map(row => [row.profile_id, row]))

  return (profiles ?? []).map(profile => ({
    profile,
    teamId: byProfile.get(profile.id)?.team_id ?? null,
    teamRole: (byProfile.get(profile.id)?.role ?? 'bowler') as TeamRole
  }))
}, { watch: [season], default: () => [] })

const { data: teams } = await useAsyncData('admin-member-teams', async () => {
  if (!season.value) return []
  const { data } = await client.from('teams').select('id, name')
    .eq('season_id', season.value.id).order('name')
  return data ?? []
}, { watch: [season], default: () => [] })

// Taking a bowler off a team needs a real option in the list, and Reka UI
// rejects an empty-string value (it reserves that for "cleared"), so the
// no-team choice carries a sentinel. Team ids are uuids, so it can't collide.
const UNASSIGNED = 'none'

const teamItems = computed(() => [
  { label: 'Unassigned', value: UNASSIGNED },
  ...(teams.value ?? []).map(team => ({ label: team.name, value: team.id }))
])

const roleItems: { label: string, value: TeamRole }[] = [
  { label: 'Bowler', value: 'bowler' },
  { label: 'Captain', value: 'captain' },
  { label: 'Sub', value: 'sub' }
]

async function assignTeam(profileId: string, teamId: string) {
  if (!season.value) return

  const { error } = teamId && teamId !== UNASSIGNED
    ? await client.from('team_members').upsert(
        { season_id: season.value.id, profile_id: profileId, team_id: teamId },
        { onConflict: 'season_id,profile_id' }
      )
    : await client.from('team_members').delete()
        .eq('season_id', season.value.id).eq('profile_id', profileId)

  if (error) {
    toast.add({ title: 'Could not update the roster', description: error.message, color: 'error' })
    return
  }

  await refresh()
}

async function setTeamRole(profileId: string, role: TeamRole) {
  if (!season.value) return

  const { error } = await client.from('team_members').update({ role })
    .eq('season_id', season.value.id).eq('profile_id', profileId)

  if (error) {
    toast.add({ title: 'Could not update the role', description: error.message, color: 'error' })
    return
  }

  await refresh()
}

async function setAdmin(profileId: string, isAdmin: boolean) {
  const role: MemberRole = isAdmin ? 'admin' : 'member'
  const { error } = await client.from('profiles').update({ role }).eq('id', profileId)

  if (error) {
    toast.add({ title: 'Could not change admin access', description: error.message, color: 'error' })
    return
  }

  await refresh()
}

useSeoMeta({ title: 'Members · admin' })
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Members"
      :description="season ? `Assign bowlers to teams for ${season.name}.` : 'No active season'"
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

    <p class="mt-4 text-sm text-muted">
      Members appear here after they sign in for the first time.
    </p>

    <div class="mt-6 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr class="border-b border-default">
            <th class="py-2 pr-4 font-medium">
              Bowler
            </th>
            <th class="py-2 pr-4 font-medium">
              Team
            </th>
            <th class="py-2 pr-4 font-medium">
              Roster role
            </th>
            <th class="py-2 font-medium">
              League admin
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.profile.id"
            class="border-b border-default"
          >
            <td class="py-2 pr-4">
              <div class="font-medium">
                {{ row.profile.full_name ?? '—' }}
              </div>
              <div class="text-muted">
                {{ row.profile.email }}
              </div>
            </td>
            <td class="py-2 pr-4">
              <USelect
                :model-value="row.teamId ?? UNASSIGNED"
                :items="teamItems"
                value-key="value"
                :disabled="!season"
                class="w-48"
                @update:model-value="assignTeam(row.profile.id, $event as string)"
              />
            </td>
            <td class="py-2 pr-4">
              <USelect
                :model-value="row.teamRole"
                :items="roleItems"
                value-key="value"
                :disabled="!row.teamId"
                class="w-36"
                @update:model-value="setTeamRole(row.profile.id, $event as TeamRole)"
              />
            </td>
            <td class="py-2">
              <USwitch
                :model-value="row.profile.role === 'admin'"
                @update:model-value="setAdmin(row.profile.id, $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <p
        v-if="!rows?.length"
        class="py-8 text-center text-muted"
      >
        No members yet.
      </p>
    </div>
  </UContainer>
</template>
