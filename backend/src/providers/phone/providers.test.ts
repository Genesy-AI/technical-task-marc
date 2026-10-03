import { afterEach, describe, expect, it, vi } from 'vitest'
import { astraDialer } from './astraDialer'
import { nimbusLookup } from './nimbusLookup'
import { orionConnect } from './orionConnect'

const input = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  jobTitle: 'CTO',
  companyWebsite: 'example.com',
}

function mockFetch(status: number, body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('phone providers', () => {
  it('orion returns the phone and sends the auth header', async () => {
    const fetchMock = mockFetch(200, { phone: '7170862766' })

    expect(await orionConnect.findPhone(input, 1000)).toBe('7170862766')
    expect(fetchMock.mock.calls[0][1].headers['x-auth-me']).toBeDefined()
  })

  it('orion is skipped without a company website', async () => {
    const fetchMock = mockFetch(200, { phone: '1' })

    expect(await orionConnect.findPhone({ ...input, companyWebsite: null }, 1000)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([{ phoneNmbr: null }, {}])('astra treats %j as no data', async (body) => {
    mockFetch(200, body)

    expect(await astraDialer.findPhone(input, 1000)).toBeNull()
  })

  it('nimbus converts the numeric phone to string (live API and documented shape)', async () => {
    mockFetch(200, { phoneNmbr: 2852580705, countryCode: 'ES' })
    expect(await nimbusLookup.findPhone(input, 1000)).toBe('2852580705')

    mockFetch(200, { number: 600123123, countryCode: 'ES' })
    expect(await nimbusLookup.findPhone(input, 1000)).toBe('600123123')
  })

  it('nimbus sends the api key as query param', async () => {
    const fetchMock = mockFetch(200, { phoneNmbr: 1 })
    await nimbusLookup.findPhone(input, 1000)

    expect(fetchMock.mock.calls[0][0]).toContain('api=')
  })

  it('4xx is non-retryable, 5xx and 429 are retryable', async () => {
    mockFetch(401)
    await expect(astraDialer.findPhone(input, 1000)).rejects.toMatchObject({ nonRetryable: true })

    mockFetch(500)
    await expect(astraDialer.findPhone(input, 1000)).rejects.toMatchObject({ nonRetryable: false })

    mockFetch(429)
    await expect(astraDialer.findPhone(input, 1000)).rejects.toMatchObject({ nonRetryable: false })
  })
})
