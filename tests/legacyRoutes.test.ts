import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { GET as getLegacyCase } from '@/app/api/cases/[caseId]/route'
import { POST as startLegacySession } from '@/app/api/session/start/route'
import { POST as postLegacyTextTurn } from '@/app/api/turn/text/route'
import { POST as postLegacyVoiceTurn } from '@/app/api/turn/voice/route'

const globalStore = globalThis as typeof globalThis & {
  __voiceCsrRateLimitStore?: Map<string, { count: number; resetAt: number }>
}

describe('legacy endpoint retirement', () => {
  beforeEach(() => {
    globalStore.__voiceCsrRateLimitStore?.clear()
  })

  it('returns 410 with migration guidance for the retired session-start endpoint', async () => {
    const response = await startLegacySession(
      new NextRequest('http://localhost/api/session/start', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '10.0.0.1'
        }
      })
    )

    expect(response.status).toBe(410)

    const body = (await response.json()) as {
      error: string
      migration: { createSessionEndpoint: string; demoLaunchEndpoint: string }
    }

    expect(body.error).toContain('retired')
    expect(body.migration.createSessionEndpoint).toBe('/api/v1/voice-sessions')
    expect(body.migration.demoLaunchEndpoint).toBe('/api/demo/session')
  })

  it('returns 410 with the replacement text-turn endpoint', async () => {
    const response = await postLegacyTextTurn(
      new NextRequest('http://localhost/api/turn/text', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '10.0.0.2'
        }
      })
    )

    expect(response.status).toBe(410)

    const body = (await response.json()) as {
      error: string
      migration: { endpoint: string }
    }

    expect(body.error).toContain('retired')
    expect(body.migration.endpoint).toBe('/api/v1/voice-sessions/{sessionId}/turn/text')
  })

  it('returns 410 with the replacement voice-turn endpoint', async () => {
    const response = await postLegacyVoiceTurn(
      new Request('http://localhost/api/turn/voice', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '10.0.0.3'
        }
      })
    )

    expect(response.status).toBe(410)

    const body = (await response.json()) as {
      error: string
      migration: { endpoint: string }
    }

    expect(body.error).toContain('retired')
    expect(body.migration.endpoint).toBe('/api/v1/voice-sessions/{sessionId}/turn/voice')
  })

  it('returns 410 for the retired case lookup endpoint', async () => {
    const response = await getLegacyCase(new Request('http://localhost/api/cases/legacy-case-1'), {
      params: Promise.resolve({ caseId: 'legacy-case-1' })
    })

    expect(response.status).toBe(410)

    const body = (await response.json()) as {
      error: string
      migration: { createSessionEndpoint: string; demoLaunchEndpoint: string }
    }

    expect(body.error).toContain('retired')
    expect(body.migration.createSessionEndpoint).toBe('/api/v1/voice-sessions')
    expect(body.migration.demoLaunchEndpoint).toBe('/api/demo/session')
  })
})