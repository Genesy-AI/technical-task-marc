import { postJson, toPhoneString } from './http'
import { env } from './env'
import type { PhoneProvider } from './types'

export const astraDialer: PhoneProvider = {
  name: 'astraDialer',
  async findPhone(input, timeoutMs) {
    const data = (await postJson(
      env('ASTRA_BASE_URL', 'https://api.enginy.ai/api/tmp/astraDialer'),
      { email: input.email },
      { apiKey: env('ASTRA_API_KEY', '1234jhgf') },
      timeoutMs
    )) as { phoneNmbr?: unknown }

    return toPhoneString(data?.phoneNmbr)
  },
}
