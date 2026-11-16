import { describe, expect, it } from 'vitest'
import { hasAuthorizedAccess } from './authorization'

describe('hasAuthorizedAccess', () => {
  it('denies access when no application account exists', () => {
    expect(hasAuthorizedAccess(null, ['admin'])).toBe(false)
  })

  it('denies access when the account is inactive', () => {
    expect(hasAuthorizedAccess({ is_active: false }, ['admin'])).toBe(false)
  })

  it('denies access when an active account has no assigned roles', () => {
    expect(hasAuthorizedAccess({ is_active: true }, [])).toBe(false)
  })

  it('allows access when the account is active and has a database role', () => {
    expect(hasAuthorizedAccess({ is_active: true }, ['employee'])).toBe(true)
  })

  it('allows an active account with multiple assigned roles', () => {
    expect(hasAuthorizedAccess({ is_active: true }, ['hr_manager', 'recruiter'])).toBe(true)
  })
})
