<script setup lang="ts">
const { data: season } = await useActiveSeason()
const seasonId = computed(() => season.value?.id)
const { data: weeks } = await useSeasonSchedule(seasonId)

useSeoMeta({ title: 'Schedule' })
</script>

<template>
  <UContainer class="py-10">
    <UPageHeader
      title="Schedule"
      :description="season ? `${season.name} · ${weeks?.length ?? 0} weeks` : undefined"
    />

    <div
      v-if="!weeks?.length"
      class="py-10 text-center text-muted"
    >
      Nothing on the schedule yet.
    </div>

    <div
      v-else
      class="mt-8 grid gap-4 md:grid-cols-2"
    >
      <WeekCard
        v-for="week in weeks"
        :key="week.id"
        :week="week"
      />
    </div>
  </UContainer>
</template>
