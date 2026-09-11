import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Invite a bowler by email. Public sign-up is off (`enable_signup = false`),
 * so this is the only way new members get an account.
 *
 * Inviting creates the auth user straight away and the `on_auth_user_created`
 * trigger gives them a profile, so they show up on /admin/members — and can be
 * put on a team — before they have opened the email.
 */
export default defineEventHandler(async (event) => {
  // `serverSupabaseUser` returns JWT claims, so the caller's id is `sub`.
  const user = await serverSupabaseUser(event)
  if (!user?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in first.' })
  }

  const db = serverSupabaseServiceRole<Database>(event)

  const { data: caller } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.sub)
    .maybeSingle()

  if (caller?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Only league admins can invite members.' })
  }

  const body = (await readBody<{ email?: string, fullName?: string } | null>(event)) ?? {}
  const email = body.email?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address.' })
  }
  const fullName = body.fullName?.trim()

  const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined
  })

  if (error) {
    if (error.code === 'email_exists') {
      throw createError({ statusCode: 409, statusMessage: 'That email already has an account.' })
    }
    throw createError({ statusCode: error.status ?? 500, statusMessage: error.message })
  }

  return { id: data.user.id }
})
