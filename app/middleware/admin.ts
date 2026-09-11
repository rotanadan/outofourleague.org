import type { Database } from '~/types/database.types'

export default defineNuxtRouteMiddleware(async (to) => {
  const userId = useUserId()

  if (!userId.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  const client = useSupabaseClient<Database>()
  const { data } = await client
    .from('profiles')
    .select('role')
    .eq('id', userId.value)
    .maybeSingle()

  if (data?.role !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'This page is for league admins only.'
    })
  }
})
