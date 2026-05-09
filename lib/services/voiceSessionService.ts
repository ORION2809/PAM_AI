import { getServerEnv } from '@/lib/env'
import { createVoiceSessionRequestSchema, type PegaCallbackAttempt, type VoiceSessionCompletion, type VoiceSessionContext, type VoiceSessionRecord } from '@/lib/schemas/voiceSession'
import { deliverPegaCallback } from '@/lib/services/pegaCallbackService'
import { getVoiceSessionAppServices } from '@/lib/services/voiceSessionAppServices'
import { processVoiceSessionTurn, startVoiceSession } from '@/lib/services/voiceSessionFlow'
import { createVoiceSessionId } from '@/lib/utils/ids'
import { hashSessionToken, verifySignedSessionToken, createSignedSessionToken } from '@/lib/utils/sessionToken'

export class VoiceSessionHttpError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'VoiceSessionHttpError'
    this.statusCode = statusCode
  }
}

function getLastAssistantMessage(session: VoiceSessionRecord): string {
  const assistantEntry = [...session.transcript].reverse().find((entry) => entry.speaker === 'agent')
  return assistantEntry?.text ?? 'The session is ready.'
}

function assertSessionAccess(session: VoiceSessionRecord | null, token: string, now: string): VoiceSessionRecord {
  if (!session) {
    throw new VoiceSessionHttpError(404, 'Voice session not found.')
  }

  const env = getServerEnv()

  verifySignedSessionToken({
    token,
    sessionId: session.sessionId,
    secret: env.pamaiSessionTokenSecret,
    now
  })

  if (hashSessionToken(token) !== session.sessionTokenHash) {
    throw new VoiceSessionHttpError(403, 'Invalid session token.')
  }

  if (Date.parse(now) > Date.parse(session.expiresAt)) {
    throw new VoiceSessionHttpError(410, 'This PAMAI session has expired.')
  }

  return session
}

function buildConversationUrl(sessionId: string, token: string, baseUrl?: string): string {
  const env = getServerEnv()
  const target = new URL(`/voice/session/${sessionId}`, baseUrl ?? env.appBaseUrl)
  target.hash = `token=${encodeURIComponent(token)}`
  return target.toString()
}

function getSessionStateResponse(sessionId: string): {
  session: VoiceSessionContext
  completion: VoiceSessionCompletion | null
  callbackStatus: PegaCallbackAttempt | null
} {
  const { voiceSessionRepository } = getVoiceSessionAppServices()
  const session = voiceSessionRepository.getSessionContext(sessionId)

  if (!session) {
    throw new VoiceSessionHttpError(404, 'Voice session not found.')
  }

  return {
    session,
    completion: voiceSessionRepository.getCompletion(sessionId),
    callbackStatus: voiceSessionRepository.getCallbackStatus(sessionId)
  }
}

async function finalizeCompletion(completion: VoiceSessionCompletion): Promise<PegaCallbackAttempt> {
  const { voiceSessionRepository } = getVoiceSessionAppServices()
  const session = voiceSessionRepository.getSession(completion.sessionId)

  if (!session) {
    throw new VoiceSessionHttpError(404, 'Voice session not found.')
  }

  const callbackAttempt = await deliverPegaCallback({
    request: session.request,
    completion
  })

  return voiceSessionRepository.recordCallbackAttempt(callbackAttempt)
}

export function createVoiceSession(input: { request: unknown; now?: string; baseUrl?: string }): {
  sessionId: string
  status: 'READY'
  conversationUrl: string
  expiresAt: string
} {
  const { voiceSessionRepository } = getVoiceSessionAppServices()
  const env = getServerEnv()
  const request = createVoiceSessionRequestSchema.parse(input.request)
  const sessionId = createVoiceSessionId()
  const token = createSignedSessionToken({
    sessionId,
    expiresAt: request.expiresAt,
    secret: env.pamaiSessionTokenSecret
  })

  voiceSessionRepository.createSession({
    sessionId,
    sessionTokenHash: hashSessionToken(token),
    request,
    createdAt: input.now ?? new Date().toISOString()
  })

  return {
    sessionId,
    status: 'READY',
    conversationUrl: buildConversationUrl(sessionId, token, input.baseUrl),
    expiresAt: request.expiresAt
  }
}

export function getVoiceSessionView(input: {
  sessionId: string
  token: string
  now?: string
}): {
  session: VoiceSessionContext
  completion: VoiceSessionCompletion | null
  callbackStatus: PegaCallbackAttempt | null
} {
  const { voiceSessionRepository } = getVoiceSessionAppServices()
  const now = input.now ?? new Date().toISOString()
  const session = assertSessionAccess(voiceSessionRepository.getSession(input.sessionId), input.token, now)

  return getSessionStateResponse(session.sessionId)
}

export function startManagedVoiceSession(input: {
  sessionId: string
  token: string
  now?: string
}): {
  session: VoiceSessionContext
  assistantText: string
  completion: VoiceSessionCompletion | null
  callbackStatus: PegaCallbackAttempt | null
} {
  const { voiceSessionRepository } = getVoiceSessionAppServices()
  const now = input.now ?? new Date().toISOString()
  const session = assertSessionAccess(voiceSessionRepository.getSession(input.sessionId), input.token, now)

  if (session.sessionState !== 'SESSION_LOADED') {
    const state = getSessionStateResponse(session.sessionId)

    return {
      ...state,
      assistantText: getLastAssistantMessage(session)
    }
  }

  const result = startVoiceSession({
    session,
    now
  })

  voiceSessionRepository.saveSession(result.session)
  const state = getSessionStateResponse(session.sessionId)

  return {
    ...state,
    assistantText: result.assistantText
  }
}

export async function processManagedVoiceSessionTurn(input: {
  sessionId: string
  token: string
  text: string
  inputMode: 'text' | 'voice'
  now?: string
  voiceModel?: string
  reasoningModel?: string
}): Promise<{
  session: VoiceSessionContext
  assistantText: string
  completion: VoiceSessionCompletion | null
  callbackStatus: PegaCallbackAttempt | null
}> {
  const { voiceSessionRepository } = getVoiceSessionAppServices()
  const now = input.now ?? new Date().toISOString()
  const session = assertSessionAccess(voiceSessionRepository.getSession(input.sessionId), input.token, now)
  const result = processVoiceSessionTurn({
    session,
    userText: input.text,
    inputMode: input.inputMode,
    now,
    voiceModel: input.voiceModel,
    reasoningModel: input.reasoningModel
  })

  if (result.completion) {
    voiceSessionRepository.saveCompletion(result.completion)
    const callbackStatus = await finalizeCompletion(result.completion)
    const state = getSessionStateResponse(session.sessionId)

    return {
      ...state,
      assistantText: result.assistantText,
      callbackStatus
    }
  }

  voiceSessionRepository.saveSession(result.session)
  const state = getSessionStateResponse(session.sessionId)

  return {
    ...state,
    assistantText: result.assistantText
  }
}

export async function completeManagedVoiceSession(input: {
  sessionId: string
  token: string
  now?: string
}): Promise<{
  session: VoiceSessionContext
  completion: VoiceSessionCompletion
  callbackStatus: PegaCallbackAttempt | null
}> {
  const { voiceSessionRepository } = getVoiceSessionAppServices()
  const now = input.now ?? new Date().toISOString()
  const session = assertSessionAccess(voiceSessionRepository.getSession(input.sessionId), input.token, now)
  const completion = voiceSessionRepository.getCompletion(session.sessionId)

  if (!completion) {
    throw new VoiceSessionHttpError(409, 'The session has not reached a final result yet.')
  }

  const latestCallbackStatus = voiceSessionRepository.getCallbackStatus(session.sessionId)
  const callbackStatus =
    latestCallbackStatus?.callbackStatus === 'DELIVERED' ? latestCallbackStatus : await finalizeCompletion(completion)
  const state = getSessionStateResponse(session.sessionId)

  return {
    session: state.session,
    completion,
    callbackStatus
  }
}

export function getManagedCallbackStatus(input: {
  sessionId: string
  token: string
  now?: string
}): PegaCallbackAttempt | null {
  const { voiceSessionRepository } = getVoiceSessionAppServices()
  const now = input.now ?? new Date().toISOString()
  const session = assertSessionAccess(voiceSessionRepository.getSession(input.sessionId), input.token, now)

  return voiceSessionRepository.getCallbackStatus(session.sessionId)
}
