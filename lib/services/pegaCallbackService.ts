import { randomBytes } from 'node:crypto'

import { getServerEnv } from '@/lib/env'
import type { CreateVoiceSessionRequest, PegaCallbackAttempt, VoiceSessionCompletion } from '@/lib/schemas/voiceSession'
import { fetchWithTimeout } from '@/lib/utils/network'

function createCallbackAttemptId(): string {
  return `ATTEMPT-${randomBytes(6).toString('hex')}`
}

function isDemoCallbackUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.hostname === 'pega.company.com'
  } catch {
    return false
  }
}

export async function deliverPegaCallback(input: {
  request: CreateVoiceSessionRequest
  completion: VoiceSessionCompletion
  retryCount?: number
  now?: string
}): Promise<PegaCallbackAttempt> {
  const env = getServerEnv()
  const attemptedAt = input.now ?? new Date().toISOString()

  if (env.mockPegaCallbacks && isDemoCallbackUrl(input.request.callback.url)) {
    return {
      id: createCallbackAttemptId(),
      sessionId: input.completion.sessionId,
      callbackStatus: 'DELIVERED',
      httpStatusCode: 202,
      responseBody: JSON.stringify({ mocked: true, target: input.request.callback.url }),
      attemptedAt,
      retryCount: input.retryCount ?? 0
    }
  }

  try {
    const response = await fetchWithTimeout(
      input.request.callback.url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pamai-idempotency-key': input.completion.technicalMetadata.idempotencyKey
        },
        body: JSON.stringify(input.completion)
      },
      15_000
    )
    const responseBody = await response.text().catch(() => '')

    return {
      id: createCallbackAttemptId(),
      sessionId: input.completion.sessionId,
      callbackStatus: response.ok ? 'DELIVERED' : 'FAILED',
      httpStatusCode: response.status,
      responseBody,
      attemptedAt,
      retryCount: input.retryCount ?? 0
    }
  } catch (error) {
    return {
      id: createCallbackAttemptId(),
      sessionId: input.completion.sessionId,
      callbackStatus: 'FAILED',
      httpStatusCode: null,
      responseBody: error instanceof Error ? error.message : 'Callback delivery failed.',
      attemptedAt,
      retryCount: input.retryCount ?? 0
    }
  }
}