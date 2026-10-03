import { LEAD_FIELD_CATEGORIES, LEAD_FIELDS, LeadFieldCategory, LeadFieldDef } from './leadFields'

export const TEMPLATE_FIELDS = LEAD_FIELDS.filter((f) => f.template)

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

// Prefix matches on key/label first, then substring matches; empty query returns everything
export const searchFields = (query: string, fields: LeadFieldDef[] = TEMPLATE_FIELDS): LeadFieldDef[] => {
  const q = norm(query)
  if (!q) return fields

  const prefix: LeadFieldDef[] = []
  const contains: LeadFieldDef[] = []
  for (const field of fields) {
    const names = [field.key, field.label, ...(field.aliases ?? [])].map(norm)
    if (names.some((n) => n.startsWith(q))) prefix.push(field)
    else if (names.some((n) => n.includes(q))) contains.push(field)
  }
  return [...prefix, ...contains]
}

export const groupByCategory = (
  fields: LeadFieldDef[]
): { category: LeadFieldCategory; fields: LeadFieldDef[] }[] =>
  LEAD_FIELD_CATEGORIES.map((category) => ({
    category,
    fields: fields.filter((f) => f.category === category),
  })).filter((group) => group.fields.length > 0)

// Flat order the UI renders (grouped), used for keyboard navigation
export const flattenGroups = (groups: ReturnType<typeof groupByCategory>) => groups.flatMap((g) => g.fields)

export const formatFieldValue = (lead: Record<string, unknown> | undefined, key: string): string | null => {
  const value = lead?.[key]
  return value === null || value === undefined || value === '' ? null : String(value)
}

export type PreviewPart = { kind: 'text' | 'value' | 'missing' | 'unknown'; text: string }

// Mirrors the backend's generateMessageFromTemplate, but keeps going on problems so they can be shown inline
export const previewTemplate = (template: string, lead: Record<string, unknown>): PreviewPart[] => {
  const known = new Set<string>(TEMPLATE_FIELDS.map((f) => f.key))
  const parts: PreviewPart[] = []
  let last = 0

  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ kind: 'text', text: template.slice(last, index) })

    const name = match[1]
    if (!known.has(name)) {
      parts.push({ kind: 'unknown', text: match[0] })
    } else {
      const value = formatFieldValue(lead, name)
      parts.push(value === null ? { kind: 'missing', text: match[0] } : { kind: 'value', text: value })
    }
    last = index + match[0].length
  }

  if (last < template.length) parts.push({ kind: 'text', text: template.slice(last) })
  return parts
}

// If the caret sits inside an unfinished "{partial" returns where it starts and the typed text
export const findOpenVariable = (
  template: string,
  caret: number
): { start: number; query: string } | null => {
  const start = template.lastIndexOf('{', caret - 1)
  if (start < 0) return null
  const query = template.slice(start + 1, caret)
  return /^\w*$/.test(query) ? { start, query } : null
}

// Replaces the "{partial" before the caret (and a "}" right after it) with the full variable
export const completeVariable = (
  template: string,
  caret: number,
  start: number,
  key: string
): { template: string; caret: number } => {
  const end = template[caret] === '}' ? caret + 1 : caret
  const inserted = `{${key}}`
  return {
    template: template.slice(0, start) + inserted + template.slice(end),
    caret: start + inserted.length,
  }
}
