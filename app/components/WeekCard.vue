<script setup lang="ts">
import type { WeekWithMatches } from '~/composables/useSchedule'

defineProps<{ week: WeekWithMatches }>()
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-baseline justify-between gap-4">
        <h3 class="font-semibold">
          Week {{ week.week_number }}
        </h3>
        <p class="text-sm text-muted">
          {{ formatBowlDate(week.bowl_date) }}
        </p>
      </div>
    </template>

    <p
      v-if="!week.matches.length"
      class="text-sm text-muted"
    >
      No matchups posted yet.
    </p>

    <ul
      v-else
      class="divide-y divide-default"
    >
      <li
        v-for="match in week.matches"
        :key="match.id"
        class="flex items-center gap-3 py-2 text-sm"
      >
        <UBadge
          v-if="match.lanes"
          color="neutral"
          variant="subtle"
          class="shrink-0"
        >
          Lanes {{ match.lanes }}
        </UBadge>

        <div class="flex flex-1 items-center gap-2 min-w-0">
          <NuxtLink
            v-if="match.home"
            :to="`/teams/${match.home.id}`"
            class="truncate hover:text-primary"
          >
            {{ match.home.name }}
          </NuxtLink>
          <span class="text-muted">vs</span>
          <NuxtLink
            v-if="match.away"
            :to="`/teams/${match.away.id}`"
            class="truncate hover:text-primary"
          >
            {{ match.away.name }}
          </NuxtLink>
          <span
            v-else
            class="text-muted italic"
          >bye</span>
        </div>

        <span
          v-if="match.status === 'completed'"
          class="shrink-0 font-medium tabular-nums"
        >
          {{ match.home_points }} – {{ match.away_points }}
        </span>
      </li>
    </ul>

    <p
      v-if="week.notes"
      class="mt-3 text-sm text-muted"
    >
      {{ week.notes }}
    </p>
  </UCard>
</template>
