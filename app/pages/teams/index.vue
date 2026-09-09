<script setup lang="ts">
import type { Database } from '~/types/database.types'

const client = useSupabaseClient<Database>()
const { data: season } = await useActiveSeason()

const { data: teams } = await useAsyncData('teams-list', async () => {
  if (!season.value) return []

  const { data } = await client
    .from('teams')
    .select('*, members:team_members(id, role, profile:profiles(id, full_name))')
    .eq('season_id', season.value.id)
    .order('name')

  return data ?? []
}, { watch: [season], default: () => [] })

useSeoMeta({ title: 'Teams' })
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Teams"
      :description="season?.name"
    />

    <div
      v-if="!teams?.length"
      class="py-10 text-center text-muted"
    >
      No teams yet this season.
    </div>

    <div
      v-else
      class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UCard
        v-for="team in teams"
        :key="team.id"
      >
        <template #header>
          <NuxtLink
            :to="`/teams/${team.id}`"
            class="font-semibold hover:text-primary"
          >
            {{ team.name }}
          </NuxtLink>
        </template>

        <ul
          v-if="team.members?.length"
          class="space-y-1 text-sm"
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
              v-if="member.role === 'sub'"
              size="sm"
              color="neutral"
              variant="subtle"
            >
              sub
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
    </div>
  </UContainer>
</template>
