import type { Database, Profile } from '~/types/database.types'

/**
 * The signed-in member's profile row, kept in sync with the auth user.
 * Shares one cache key, so calling this from several components is cheap.
 */
export function useProfile() {
  const userId = useUserId()
  const client = useSupabaseClient<Database>()

  const { data: profile, refresh, pending } = useAsyncData<Profile | null>(
    'current-profile',
    async () => {
      if (!userId.value) return null

      const { data } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId.value)
        .maybeSingle()

      return data
    },
    { watch: [userId] }
  )

  const isAdmin = computed(() => profile.value?.role === 'admin')

  return { profile, isAdmin, refresh, pending }
}
