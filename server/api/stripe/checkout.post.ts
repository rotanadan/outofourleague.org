import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

// Stripe won't take a card payment under 50 cents.
const MIN_AMOUNT_CENTS = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// What `reserve_team_payment` raises, in words a bowler can act on.
const RESERVE_ERRORS: Record<string, { statusCode: number, statusMessage: string }> = {
  invalid_amount: { statusCode: 400, statusMessage: 'Enter an amount to pay.' },
  not_on_a_team_in_match: { statusCode: 403, statusMessage: 'You can only pay toward your own team\'s matches.' },
  nothing_owed: { statusCode: 409, statusMessage: 'Nothing is owed for that match.' },
  already_paid: { statusCode: 409, statusMessage: 'Your team has already paid for that match.' },
  payment_in_progress: {
    statusCode: 409,
    statusMessage: 'A teammate is paying the rest right now. Check back in a few minutes.'
  },
  over_balance: { statusCode: 409, statusMessage: 'That\'s more than your team still owes for the match.' }
}

/**
 * Start a Stripe Checkout session toward the caller's team balance for a match.
 *
 * Each team owes the league's match fee for every match it plays, and anyone
 * on the team can pay any part of what's left. `reserve_team_payment` writes
 * the pending payment row under a lock, so teammates paying at the same moment
 * can't go over the fee between them. Only the webhook marks it paid.
 */
export default defineEventHandler(async (event) => {
  // `serverSupabaseUser` returns JWT claims, so the bowler's id is `sub`.
  const user = await serverSupabaseUser(event)
  const profileId = user?.sub
  if (!profileId) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in first.' })
  }

  const { matchId, amountCents } = (await readBody<{ matchId?: string, amountCents?: number } | null>(event)) ?? {}
  if (!matchId || !UUID.test(matchId)) {
    throw createError({ statusCode: 400, statusMessage: 'Which match?' })
  }
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents < MIN_AMOUNT_CENTS) {
    throw createError({ statusCode: 400, statusMessage: 'Pay at least $0.50.' })
  }

  const stripe = useStripe()
  if (!stripe) {
    throw createError({
      statusCode: 501,
      statusMessage: 'Online payments are not configured yet.'
    })
  }

  const db = serverSupabaseServiceRole<Database>(event)

  const { data: payment, error: reserveError } = await db.rpc('reserve_team_payment', {
    p_profile_id: profileId,
    p_match_id: matchId,
    p_amount_cents: amountCents
  })

  if (reserveError || !payment) {
    throw createError(RESERVE_ERRORS[reserveError?.message ?? '']
      ?? { statusCode: 500, statusMessage: 'Could not start the payment.' })
  }

  const [{ data: due }, { data: season }] = await Promise.all([
    db.from('team_match_dues')
      .select('week_number, team_name, opponent_name')
      .eq('team_id', payment.team_id)
      .eq('match_id', payment.match_id)
      .maybeSingle(),
    db.from('seasons')
      .select('name, league:leagues(name)')
      .eq('id', payment.season_id)
      .maybeSingle()
  ])

  const siteUrl = useRuntimeConfig().public.siteUrl
  const leagueName = season?.league?.name ?? 'League'

  let session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      client_reference_id: payment.id,
      metadata: { payment_id: payment.id },
      // Close before the reservation lapses (35 minutes; see team_match_dues).
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: `${leagueName} — ${due?.team_name ?? 'team'} dues, week ${due?.week_number ?? '?'}`,
            description: [due && `vs ${due.opponent_name}`, season?.name].filter(Boolean).join(' · ') || undefined
          }
        }
      }],
      success_url: `${siteUrl}/account?paid=1`,
      cancel_url: `${siteUrl}/account`
    })
  } catch {
    // Release the hold now rather than making the team wait out the window.
    await db.from('payments').update({ status: 'failed' }).eq('id', payment.id)
    throw createError({ statusCode: 502, statusMessage: 'Stripe could not start the checkout. Try again.' })
  }

  await db
    .from('payments')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', payment.id)

  if (!session.url) {
    throw createError({ statusCode: 500, statusMessage: 'Stripe did not return a checkout URL.' })
  }

  return { url: session.url }
})
