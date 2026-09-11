<script setup lang="ts">
// Landing page for emailed links. Sign-in links carry a PKCE `code` that the
// Supabase client exchanges on its own. Invites are sent server-side, so there
// is no PKCE verifier in this browser — the invite template links here with a
// `token_hash` instead, which we redeem. Either way, once there's a user we
// forward the bowler on.
const client = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

const failed = ref<string | null>(null)

watchEffect(() => {
  if (user.value) {
    navigateTo((route.query.redirect as string) || '/account')
  }
})

onMounted(async () => {
  // Expired or already-used links come back with the reason in the hash.
  const hashError = new URLSearchParams(route.hash.slice(1)).get('error_description')
  if (hashError) {
    failed.value = hashError
    return
  }

  const tokenHash = route.query.token_hash
  if (typeof tokenHash === 'string' && route.query.type === 'invite') {
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' })
    if (error) failed.value = error.message
  }
})

useSeoMeta({ title: 'Signing you in' })
</script>

<template>
  <UContainer class="flex justify-center py-24">
    <UCard
      v-if="failed"
      class="w-full max-w-md"
    >
      <UAlert
        icon="i-lucide-circle-alert"
        color="error"
        variant="subtle"
        title="That link didn't work"
        :description="`${failed} Links can only be used once and expire after an hour.`"
      />

      <template #footer>
        <p class="text-sm text-muted">
          Already accepted an invite? <ULink
            to="/login"
            class="font-medium text-primary"
          >
            Request a new sign-in link
          </ULink>. Otherwise ask a league admin to resend your invite.
        </p>
      </template>
    </UCard>

    <div
      v-else
      class="flex flex-col items-center gap-3 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin"
      />
      <p>Signing you in…</p>
    </div>
  </UContainer>
</template>
