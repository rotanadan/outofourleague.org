<script setup lang="ts">
// Landing page for the email sign-in link. The Supabase client picks the
// session out of the URL, then we forward the bowler to where they were going.
const user = useSupabaseUser()
const route = useRoute()

watchEffect(() => {
  if (user.value) {
    navigateTo((route.query.redirect as string) || '/account')
  }
})

useSeoMeta({ title: 'Signing you in' })
</script>

<template>
  <UContainer class="flex flex-col items-center gap-3 py-24 text-muted">
    <UIcon
      name="i-lucide-loader-circle"
      class="size-6 animate-spin"
    />
    <p>Signing you in…</p>
  </UContainer>
</template>
