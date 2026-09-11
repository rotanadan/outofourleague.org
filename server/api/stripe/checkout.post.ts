import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Start a Stripe Checkout session for one week's dues.
 *
 * The payment row is written with the service role (RLS keeps bowlers
 * read-only on `payments`) and is only marked paid by the webhook.
 */
export default defineEventHandler(async (event) => {
  const stripe = useStripe()
  if (!stripe) {
    throw createError({
      statusCode: 501,
      statusMessage: 'Online payments are not configured yet.'
    })
  }

  // `serverSupabaseUser` returns JWT claims, so the bowler's id is `sub`.
  const user = await serverSupabaseUser(event)
  const profileId = user?.sub
  if (!profileId) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in first.' })
  }

  const { weekId } = await readBody<{ weekId?: string }>(event)
  if (!weekId) {
    throw createError({ statusCode: 400, statusMessage: 'Which week?' })
  }

  const db = serverSupabaseServiceRole<Database>(event)

  const { data: week } = await db
    .from('weeks')
    .select('id, week_number, season_id, season:seasons(id, name, league:leagues(name, weekly_fee_cents))')
    .eq('id', weekId)
    .maybeSingle()

  if (!week) {
    throw createError({ statusCode: 404, statusMessage: 'That week does not exist.' })
  }

  const amountCents = week.season?.league?.weekly_fee_cents ?? 0
  if (amountCents <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'No weekly fee is set for this league.' })
  }

  // One live payment per bowler per week: reuse a pending row, refuse a paid one.
  const { data: existing } = await db
    .from('payments')
    .select('id, status')
    .eq('profile_id', profileId)
    .eq('week_id', week.id)
    .in('status', ['pending', 'paid'])
    .maybeSingle()

  if (existing?.status === 'paid') {
    throw createError({ statusCode: 409, statusMessage: 'That week is already paid.' })
  }

  let paymentId = existing?.id

  if (!paymentId) {
    const { data: created, error } = await db
      .from('payments')
      .insert({
        profile_id: profileId,
        season_id: week.season_id,
        week_id: week.id,
        amount_cents: amountCents
      })
      .select('id')
      .single()

    if (error || !created) {
      throw createError({ statusCode: 500, statusMessage: 'Could not record the payment.' })
    }

    paymentId = created.id
  }

  const siteUrl = useRuntimeConfig().public.siteUrl
  const leagueName = week.season?.league?.name ?? 'League'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: user.email,
    client_reference_id: paymentId,
    metadata: { payment_id: paymentId },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: amountCents,
        product_data: {
          name: `${leagueName} — week ${week.week_number} dues`,
          description: week.season?.name ?? undefined
        }
      }
    }],
    success_url: `${siteUrl}/account?paid=1`,
    cancel_url: `${siteUrl}/account`
  })

  await db
    .from('payments')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', paymentId)

  if (!session.url) {
    throw createError({ statusCode: 500, statusMessage: 'Stripe did not return a checkout URL.' })
  }

  return { url: session.url }
})
