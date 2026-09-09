import Stripe from 'stripe'

let client: Stripe | null = null

/**
 * The Stripe client, or null when no secret key is configured — the rest of the
 * site works fine without payments turned on.
 */
export function useStripe(): Stripe | null {
  if (client) return client

  const { stripe } = useRuntimeConfig()
  if (!stripe.secretKey) return null

  client = new Stripe(stripe.secretKey)
  return client
}
