import ora, { Ora } from 'ora'

/**
 * Create and start a spinner
 */
export function startSpinner(text: string): Ora {
  return ora(text).start()
}

/**
 * Run an async operation with a spinner
 */
export async function withSpinner<T>(
  text: string,
  fn: () => Promise<T>,
  options?: {
    successText?: string
    errorText?: string
  }
): Promise<T> {
  const spinner = ora(text).start()

  try {
    const result = await fn()
    spinner.succeed(options?.successText || text)
    return result
  } catch (error) {
    spinner.fail(options?.errorText || text)
    throw error
  }
}
