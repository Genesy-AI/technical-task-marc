import { prisma } from '../../db'
import { phoneProviders, PhoneLookupInput, ProviderName } from '../../providers/phone'
import { PROVIDER_TIMEOUT_MS } from '../../providers/phone/config'
import { companyWebsiteFromEmail } from '../../utils/emailDomain'
import { ApplicationFailure } from '@temporalio/client'

export type EnrichmentProgress = {
  status: 'pending' | 'found' | 'not_found' | 'failed'
  provider?: ProviderName | null
  phone?: string | null
}

export async function lookupPhone(
  providerName: ProviderName,
  input: PhoneLookupInput
): Promise<string | null> {
  // Fail the HTTP call slightly before the activity timeout so the error is explicit
  return phoneProviders[providerName].findPhone(input, PROVIDER_TIMEOUT_MS[providerName] - 500)
}

export async function loadLeadForEnrichment(leadId: number): Promise<PhoneLookupInput> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) throw ApplicationFailure.nonRetryable(`Lead ${leadId} not found`, 'LeadNotFound')

  return {
    fullName: `${lead.firstName} ${lead.lastName}`.trim(),
    email: lead.email,
    jobTitle: lead.jobTitle,
    companyWebsite: companyWebsiteFromEmail(lead.email),
  }
}

export async function saveEnrichmentProgress(leadId: number, progress: EnrichmentProgress): Promise<void> {
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      phoneEnrichmentStatus: progress.status,
      phoneProvider: progress.provider ?? null,
      ...(progress.phone ? { phone: progress.phone } : {}),
    },
  })
}
