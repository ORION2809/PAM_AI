interface RateLimitBucket {
  count: number
  resetAt: number
}

const globalStore = globalThis as typeof globalThis & {
  __voiceCsrRateLimitStore?: Map<string, RateLimitBucket>
}

const rateLimitStore = globalStore.__voiceCsrRateLimitStore ?? new Map<string, RateLimitBucket>()
globalStore.__voiceCsrRateLimitStore = rateLimitStore

export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded. Please wait before sending another request.') {
    super(message)
    this.name = 'RateLimitError'
  }
}

export function assertRateLimit(input: {
  key: string
  limit: number
  windowMs: number
}): void {
  const now = Date.now()

  for (const [key, bucket] of rateLimitStore.entries()) {
    if (now >= bucket.resetAt) {
      rateLimitStore.delete(key)
    }
  }

  const currentBucket = rateLimitStore.get(input.key)

  if (!currentBucket || now >= currentBucket.resetAt) {
    rateLimitStore.set(input.key, {
      count: 1,
      resetAt: now + input.windowMs
    })
    return
  }

  if (currentBucket.count >= input.limit) {
    throw new RateLimitError()
  }

  rateLimitStore.set(input.key, {
    ...currentBucket,
    count: currentBucket.count + 1
  })
}

export function getRequestIdentifier(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = request.headers.get('x-real-ip')?.trim()

  return forwardedFor || realIp || 'local-demo'
}