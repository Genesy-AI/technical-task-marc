import { describe, expect, it } from 'vitest'
import { verifyEmail } from './utils'

describe('verifyEmail', () => {
  it('acepta un email normal', async () => {
    expect(await verifyEmail('ana.lopez@example.com')).toBe(true)
  })

  it('rechaza emails con alias +', async () => {
    expect(await verifyEmail('ana+test@example.com')).toBe(false)
  })

  it('rechaza john.doe', async () => {
    expect(await verifyEmail('john.doe@example.com')).toBe(false)
  })

  it.each(['', 'not-an-email', 'a@b', 'a b@example.com'])(
    'lanza un error no reintentable para "%s"',
    async (email) => {
      await expect(verifyEmail(email)).rejects.toMatchObject({
        type: 'InvalidEmailFormat',
        nonRetryable: true,
      })
    }
  )
})
