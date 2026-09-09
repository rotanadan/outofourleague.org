import type { Database, League, Season } from '~/types/database.types'

export type ActiveSeason = Season & { league: League | null }

/** The season currently being bowled, with its league. */
export function useActiveSeason() {
  const client = useSupabaseClient<Database>()

  return useAsyncData<ActiveSeason | null>('active-season', async () => {
    const { data } = await client
      .from('seasons')
      .select('*, league:leagues(*)')
      .eq('is_active', true)
      .order('starts_on', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data as ActiveSeason | null
  })
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC'
})

/** Format a `date` column (YYYY-MM-DD) without tripping over local time zones. */
export function formatBowlDate(value: string | null | undefined) {
  if (!value) return ''
  return dateFormat.format(new Date(`${value}T00:00:00Z`))
}

export function formatMoney(cents: number | null | undefined, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase()
  }).format((cents ?? 0) / 100)
}
