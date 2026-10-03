import path from 'path'
import { ApplicationFailure } from '@temporalio/client'
import { TestWorkflowEnvironment } from '@temporalio/testing'
import { Worker } from '@temporalio/worker'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { EnrichmentProgress } from './activities/phone'
import { enrichPhoneWorkflow } from './enrichPhoneWorkflow'

type LookupMock = (provider: string) => Promise<string | null>

describe('enrichPhoneWorkflow', () => {
  let env: TestWorkflowEnvironment
  let queueCount = 0

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping()
  }, 60_000)

  afterAll(async () => {
    await env?.teardown()
  })

  async function run(lookup: LookupMock) {
    const attempts: string[] = []
    const saved: EnrichmentProgress[] = []
    const taskQueue = `enrich-phone-test-${++queueCount}`

    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: path.resolve(__dirname, './enrichPhoneWorkflow.ts'),
      shutdownForceTime: '1s',
      activities: {
        loadLeadForEnrichment: async () => ({ fullName: 'Ada Lovelace', email: 'ada@example.com' }),
        saveEnrichmentProgress: async (_id: number, progress: EnrichmentProgress) => {
          saved.push(progress)
        },
        lookupPhone: async (provider: string) => {
          attempts.push(provider)
          return lookup(provider)
        },
      },
    })

    const result = await worker.runUntil(
      env.client.workflow.execute(enrichPhoneWorkflow, {
        taskQueue,
        workflowId: `enrich-phone-test-${queueCount}`,
        args: [1],
      })
    )
    return { result, attempts, last: saved[saved.length - 1] }
  }

  it('stops at the first provider that returns a phone', async () => {
    const { result, attempts, last } = await run(async () => '600111222')

    expect(result).toEqual({ phone: '600111222' })
    expect(attempts).toEqual(['orionConnect'])
    expect(last).toEqual({ status: 'found', provider: 'orionConnect', phone: '600111222' })
  }, 60_000)

  it('falls through to the next provider when one has no data', async () => {
    const { result, attempts } = await run(async (p) => (p === 'nimbusLookup' ? '600333444' : null))

    expect(result).toEqual({ phone: '600333444' })
    expect(attempts).toEqual(['orionConnect', 'astraDialer', 'nimbusLookup'])
  }, 60_000)

  it('falls through after a provider exhausts its retries', async () => {
    const { result, attempts } = await run(async (p) => {
      if (p === 'orionConnect') throw new Error('500')
      return '600555666'
    })

    expect(result).toEqual({ phone: '600555666' })
    expect(attempts).toEqual(['orionConnect', 'orionConnect', 'orionConnect', 'astraDialer'])
  }, 60_000)

  it('marks not_found when every provider answers with no data', async () => {
    const { result, last } = await run(async () => null)

    expect(result).toEqual({ phone: null })
    expect(last).toEqual({ status: 'not_found' })
  }, 60_000)

  it('marks failed when every provider errors out', async () => {
    const { result, attempts, last } = await run(async () => {
      throw new Error('500')
    })

    expect(result).toEqual({ phone: null })
    expect(attempts).toHaveLength(9)
    expect(last).toEqual({ status: 'failed' })
  }, 60_000)

  it('does not retry non-retryable errors', async () => {
    const { attempts } = await run(async (p) => {
      if (p === 'orionConnect') throw ApplicationFailure.nonRetryable('401', 'ProviderClientError')
      return '600777888'
    })

    expect(attempts).toEqual(['orionConnect', 'astraDialer'])
  }, 60_000)
})
