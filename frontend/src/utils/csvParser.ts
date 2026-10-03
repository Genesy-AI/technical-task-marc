import Papa from 'papaparse'
import { fieldKeyForHeader, isValidEmail, LEAD_FIELDS, LeadFieldKey, parseLead } from './leadFields'

export { isValidEmail }

export interface CsvLead {
  firstName: string
  lastName: string
  email: string
  jobTitle?: string
  countryCode?: string
  companyName?: string
  phone?: string
  yearsAtCompany?: number
  linkedinUrl?: string
  isValid: boolean
  errors: string[]
  rowIndex: number
}

export const parseCsv = (content: string): CsvLead[] => {
  if (!content?.trim()) {
    throw new Error('CSV content cannot be empty')
  }

  const parseResult = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim().toLowerCase(),
    quoteChar: '"',
  })

  if (parseResult.errors.length > 0) {
    const criticalErrors = parseResult.errors.filter(
      (error) => error.type === 'Delimiter' || error.type === 'Quotes' || error.type === 'FieldMismatch'
    )
    if (criticalErrors.length > 0) {
      throw new Error(`CSV parsing failed: ${criticalErrors[0].message}`)
    }
  }

  if (!parseResult.data || parseResult.data.length === 0) {
    throw new Error('CSV file appears to be empty or contains no valid data')
  }

  const data: CsvLead[] = []

  parseResult.data.forEach((row, index) => {
    if (Object.values(row).every((value) => !value)) return

    const raw: Partial<Record<LeadFieldKey, string>> = {}
    Object.entries(row).forEach(([header, value]) => {
      const key = fieldKeyForHeader(header)
      if (key) raw[key] = value?.trim() || ''
    })

    const { values, errors } = parseLead(raw)
    const lead: Record<string, unknown> = {}
    LEAD_FIELDS.forEach(({ key }) => {
      lead[key] = values[key] ?? undefined
    })

    data.push({
      ...lead,
      rowIndex: index + 2,
      isValid: errors.length === 0,
      errors,
    } as unknown as CsvLead)
  })

  return data
}
