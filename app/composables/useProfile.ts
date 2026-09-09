import type { Database, Profile } from '~/types/database.types'

/**
 * The signed-in member's profile row, kept in sync with the auth user.
 * Shares one cache key, so calling this from several components is cheap.
 */
export function useProfile() {
  const user = useSupabaseUser()
  const client = useSupabaseClient<Database>()

  const { data: profile, refresh, pending } = useAsyncData<Profile | null>(
    'current-profile',
    async () => {
      if (!user.value) return null

      const { data } = await client
        .from('profiles')
        .select('*')
        .eq('id', user.value.id)
        .maybeSingle()

      return data
    },
    { watch: [user] }
  )

  const isAdmin = computed(() => profile.value?.role === 'admin')

  return { profile, isAdmin, refresh, pending }
}
