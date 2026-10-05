export type ProviderName = 'orionConnect' | 'astraDialer' | 'nimbusLookup'

export type PhoneLookupInput = {
  fullName: string
  email: string
  jobTitle?: string | null
  companyWebsite?: string | null
}

export interface PhoneProvider {
  name: ProviderName
  /** Resolves to the phone as a string, or null when the provider has no data (or lacks required input). */
  findPhone(input: PhoneLookupInput, timeoutMs: number): Promise<string | null>
}
