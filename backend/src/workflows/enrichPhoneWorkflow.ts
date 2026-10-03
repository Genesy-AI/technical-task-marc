import { ActivityFailure, proxyActivities, RetryPolicy } from '@temporalio/workflow'
import type * as activities from './activities'
import { PROVIDER_ORDER, PROVIDER_TIMEOUT_MS } from '../providers/phone/config'
import type { ProviderName } from '../providers/phone/types'

const retry: RetryPolicy = { maximumAttempts: 3, initialInterval: '1s', backoffCoefficient: 2 }

const providerActivities = Object.fromEntries(
  PROVIDER_ORDER.map((name) => [
    name,
    proxyActivities<typeof activities>({ startToCloseTimeout: PROVIDER_TIMEOUT_MS[name], retry }),
  ])
) as Record<ProviderName, ReturnType<typeof proxyActivities<typeof activities>>>

const { loadLeadForEnrichment, saveEnrichmentProgress } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 seconds',
  retry,
})

export async function enrichPhoneWorkflow(leadId: number): Promise<{ phone: string | null }> {
  const input = await loadLeadForEnrichment(leadId)
  let anyCleanMiss = false

  for (const provider of PROVIDER_ORDER) {
    await saveEnrichmentProgress(leadId, { status: 'pending', provider })

    let phone: string | null
    try {
      phone = await providerActivities[provider].lookupPhone(provider, input)
    } catch (error) {
      // A provider that is down must not stop the cascade
      if (error instanceof ActivityFailure) continue
      throw error
    }

    if (phone) {
      await saveEnrichmentProgress(leadId, { status: 'found', provider, phone })
      return { phone }
    }
    anyCleanMiss = true
  }

  await saveEnrichmentProgress(leadId, { status: anyCleanMiss ? 'not_found' : 'failed' })
  return { phone: null }
}
