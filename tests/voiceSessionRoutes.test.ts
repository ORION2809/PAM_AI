import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/providers/elevenLabsSpeech', () => ({
  resolveVoiceProfile: vi.fn(async () => ({
    voiceProfile: {
      voiceId: 'voice-test',
      name: 'Test Voice',
      modelId: 'eleven_multilingual_v2'
    },
    availableVoices: [
      {
        voiceId: 'voice-test',
        name: 'Test Voice',
        description: 'Mock voice for route tests.',
        labels: {}
      }
    ]
  })),
  synthesizeSpeech: vi.fn(async (input: { text: string }) => ({
    audioBase64: Buffer.from(input.text).toString('base64'),
    mimeType: 'audio/mpeg'
  })),
  transcribeAudio: vi.fn(async () => 'mock transcript')
}))

vi.mock('@/lib/services/pegaCallbackService', () => ({
  deliverPegaCallback: vi.fn(async (input: { completion: { sessionId: string } }) => ({
    id: `ATTEMPT-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    sessionId: input.completion.sessionId,
    callbackStatus: 'DELIVERED',
    httpStatusCode: 202,
    responseBody: JSON.stringify({ mocked: true }),
    attemptedAt: '2026-05-06T10:05:00.000Z',
    retryCount: 0
  }))
}))

import { POST as createVoiceSessionRoute } from '@/app/api/v1/voice-sessions/route'
import { GET as getVoiceSessionRoute } from '@/app/api/v1/voice-sessions/[sessionId]/route'
import { GET as getCallbackStatusRoute } from '@/app/api/v1/voice-sessions/[sessionId]/callback-status/route'
import { POST as startVoiceSessionRoute } from '@/app/api/v1/voice-sessions/[sessionId]/start/route'
import { POST as textTurnRoute } from '@/app/api/v1/voice-sessions/[sessionId]/turn/text/route'
import { createDemoVoiceSessionRequest } from '@/lib/fixtures/demoVoiceSession'

const globalStore = globalThis as typeof globalThis & {
  __voiceCsrRateLimitStore?: Map<string, { count: number; resetAt: number }>
}

function readTokenFromConversationUrl(conversationUrl: string): string {
  const url = new URL(conversationUrl)
  return decodeURIComponent(url.hash.replace('#token=', ''))
}

async function createSession(ipAddress: string) {
  const response = await createVoiceSessionRoute(
    new NextRequest('http://localhost/api/v1/voice-sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': ipAddress
      },
      body: JSON.stringify(createDemoVoiceSessionRequest())
    })
  )

  const body = (await response.json()) as {
    sessionId: string
    status: 'READY'
    conversationUrl: string
    expiresAt: string
  }

  return {
    response,
    body,
    sessionId: body.sessionId,
    token: readTokenFromConversationUrl(body.conversationUrl)
  }
}

describe('voice session routes', () => {
  beforeEach(() => {
    globalStore.__voiceCsrRateLimitStore?.clear()
  })

  it('creates a secure session URL and enforces a token on session fetch', async () => {
    const created = await createSession('10.1.0.1')

    expect(created.response.status).toBe(201)
    expect(created.body.status).toBe('READY')
    expect(created.body.conversationUrl).toContain('#token=')

    const unauthorized = await getVoiceSessionRoute(
      new NextRequest(`http://localhost/api/v1/voice-sessions/${created.sessionId}`, {
        headers: {
          'x-forwarded-for': '10.1.0.2'
        }
      }),
      {
        params: Promise.resolve({ sessionId: created.sessionId })
      }
    )

    expect(unauthorized.status).toBe(401)

    const authorized = await getVoiceSessionRoute(
      new NextRequest(
        `http://localhost/api/v1/voice-sessions/${created.sessionId}?token=${encodeURIComponent(created.token)}`,
        {
          headers: {
            'x-forwarded-for': '10.1.0.3'
          }
        }
      ),
      {
        params: Promise.resolve({ sessionId: created.sessionId })
      }
    )

    expect(authorized.status).toBe(200)

    const body = (await authorized.json()) as {
      session: {
        sessionStatus: string
        sessionState: string
        customer: { mobileLastFour: string }
      }
      completion: null
      callbackStatus: null
    }

    expect(body.session.sessionStatus).toBe('READY')
    expect(body.session.sessionState).toBe('SESSION_LOADED')
    expect(body.session.customer.mobileLastFour).toBe('3210')
    expect(body.completion).toBeNull()
    expect(body.callbackStatus).toBeNull()
  })

  it('runs the start and text-turn routes through a complete clarification flow', async () => {
    const created = await createSession('10.2.0.1')

    const startResponse = await startVoiceSessionRoute(
      new NextRequest(`http://localhost/api/v1/voice-sessions/${created.sessionId}/start`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '10.2.0.2',
          'x-session-token': created.token
        },
        body: JSON.stringify({})
      }),
      {
        params: Promise.resolve({ sessionId: created.sessionId })
      }
    )

    expect(startResponse.status).toBe(200)

    const started = (await startResponse.json()) as {
      session: { sessionState: string }
      assistantText: string
      audio: { mimeType: string }
    }

    expect(started.session.sessionState).toBe('IDENTITY_CHECK')
    expect(started.assistantText).toContain('last four digits')
    expect(started.audio.mimeType).toBe('audio/mpeg')

    const verifiedResponse = await textTurnRoute(
      new NextRequest(`http://localhost/api/v1/voice-sessions/${created.sessionId}/turn/text`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '10.2.0.3',
          'x-session-token': created.token
        },
        body: JSON.stringify({ text: '3210' })
      }),
      {
        params: Promise.resolve({ sessionId: created.sessionId })
      }
    )

    expect(verifiedResponse.status).toBe(200)

    const verified = (await verifiedResponse.json()) as {
      session: { sessionState: string }
      completion: null
    }

    expect(verified.session.sessionState).toBe('USER_CLARIFICATION')
    expect(verified.completion).toBeNull()

    const clarificationResponse = await textTurnRoute(
      new NextRequest(`http://localhost/api/v1/voice-sessions/${created.sessionId}/turn/text`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '10.2.0.4',
          'x-session-token': created.token
        },
        body: JSON.stringify({
          text: 'They are separate rides. One was from home to office and the other was from office to a client meeting.'
        })
      }),
      {
        params: Promise.resolve({ sessionId: created.sessionId })
      }
    )

    expect(clarificationResponse.status).toBe(200)

    const clarification = (await clarificationResponse.json()) as {
      session: { sessionState: string }
      assistantText: string
    }

    expect(clarification.session.sessionState).toBe('CONFIRM_FINAL_ANSWER')
    expect(clarification.assistantText).toContain('separate valid expenses')

    const completionResponse = await textTurnRoute(
      new NextRequest(`http://localhost/api/v1/voice-sessions/${created.sessionId}/turn/text`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '10.2.0.5',
          'x-session-token': created.token
        },
        body: JSON.stringify({ text: 'yes' })
      }),
      {
        params: Promise.resolve({ sessionId: created.sessionId })
      }
    )

    expect(completionResponse.status).toBe(200)

    const completed = (await completionResponse.json()) as {
      session: { sessionStatus: string; sessionState: string }
      completion: { userDecision: { decisionType: string } }
      callbackStatus: { callbackStatus: string; httpStatusCode: number }
    }

    expect(completed.session.sessionStatus).toBe('COMPLETED')
    expect(completed.session.sessionState).toBe('COMPLETED')
    expect(completed.completion.userDecision.decisionType).toBe('SEPARATE_VALID_EXPENSES')
    expect(completed.callbackStatus.callbackStatus).toBe('DELIVERED')
    expect(completed.callbackStatus.httpStatusCode).toBe(202)

    const callbackStatusResponse = await getCallbackStatusRoute(
      new NextRequest(`http://localhost/api/v1/voice-sessions/${created.sessionId}/callback-status`, {
        headers: {
          'x-forwarded-for': '10.2.0.6',
          'x-session-token': created.token
        }
      }),
      {
        params: Promise.resolve({ sessionId: created.sessionId })
      }
    )

    expect(callbackStatusResponse.status).toBe(200)

    const callbackBody = (await callbackStatusResponse.json()) as {
      callbackStatus: { callbackStatus: string; httpStatusCode: number }
    }

    expect(callbackBody.callbackStatus.callbackStatus).toBe('DELIVERED')
    expect(callbackBody.callbackStatus.httpStatusCode).toBe(202)
  })
})