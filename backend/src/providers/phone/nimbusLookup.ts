import { postJson, toPhoneString } from './http'
import { env } from './env'
import type { PhoneProvider } from './types'

export const nimbusLookup: PhoneProvider = {
  name: 'nimbusLookup',
  async findPhone(input, timeoutMs) {
    const url = new URL(env('NIMBUS_BASE_URL', 'https://api.enginy.ai/api/tmp/numbusLookup'))
    url.searchParams.set('api', env('NIMBUS_API_KEY', '000099998888'))

    const data = (await postJson(
      url.toString(),
      { email: input.email, jobTitle: input.jobTitle ?? undefined },
      {},
      timeoutMs
    )) as { phoneNmbr?: unknown; number?: unknown }

    // The docs say `number`, the live API returns `phoneNmbr`: accept both
    return toPhoneString(data?.phoneNmbr ?? data?.number)
  },
}
