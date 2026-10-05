import { astraDialer } from './astraDialer'
import { nimbusLookup } from './nimbusLookup'
import { orionConnect } from './orionConnect'
import type { PhoneProvider, ProviderName } from './types'

export const phoneProviders: Record<ProviderName, PhoneProvider> = {
  orionConnect,
  astraDialer,
  nimbusLookup,
}

export * from './types'
