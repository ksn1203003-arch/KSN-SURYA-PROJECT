// Transient error patterns that are safe to retry.
// 4xx errors (bad input, auth failure) are NOT retried — only network/5xx issues.
const RETRYABLE = [
  "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED",
  "socket hang up", "network", "rate_limit", "overloaded",
  "529", "503", "502", "504",
]

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  const code = (err as NodeJS.ErrnoException).code ?? ""
  return RETRYABLE.some(p => msg.includes(p.toLowerCase()) || code === p)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retries an async function up to maxAttempts times using exponential backoff.
 * Only retries on transient errors (network, 5xx, rate limits).
 * Non-retryable errors (bad input, auth failure) are thrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isRetryable(err) || attempt === maxAttempts) throw err
      await delay(baseDelayMs * Math.pow(2, attempt - 1))
    }
  }
  throw lastErr
}
