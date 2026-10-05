import { LeadFieldKey, TEMPLATE_FIELD_KEYS } from './leadFields'

export interface Lead {
  firstName: string
  lastName?: string | null
  email?: string | null
  jobTitle?: string | null
  companyName?: string | null
  countryCode?: string | null
  phone?: string | null
  yearsAtCompany?: number | null
  linkedinUrl?: string | null
}

export function generateMessageFromTemplate(template: string, lead: Lead): string {
  let message = template

  const availableFields = new Set<string>(TEMPLATE_FIELD_KEYS)

  const templateVariables = template.match(/\{(\w+)\}/g) || []

  for (const variable of templateVariables) {
    const fieldName = variable.slice(1, -1)

    if (availableFields.has(fieldName)) {
      const fieldValue = lead[fieldName as LeadFieldKey as keyof Lead]

      if (fieldValue === null || fieldValue === undefined || fieldValue === '') {
        throw new Error(`Missing required field: ${fieldName}`)
      }

      message = message.replace(new RegExp(`\\{${fieldName}\\}`, 'g'), () => String(fieldValue))
    } else {
      throw new Error(`Unknown field in template: ${fieldName}`)
    }
  }

  return message
}
