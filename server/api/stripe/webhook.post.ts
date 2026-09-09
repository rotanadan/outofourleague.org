import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Stripe webhook — the only thing that marks dues as paid.
 *
 * Point Stripe at POST /api/stripe/webhook and subscribe to
 * checkout.session.completed, checkout.session.expired and
 * checkout.session.async_payment_failed.
 */
export default defineEventHandler(async (event) => {
  const stripe = useStripe()
  const { stripe: config } = useRuntimeConfig()

  if (!stripe || !config.webhookSecret) {
    throw createError({ statusCode: 501, statusMessage: 'Stripe webhooks are not configured.' })
  }

  const signature = getHeader(event, 'stripe-signature')
  const rawBody = await readRawBody(event)

  if (!signature || !rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Missing signature or body.' })
  }

  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Signature verification failed.' })
  }

  const db = serverSupabaseServiceRole<Database>(event)

  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object
      const paymentId = session.metadata?.payment_id ?? session.client_reference_id
      if (!paymentId) break

      await db.from('payments').update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null
      }).eq('id', paymentId)

      break
    }

    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const session = stripeEvent.data.object
      const paymentId = session.metadata?.payment_id ?? session.client_reference_id
      if (!paymentId) break

      // Frees the week up for another attempt (see payments_one_settled_per_week).
      await db.from('payments').update({ status: 'failed' }).eq('id', paymentId)
      break
    }
  }

  return { received: true }
})
