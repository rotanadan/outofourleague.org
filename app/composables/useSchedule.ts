import type { Ref } from 'vue'
import type { Database, Match, Team, Week } from '~/types/database.types'

export type MatchWithTeams = Match & { home: Team | null, away: Team | null }
export type WeekWithMatches = Week & { matches: MatchWithTeams[] }

/**
 * Weeks of a season, each with its matches and the team rows resolved.
 *
 * Matches reference `teams` twice, so PostgREST needs a disambiguating hint to
 * embed them; fetching the season's teams once and joining here is simpler and
 * a league is only ever a handful of teams.
 */
export function useSeasonSchedule(seasonId: Ref<string | undefined | null>) {
  const client = useSupabaseClient<Database>()

  return useAsyncData<WeekWithMatches[]>(
    'season-schedule',
    async () => {
      if (!seasonId.value) return []

      const [weeks, matches, teams] = await Promise.all([
        client.from('weeks').select('*').eq('season_id', seasonId.value)
          .order('week_number'),
        client.from('matches').select('*').eq('season_id', seasonId.value),
        client.from('teams').select('*').eq('season_id', seasonId.value)
      ])

      const teamById = new Map((teams.data ?? []).map(team => [team.id, team]))

      return (weeks.data ?? []).map(week => ({
        ...week,
        matches: (matches.data ?? [])
          .filter(match => match.week_id === week.id)
          .map(match => ({
            ...match,
            home: teamById.get(match.home_team_id) ?? null,
            away: match.away_team_id ? teamById.get(match.away_team_id) ?? null : null
          }))
          .sort((a, b) => (a.lanes ?? '').localeCompare(b.lanes ?? '', undefined, { numeric: true }))
      }))
    },
    { watch: [seasonId], default: () => [] }
  )
}

/** The next week still to be bowled, falling back to the most recent one. */
export function nextWeek(weeks: WeekWithMatches[]) {
  const today = new Date().toISOString().slice(0, 10)
  return weeks.find(week => week.bowl_date >= today) ?? weeks.at(-1) ?? null
}
