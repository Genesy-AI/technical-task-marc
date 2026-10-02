import { ApplicationFailure } from '@temporalio/client'

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function verifyEmail(email: string): Promise<boolean> {
  if (!EMAIL_FORMAT.test(email)) {
    throw ApplicationFailure.nonRetryable(`Invalid email format: ${email}`, 'InvalidEmailFormat')
  }

  if (email.includes('john.doe')) {
    return false
  }

  if (email.includes('jane.smith')) {
    await new Promise((resolve) => setTimeout(resolve, 20000))
  }

  if (/\+/.test(email)) {
    return false
  }

  return true
}
