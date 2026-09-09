// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/supabase'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    stripe: {
      // NUXT_STRIPE_SECRET_KEY / NUXT_STRIPE_WEBHOOK_SECRET
      secretKey: '',
      webhookSecret: ''
    },
    public: {
      siteUrl: 'http://localhost:3000',
      stripe: {
        // NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        publishableKey: ''
      }
    }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  supabase: {
    // Most of the site (schedule, teams, standings) is public, so route
    // protection is opt-in via the `auth` and `admin` middleware instead of a
    // global redirect.
    redirect: false,
    types: '~/types/database.types.ts'
  }
})
