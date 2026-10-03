export type LeadsEnrichPhoneInput = {
  leadIds: number[]
}

export type LeadsEnrichPhoneOutput = {
  started: number[]
  alreadyRunning: number[]
  skipped: number[]
  errors: Array<{
    leadId: number
    leadName: string
    error: string
  }>
}
