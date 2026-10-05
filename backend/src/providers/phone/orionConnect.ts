import { postJson, toPhoneString } from './http'
import { env } from './env'
import type { PhoneProvider } from './types'

export const orionConnect: PhoneProvider = {
  name: 'orionConnect',
  async findPhone(input, timeoutMs) {
    // Orion identifies people by company website; without it there is nothing to query
    if (!input.companyWebsite) return null

    const data = (await postJson(
      env('ORION_BASE_URL', 'https://api.enginy.ai/api/tmp/orionConnect'),
      { fullName: input.fullName, companyWebsite: input.companyWebsite },
      { 'x-auth-me': env('ORION_API_KEY', 'mySecretKey123') },
      timeoutMs
    )) as { phone?: unknown }

    return toPhoneString(data?.phone)
  },
}
