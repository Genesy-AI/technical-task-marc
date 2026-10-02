import path from 'path'
import { ApplicationFailure } from '@temporalio/client'
import { TestWorkflowEnvironment } from '@temporalio/testing'
import { Worker } from '@temporalio/worker'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { verifyEmailWorkflow } from './workflows'

describe('verifyEmailWorkflow', () => {
  let env: TestWorkflowEnvironment
  let queueCount = 0

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping()
  }, 60_000)

  afterAll(async () => {
    await env?.teardown()
  })

  async function runWorkflow(
    verifyEmail: (email: string, done: Promise<void>) => Promise<boolean>,
    email: string
  ) {
    let finish!: () => void
    const done = new Promise<void>((resolve) => (finish = resolve))
    const taskQueue = `verify-email-test-${++queueCount}`

    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: path.resolve(__dirname, './workflows.ts'),
      shutdownForceTime: '1s',
      activities: { verifyEmail: (e: string) => verifyEmail(e, done) },
    })

    return worker.runUntil(async () => {
      const handle = await env.client.workflow.start(verifyEmailWorkflow, {
        taskQueue,
        workflowId: `verify-email-test-${queueCount}`,
        args: [email],
      })

      // El tiempo del workflow está acelerado, así que 3 intentos con backoff terminan en
      // milisegundos reales. Si pasan 10 s reales y sigue vivo, está reintentando sin límite.
      let timer: NodeJS.Timeout | undefined
      const outcome = await Promise.race([
        handle.result().then(
          (value) => ({ status: 'completed' as const, value }),
          () => ({ status: 'failed' as const })
        ),
        new Promise<{ status: 'still-running' }>((resolve) => {
          timer = setTimeout(() => resolve({ status: 'still-running' }), 10_000)
        }),
      ]).finally(() => clearTimeout(timer))

      if (outcome.status === 'still-running') {
        await handle.terminate('el test ya ha visto suficiente')
      }

      // Libera las activities mock que sigan en vuelo para poder cerrar el worker
      finish()
      return outcome
    })
  }

  it('termina en un tiempo acotado cuando la activity tarda más que su timeout', async () => {
    let attempts = 0

    const outcome = await runWorkflow(async (_email, done) => {
      attempts++
      // Simula al proveedor lento: avanza el reloj virtual 2 minutos, mucho más que el
      // startToCloseTimeout del workflow, así que cada intento vence antes de responder
      await Promise.race([env.sleep('2 minutes'), done])
      return true
    }, 'jane.smith@example.com')

    expect(outcome.status).not.toBe('still-running')
    expect(attempts).toBeLessThanOrEqual(3)
  }, 60_000)

  it('devuelve el resultado cuando la activity responde dentro del timeout', async () => {
    const outcome = await runWorkflow(async () => true, 'jane.smith@example.com')

    expect(outcome).toEqual({ status: 'completed', value: true })
  }, 60_000)

  it('no reintenta los errores no reintentables', async () => {
    let attempts = 0

    const outcome = await runWorkflow(async (_email, done) => {
      attempts++
      throw ApplicationFailure.nonRetryable('Invalid email format', 'InvalidEmailFormat')
    }, 'not-an-email')

    expect(outcome.status).toBe('failed')
    expect(attempts).toBe(1)
  }, 60_000)
})
