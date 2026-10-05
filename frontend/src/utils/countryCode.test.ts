import { describe, it, expect } from 'vitest'
import { isValidCountryCode, normalizeCountryCode } from './countryCode'
import { ISO_COUNTRY_CODES } from './isoCountryCodes'

describe('ISO_COUNTRY_CODES', () => {
  it('contains the 249 ISO 3166-1 alpha-2 codes', () => {
    expect(ISO_COUNTRY_CODES.size).toBe(249)
  })
})

describe('normalizeCountryCode', () => {
  it('uppercases and trims', () => {
    expect(normalizeCountryCode(' es ')).toBe('ES')
  })

  it('returns null for empty or missing values', () => {
    expect(normalizeCountryCode('')).toBeNull()
    expect(normalizeCountryCode('   ')).toBeNull()
    expect(normalizeCountryCode(undefined)).toBeNull()
    expect(normalizeCountryCode(null)).toBeNull()
  })
})

describe('isValidCountryCode', () => {
  it('accepts existing codes, case-insensitive', () => {
    expect(isValidCountryCode('ES')).toBe(true)
    expect(isValidCountryCode('us')).toBe(true)
    expect(isValidCountryCode(' KI ')).toBe(true)
  })

  it('accepts missing country', () => {
    expect(isValidCountryCode('')).toBe(true)
    expect(isValidCountryCode(undefined)).toBe(true)
    expect(isValidCountryCode(null)).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isValidCountryCode('XXX')).toBe(false)
    expect(isValidCountryCode('12')).toBe(false)
    expect(isValidCountryCode('ZZ')).toBe(false)
    expect(isValidCountryCode('E')).toBe(false)
  })
})
