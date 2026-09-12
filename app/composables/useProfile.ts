import type { Database, Profile } from '~/types/database.types'

/**
 * The signed-in member's profile row, kept in sync with the auth user.
 * Shares one cache key per bowler, so calling this from several components is
 * cheap.
 */
export function useProfile() {
  const userId = useUserId()
  const client = useSupabaseClient<Database>()

  // Keyed by bowler rather than a fixed key: the `null` fetched while signed
  // out would otherwise still be cached under that key after signing in, and
  // the page landed on from an email link would render empty. `defer` makes a
  // component mounting while the fetch is in flight wait for it instead of
  // cancelling it and falling back to that same stale value.
  const key = computed(() => `profile:${userId.value ?? 'signed-out'}`)

  const { data: profile, refresh, pending } = useAsyncData<Profile | null>(
    key,
    async () => {
      if (!userId.value) return null

      const { data } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId.value)
        .maybeSingle()

      return data
    },
    { dedupe: 'defer' }
  )

  const isAdmin = computed(() => profile.value?.role === 'admin')

  return { profile, isAdmin, refresh, pending }
}
