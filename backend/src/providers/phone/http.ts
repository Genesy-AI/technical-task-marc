import { ApplicationFailure } from '@temporalio/client'

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const message = `Provider responded ${response.status}`
    // 4xx means our request is wrong: retrying won't help (except rate limiting)
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw ApplicationFailure.nonRetryable(message, 'ProviderClientError')
    }
    throw ApplicationFailure.retryable(message, 'ProviderServerError')
  }

  return response.json()
}

export function toPhoneString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}
