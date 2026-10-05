import { ISO_COUNTRY_CODES } from './isoCountryCodes'

// Country is optional: empty/missing values normalize to null and are valid.
export const normalizeCountryCode = (value?: string | null): string | null => {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return code || null
}

export const isValidCountryCode = (value?: string | null): boolean => {
  const code = normalizeCountryCode(value)
  return code === null || ISO_COUNTRY_CODES.has(code)
}
