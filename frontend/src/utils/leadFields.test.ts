import { describe, it, expect } from 'vitest'
import { fieldKeyForHeader, parseLead } from './leadFields'

const base = { firstName: 'John', lastName: 'Doe', email: 'john@example.com' }

describe('fieldKeyForHeader', () => {
  it('resolves canonical names and aliases regardless of case and separators', () => {
    expect(fieldKeyForHeader('phone')).toBe('phone')
    expect(fieldKeyForHeader('Phone Number')).toBe('phone')
    expect(fieldKeyForHeader('phone_number')).toBe('phone')
    expect(fieldKeyForHeader('yearsAtCompany')).toBe('yearsAtCompany')
    expect(fieldKeyForHeader('yearsInRole')).toBe('yearsAtCompany')
    expect(fieldKeyForHeader('linkedin')).toBe('linkedinUrl')
    expect(fieldKeyForHeader('LinkedIn URL')).toBe('linkedinUrl')
    expect(fieldKeyForHeader('unknown')).toBeUndefined()
  })
})

describe('parseLead', () => {
  it('requires firstName, lastName and a valid email', () => {
    expect(parseLead({}).errors).toEqual([
      'First name is required',
      'Last name is required',
      'Email is required',
    ])
    expect(parseLead({ ...base, email: 'nope' }).errors).toEqual(['Invalid email format'])
  })

  it('turns missing optional fields into null', () => {
    const { values, errors } = parseLead(base)
    expect(errors).toEqual([])
    expect(values.phone).toBeNull()
    expect(values.yearsAtCompany).toBeNull()
    expect(values.linkedinUrl).toBeNull()
  })

  describe('yearsAtCompany', () => {
    it.each([
      ['0', 0],
      ['7', 7],
      [3, 3],
    ])('accepts %s', (input, expected) => {
      const { values, errors } = parseLead({ ...base, yearsAtCompany: input })
      expect(errors).toEqual([])
      expect(values.yearsAtCompany).toBe(expected)
    })

    it.each(['-1', '2.5', 'abc', '1e3'])('rejects %s', (input) => {
      const { values, errors } = parseLead({ ...base, yearsAtCompany: input })
      expect(errors).toEqual(['Years at company must be a whole number >= 0'])
      expect(values.yearsAtCompany).toBeNull()
    })
  })

  describe('linkedinUrl', () => {
    it('accepts linkedin.com urls, adding https when missing', () => {
      expect(
        parseLead({ ...base, linkedinUrl: 'https://www.linkedin.com/in/john-doe' }).values.linkedinUrl
      ).toBe('https://www.linkedin.com/in/john-doe')
      expect(parseLead({ ...base, linkedinUrl: 'linkedin.com/in/john' }).values.linkedinUrl).toBe(
        'https://linkedin.com/in/john'
      )
      expect(parseLead({ ...base, linkedinUrl: 'https://es.linkedin.com/in/john' }).errors).toEqual([])
    })

    it.each([
      'https://example.com/in/john',
      'https://notlinkedin.com/in/john',
      'https://linkedin.com.evil.io',
      'x y',
    ])('rejects %s', (input) => {
      const { values, errors } = parseLead({ ...base, linkedinUrl: input })
      expect(errors).toEqual(['LinkedIn URL must be a linkedin.com link'])
      expect(values.linkedinUrl).toBeNull()
    })
  })

  describe('phone', () => {
    it('normalizes to E.164 using the lead country as default region', () => {
      expect(parseLead({ ...base, countryCode: 'ES', phone: '600 12 31 23' }).values.phone).toBe(
        '+34600123123'
      )
      expect(parseLead({ ...base, phone: '+1 (415) 555-2671' }).values.phone).toBe('+14155552671')
    })

    it('keeps the original value when it cannot be normalized', () => {
      const { values, errors } = parseLead({ ...base, phone: 'ext 12' })
      expect(errors).toEqual([])
      expect(values.phone).toBe('ext 12')
    })
  })
})
