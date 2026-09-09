<script setup lang="ts">
import type { Database, TeamStanding } from '~/types/database.types'

const client = useSupabaseClient<Database>()
const { data: season } = await useActiveSeason()

const { data: standings } = await useAsyncData<TeamStanding[]>('standings', async () => {
  if (!season.value) return []

  const { data } = await client
    .from('team_standings')
    .select('*')
    .eq('season_id', season.value.id)
    .order('points_won', { ascending: false })

  return data ?? []
}, { watch: [season], default: () => [] })

const columns = [
  { accessorKey: 'rank', header: '#' },
  { accessorKey: 'team_name', header: 'Team' },
  { accessorKey: 'matches_played', header: 'Played' },
  { accessorKey: 'points_won', header: 'Points won' },
  { accessorKey: 'points_lost', header: 'Points lost' }
]

const rows = computed(() =>
  (standings.value ?? []).map((row, index) => ({ ...row, rank: index + 1 }))
)

useSeoMeta({ title: 'Standings' })
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Standings"
      :description="season?.name"
    />

    <p
      v-if="!rows.length"
      class="py-10 text-center text-muted"
    >
      Standings appear once matches are marked complete.
    </p>

    <UTable
      v-else
      :data="rows"
      :columns="columns"
      class="mt-8"
    />
  </UContainer>
</template>
