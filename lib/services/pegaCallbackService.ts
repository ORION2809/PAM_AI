import { randomBytes } from 'node:crypto'

import { getServerEnv } from '@/lib/env'
import type { CreateVoiceSessionRequest, PegaCallbackAttempt, VoiceSessionCompletion } from '@/lib/schemas/voiceSession'
import { fetchWithTimeout } from '@/lib/utils/network'

interface PegaOAuthResponse {
  access_token?: string
}

export interface PegaVoiceAiResumePayload {
  EmailResponseBody: string
  pyID: string
  IsUserWantToReupload: boolean
}

function normalizeComparableText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isStandaloneConfirmation(text: string): boolean {
  const normalizedText = text.trim().toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ')

  return /^(yes|yeah|yep|resolved|fixed|working now|done)(?: please| pls| okay| ok| sure| thanks| thank you| go ahead| proceed| send it| send this| submit it| submit this)*$/i.test(
    normalizedText
  ) || /^(no|not yet|still not|unresolved|not working|issue persists)(?: please| pls| okay| ok| thanks| thank you)*$/i.test(
    normalizedText
  )
}

function extractMeaningfulExplanation(completion: VoiceSessionCompletion): string {
  const directExplanation = completion.userDecision.userExplanation.trim()

  if (directExplanation && !isStandaloneConfirmation(directExplanation)) {
    return directExplanation
  }

  const transcriptExplanation = [...completion.transcript]
    .reverse()
    .find((entry) => entry.speaker === 'user' && entry.text.trim().length > 0 && !isStandaloneConfirmation(entry.text))

  return transcriptExplanation?.text.trim() ?? ''
}

function buildFallbackEmailResponseBody(completion: VoiceSessionCompletion): string {
  const decisionSummary = completion.userDecision.requiresReupload
    ? 'User confirmed corrected documents must be reuploaded.'
    : 'User confirmed the flagged documents are valid and do not require reupload.'

  return decisionSummary
}

function buildEmailResponseBody(completion: VoiceSessionCompletion): string {
  const summary = completion.agentSummary.summary.trim()
  const explanation = extractMeaningfulExplanation(completion)

  if (summary && explanation) {
    if (normalizeComparableText(summary).includes(normalizeComparableText(explanation))) {
      return summary
    }

    return `${summary}\n\nCustomer explanation: ${explanation}`
  }

  return summary || explanation || buildFallbackEmailResponseBody(completion)
}

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

async function fetchPegaAccessToken(): Promise<string> {
  const env = getServerEnv()

  if (!env.pegaClientId || !env.pegaClientSecret || !env.pegaTokenEndpoint) {
    throw new Error('Pega OAuth configuration is incomplete.')
  }

  const response = await fetchWithTimeout(
    env.pegaTokenEndpoint,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.pegaClientId,
        client_secret: env.pegaClientSecret
      })
    },
    15_000
  )

  if (!response.ok) {
    throw new Error(`Pega OAuth request failed with status ${response.status}.`)
  }

  const payload = (await response.json().catch(() => null)) as PegaOAuthResponse | null

  if (!payload?.access_token) {
    throw new Error('Pega OAuth response did not include an access token.')
  }

  return payload.access_token
}

async function buildCallbackHeaders(input: {
  request: CreateVoiceSessionRequest
  completion: VoiceSessionCompletion
}): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-pamai-idempotency-key': input.completion.technicalMetadata.idempotencyKey
  }

  if (input.request.callback.authType === 'OAUTH2_CLIENT_CREDENTIALS') {
    headers.Authorization = `Bearer ${await fetchPegaAccessToken()}`
  }

  return headers
}

export function buildPegaVoiceAiResumePayload(completion: VoiceSessionCompletion): PegaVoiceAiResumePayload {
  return {
    EmailResponseBody: buildEmailResponseBody(completion),
    pyID: completion.caseId,
    IsUserWantToReupload: completion.userDecision.requiresReupload
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
    const headers = await buildCallbackHeaders({
      request: input.request,
      completion: input.completion
    })
    const callbackPayload = buildPegaVoiceAiResumePayload(input.completion)
    const response = await fetchWithTimeout(
      input.request.callback.url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(callbackPayload)
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
