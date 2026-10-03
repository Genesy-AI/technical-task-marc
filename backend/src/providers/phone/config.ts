import type { ProviderName } from './types'

// Pure module: also imported from the workflow sandbox, so no fetch/process/Prisma here.
export const PROVIDER_ORDER: ProviderName[] = ['orionConnect', 'astraDialer', 'nimbusLookup']

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  orionConnect: 'Orion Connect',
  astraDialer: 'Astra Dialer',
  nimbusLookup: 'Nimbus Lookup',
}

// Observed latency: Orion ~4s, Nimbus ~2s, Astra 0.2-1.2s.
export const PROVIDER_TIMEOUT_MS: Record<ProviderName, number> = {
  orionConnect: 8000,
  astraDialer: 3000,
  nimbusLookup: 5000,
}
