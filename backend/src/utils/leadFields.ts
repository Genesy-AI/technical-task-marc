import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js'
import { isValidCountryCode, normalizeCountryCode } from './countryCode'

// Single source of truth for lead fields: CSV headers/aliases, validation, normalization, message
// variables and list columns all derive from LEAD_FIELDS.
// NOTE: backend/src/utils/leadFields.ts and frontend/src/utils/leadFields.ts must stay identical
// (the repo has no shared package).

export type LeadFieldKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'jobTitle'
  | 'countryCode'
  | 'companyName'
  | 'phone'
  | 'yearsAtCompany'
  | 'linkedinUrl'

export type LeadFieldValue = string | number | null
export type LeadValues = Record<LeadFieldKey, LeadFieldValue>

export interface FieldResult {
  value: LeadFieldValue
  error?: string
}

export const LEAD_FIELD_CATEGORIES = ['Personal', 'Contact', 'Work'] as const
export type LeadFieldCategory = (typeof LEAD_FIELD_CATEGORIES)[number]

export interface LeadFieldDef {
  key: LeadFieldKey
  label: string
  // Group in the message composer's variable picker
  category: LeadFieldCategory
  // Extra CSV header names besides `key`. Headers are compared lowercase and letters-only.
  aliases?: string[]
  required?: boolean
  // Available as {key} in message templates
  template: boolean
  // Rendered as a generic column in the leads list
  listColumn?: boolean
  link?: boolean
  // Receives a non-empty trimmed string plus the fields parsed so far (definition order)
  parse: (raw: string, ctx: Partial<LeadValues>) => FieldResult
}

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const text = (raw: string): FieldResult => ({ value: raw })

const parseEmail = (raw: string): FieldResult => ({
  value: raw,
  error: isValidEmail(raw) ? undefined : 'Invalid email format',
})

const parseCountry = (raw: string): FieldResult => ({
  value: normalizeCountryCode(raw),
  error: isValidCountryCode(raw) ? undefined : 'Invalid country code',
})

// E.164 when the number can be parsed (the lead's country is used as default region),
// otherwise the cleaned original is kept
const parsePhone = (raw: string, ctx: Partial<LeadValues>): FieldResult => {
  const country = typeof ctx.countryCode === 'string' ? (ctx.countryCode as CountryCode) : undefined
  const phone = parsePhoneNumberFromString(raw, country)
  return { value: phone?.isValid() ? phone.number : raw }
}

const parseYears = (raw: string): FieldResult => {
  if (!/^\d+$/.test(raw)) return { value: null, error: 'Years at company must be a whole number >= 0' }
  const years = Number(raw)
  return Number.isSafeInteger(years)
    ? { value: years }
    : { value: null, error: 'Years at company must be a whole number >= 0' }
}

const parseLinkedin = (raw: string): FieldResult => {
  const error = 'LinkedIn URL must be a linkedin.com link'
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = url.hostname.toLowerCase()
    const isLinkedin = host === 'linkedin.com' || host.endsWith('.linkedin.com')
    return isLinkedin ? { value: url.href } : { value: null, error }
  } catch {
    return { value: null, error }
  }
}

// Order matters: countryCode must come before phone
export const LEAD_FIELDS: LeadFieldDef[] = [
  {
    key: 'firstName',
    category: 'Personal',
    label: 'First name',
    required: true,
    template: true,
    parse: text,
  },
  { key: 'lastName', category: 'Personal', label: 'Last name', required: true, template: true, parse: text },
  { key: 'email', category: 'Contact', label: 'Email', required: true, template: true, parse: parseEmail },
  { key: 'jobTitle', category: 'Work', label: 'Job Title', template: true, listColumn: true, parse: text },
  { key: 'companyName', category: 'Work', label: 'Company', template: true, listColumn: true, parse: text },
  {
    key: 'countryCode',
    category: 'Personal',
    label: 'Country',
    template: true,
    listColumn: true,
    parse: parseCountry,
  },
  {
    key: 'phone',
    category: 'Contact',
    label: 'Phone',
    aliases: ['phoneNumber'],
    template: true,
    parse: parsePhone,
  },
  {
    key: 'yearsAtCompany',
    category: 'Work',
    label: 'Years at company',
    aliases: ['yearsInRole'],
    template: true,
    listColumn: true,
    parse: parseYears,
  },
  {
    key: 'linkedinUrl',
    category: 'Contact',
    label: 'LinkedIn',
    aliases: ['linkedin'],
    template: true,
    listColumn: true,
    link: true,
    parse: parseLinkedin,
  },
]

export const TEMPLATE_FIELD_KEYS = LEAD_FIELDS.filter((f) => f.template).map((f) => f.key)

const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z]/g, '')

const HEADER_TO_KEY = new Map<string, LeadFieldKey>(
  LEAD_FIELDS.flatMap((f) =>
    [f.key, ...(f.aliases ?? [])].map((name) => [normalizeHeader(name), f.key] as const)
  )
)

export const fieldKeyForHeader = (header: string): LeadFieldKey | undefined =>
  HEADER_TO_KEY.get(normalizeHeader(header))

// Validates and normalizes a lead keyed by canonical field names. Missing optional fields become null.
export const parseLead = (input: Record<string, unknown>): { values: LeadValues; errors: string[] } => {
  const values: Partial<LeadValues> = {}
  const errors: string[] = []

  for (const field of LEAD_FIELDS) {
    const rawValue = input[field.key]
    const raw = typeof rawValue === 'string' || typeof rawValue === 'number' ? String(rawValue).trim() : ''

    if (!raw) {
      values[field.key] = field.required ? '' : null
      if (field.required) errors.push(`${field.label} is required`)
      continue
    }

    const result = field.parse(raw, values)
    values[field.key] = result.value
    if (result.error) errors.push(result.error)
  }

  return { values: values as LeadValues, errors }
}
