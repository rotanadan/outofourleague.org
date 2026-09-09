<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { profile, isAdmin } = useProfile()

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: { lang: 'en' }
})

const title = 'Out of Our League'
const description = 'Schedule, teams, standings and dues for the Out of Our League bowling league.'

useSeoMeta({
  title,
  titleTemplate: chunk => (chunk === title ? chunk : `${chunk} · ${title}`),
  description,
  ogTitle: title,
  ogDescription: description
})

const links: NavigationMenuItem[] = [
  { label: 'Schedule', to: '/schedule', icon: 'i-lucide-calendar-days' },
  { label: 'Teams', to: '/teams', icon: 'i-lucide-users' },
  { label: 'Standings', to: '/standings', icon: 'i-lucide-trophy' }
]

const userMenu = computed(() => [[
  {
    label: profile.value?.full_name || user.value?.email || 'Account',
    type: 'label' as const
  }
], [
  { label: 'My account', icon: 'i-lucide-user', to: '/account' },
  ...(isAdmin.value
    ? [{ label: 'League admin', icon: 'i-lucide-settings', to: '/admin' }]
    : [])
], [
  { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => signOut() }
]])

async function signOut() {
  await client.auth.signOut()
  await navigateTo('/')
}
</script>

<template>
  <UApp>
    <UHeader :ui="{ center: 'hidden' }">
      <template #title>
        <NuxtLink
          to="/"
          class="flex items-center gap-2 font-bold"
        >
          <UIcon
            name="i-lucide-circle-dot"
            class="size-6 text-primary"
          />
          <span>Out of Our League</span>
        </NuxtLink>
      </template>

      <UNavigationMenu :items="links" />

      <template #right>
        <UColorModeButton />

        <UDropdownMenu
          v-if="user"
          :items="userMenu"
        >
          <UButton
            icon="i-lucide-circle-user"
            color="neutral"
            variant="ghost"
            aria-label="Account menu"
          />
        </UDropdownMenu>

        <UButton
          v-else
          to="/login"
          color="neutral"
          variant="subtle"
        >
          Sign in
        </UButton>
      </template>

      <template #body>
        <UNavigationMenu
          :items="links"
          orientation="vertical"
        />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <USeparator />

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          Out of Our League · © {{ new Date().getFullYear() }}
        </p>
      </template>
    </UFooter>
  </UApp>
</template>
