<script setup lang="ts">
import type { Database } from '~/types/database.types'

const route = useRoute()
const client = useSupabaseClient<Database>()
const teamId = computed(() => route.params.id as string)

const { data: team } = await useAsyncData(`team-${teamId.value}`, async () => {
  const { data } = await client
    .from('teams')
    .select('*, members:team_members(id, role, profile:profiles(id, full_name)), season:seasons(id, name)')
    .eq('id', teamId.value)
    .maybeSingle()

  return data
})

if (!team.value) {
  throw createError({ statusCode: 404, statusMessage: 'Team not found', fatal: true })
}

const seasonId = computed(() => team.value?.season?.id)
const { data: weeks } = await useSeasonSchedule(seasonId)

const teamWeeks = computed(() =>
  (weeks.value ?? [])
    .map(week => ({
      ...week,
      matches: week.matches.filter(
        match => match.home_team_id === teamId.value || match.away_team_id === teamId.value
      )
    }))
    .filter(week => week.matches.length)
)

useSeoMeta({ title: () => team.value?.name ?? 'Team' })
</script>

<template>
  <UContainer
    v-if="team"
    class="py-10"
  >
    <UPageHeader
      :title="team.name"
      :description="team.season?.name"
    >
      <template #links>
        <UButton
          to="/teams"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
        >
          All teams
        </UButton>
      </template>
    </UPageHeader>

    <div class="mt-8 grid gap-6 lg:grid-cols-3">
      <UCard class="lg:col-span-1">
        <template #header>
          <h2 class="font-semibold">
            Roster
          </h2>
        </template>

        <ul
          v-if="team.members?.length"
          class="space-y-2 text-sm"
        >
          <li
            v-for="member in team.members"
            :key="member.id"
            class="flex items-center gap-2"
          >
            <UIcon
              :name="member.role === 'captain' ? 'i-lucide-star' : 'i-lucide-user'"
              class="size-4 text-muted"
            />
            <span>{{ member.profile?.full_name ?? 'Unnamed bowler' }}</span>
            <UBadge
              v-if="member.role !== 'bowler'"
              size="sm"
              color="neutral"
              variant="subtle"
            >
              {{ member.role }}
            </UBadge>
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-muted"
        >
          No bowlers assigned yet.
        </p>
      </UCard>

      <div class="lg:col-span-2 space-y-4">
        <h2 class="font-semibold">
          Matches
        </h2>
        <WeekCard
          v-for="week in teamWeeks"
          :key="week.id"
          :week="week"
        />
        <p
          v-if="!teamWeeks.length"
          class="text-sm text-muted"
        >
          No matches scheduled yet.
        </p>
      </div>
    </div>
  </UContainer>
</template>
