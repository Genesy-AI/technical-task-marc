const GENERIC_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
])

export function companyWebsiteFromEmail(email: string): string | null {
  const domain = email.split('@')[1]?.trim().toLowerCase()
  if (!domain || GENERIC_DOMAINS.has(domain)) return null
  return domain
}
