/**
 * The signed-in bowler's id, for `profiles.id` / `profile_id` lookups.
 *
 * `useSupabaseUser()` returns the JWT claims, not a `User` row, so the id
 * lives on `sub`. Claims carry an index signature, which means a `.id` typo
 * type-checks and then reaches PostgREST as the string "undefined" — go
 * through here instead of reading the claim directly.
 */
export function useUserId() {
  const user = useSupabaseUser()
  return computed(() => user.value?.sub ?? null)
}
