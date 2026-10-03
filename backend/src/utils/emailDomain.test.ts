import { describe, expect, it } from 'vitest'
import { companyWebsiteFromEmail } from './emailDomain'

describe('companyWebsiteFromEmail', () => {
  it('returns the domain of a corporate email', () => {
    expect(companyWebsiteFromEmail('john@Acme.com')).toBe('acme.com')
  })

  it('returns null for generic providers', () => {
    expect(companyWebsiteFromEmail('john@gmail.com')).toBeNull()
  })

  it('returns null when there is no domain', () => {
    expect(companyWebsiteFromEmail('not-an-email')).toBeNull()
  })
})
