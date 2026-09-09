<script setup lang="ts">
const client = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const toast = useToast()

const email = ref('')
const loading = ref(false)
const sent = ref(false)

const redirectTo = computed(() => (route.query.redirect as string) || '/account')

watchEffect(() => {
  if (user.value) navigateTo(redirectTo.value)
})

async function sendLink() {
  if (!email.value) return

  loading.value = true
  const { error } = await client.auth.signInWithOtp({
    email: email.value,
    options: {
      emailRedirectTo: `${window.location.origin}/confirm?redirect=${encodeURIComponent(redirectTo.value)}`
    }
  })
  loading.value = false

  if (error) {
    toast.add({ title: 'Could not send the link', description: error.message, color: 'error' })
    return
  }

  sent.value = true
}

useSeoMeta({ title: 'Sign in' })
</script>

<template>
  <UContainer class="flex justify-center py-16">
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="font-semibold">
          Sign in
        </h1>
        <p class="mt-1 text-sm text-muted">
          We'll email you a link — no password to remember.
        </p>
      </template>

      <UAlert
        v-if="sent"
        icon="i-lucide-mail-check"
        color="primary"
        variant="subtle"
        title="Check your email"
        :description="`We sent a sign-in link to ${email}.`"
      />

      <form
        v-else
        class="space-y-4"
        @submit.prevent="sendLink"
      >
        <UFormField
          label="Email"
          name="email"
          required
        >
          <UInput
            v-model="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full"
            required
          />
        </UFormField>

        <UButton
          type="submit"
          :loading="loading"
          block
        >
          Email me a link
        </UButton>
      </form>
    </UCard>
  </UContainer>
</template>
