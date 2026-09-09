<script setup lang="ts">
const user = useSupabaseUser()
const { data: season } = await useActiveSeason()
const seasonId = computed(() => season.value?.id)
const { data: weeks } = await useSeasonSchedule(seasonId)

const upcoming = computed(() => nextWeek(weeks.value ?? []))
const league = computed(() => season.value?.league ?? null)

const days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

const meetingTime = computed(() => {
  if (!league.value) return ''
  const day = league.value.day_of_week === null ? '' : days[league.value.day_of_week]
  const time = league.value.start_time?.slice(0, 5) ?? ''
  return [day, time && `at ${time}`, league.value.venue && `· ${league.value.venue}`]
    .filter(Boolean).join(' ')
})
</script>

<template>
  <div>
    <UPageHero
      :title="league?.name ?? 'Out of Our League'"
      :description="league?.description ?? 'Schedule, teams, standings and weekly dues in one place.'"
      :ui="{ container: 'py-16 sm:py-20' }"
    >
      <template #headline>
        <UBadge
          v-if="season"
          color="primary"
          variant="subtle"
          size="lg"
        >
          {{ season.name }}
        </UBadge>
      </template>

      <template #links>
        <UButton
          to="/schedule"
          size="lg"
          trailing-icon="i-lucide-arrow-right"
        >
          View the schedule
        </UButton>
        <UButton
          :to="user ? '/account' : '/login'"
          size="lg"
          color="neutral"
          variant="subtle"
        >
          {{ user ? 'My account' : 'Sign in' }}
        </UButton>
      </template>

      <p
        v-if="meetingTime"
        class="text-sm text-muted"
      >
        {{ meetingTime }}
      </p>
    </UPageHero>

    <UContainer class="pb-16">
      <div
        v-if="!season"
        class="text-center text-muted"
      >
        <p>No season is active yet. A league admin can start one from the admin pages.</p>
      </div>

      <div
        v-else
        class="grid gap-6 lg:grid-cols-3"
      >
        <div class="lg:col-span-2 space-y-4">
          <h2 class="text-lg font-semibold">
            Up next
          </h2>
          <WeekCard
            v-if="upcoming"
            :week="upcoming"
          />
          <p
            v-else
            class="text-muted"
          >
            The schedule hasn't been posted yet.
          </p>
        </div>

        <div class="space-y-4">
          <h2 class="text-lg font-semibold">
            Quick links
          </h2>
          <UPageCard
            to="/teams"
            icon="i-lucide-users"
            title="Teams & rosters"
            description="Who bowls with whom this season."
            variant="subtle"
          />
          <UPageCard
            to="/standings"
            icon="i-lucide-trophy"
            title="Standings"
            description="Points won and lost so far."
            variant="subtle"
          />
          <UPageCard
            to="/account"
            icon="i-lucide-wallet"
            :title="league?.weekly_fee_cents ? `Weekly dues — ${formatMoney(league.weekly_fee_cents)}` : 'Weekly dues'"
            description="Check what you owe and pay online."
            variant="subtle"
          />
        </div>
      </div>
    </UContainer>
  </div>
</template>
