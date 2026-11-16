export type AuthorizationAccount = {
  is_active: boolean
} | null

/**
 * A signed-in user may enter the application only when their account is active
 * and at least one role has been loaded from the database.
 *
 * This is a frontend navigation guard, not a replacement for Supabase RLS.
 */
export function hasAuthorizedAccess(
  account: AuthorizationAccount,
  roles: readonly string[],
): boolean {
  return account?.is_active === true && roles.length > 0
}
