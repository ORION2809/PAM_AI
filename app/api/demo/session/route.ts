import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getServerEnv } from '@/lib/env'
import { PegaCaseServiceError, createVoiceSessionRequestFromPegaCase } from '@/lib/services/pegaCaseService'
import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'
import { getPublicRequestOrigin } from '@/lib/utils/network'
import { createVoiceSession } from '@/lib/services/voiceSessionService'

export const runtime = 'nodejs'

const caseIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `demo-session-create:${getRequestIdentifier(request)}`,
      limit: 12,
      windowMs: 60_000
    })
    const env = getServerEnv()
    const requestedCaseId = request.nextUrl.searchParams.get('caseId') ?? env.pamaiDefaultCaseId
    const caseId = caseIdSchema.parse(requestedCaseId)
    let voiceSessionRequest

    try {
      voiceSessionRequest = await createVoiceSessionRequestFromPegaCase({ caseId })
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new PegaCaseServiceError(502, 'Pega returned invalid case data.')
      }

      throw error
    }

    return NextResponse.json(
      createVoiceSession({
        request: voiceSessionRequest,
        baseUrl: getPublicRequestOrigin(request, env.appBaseUrl)
      }),
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid case identifier.' }, { status: 400 })
    }

    if (error instanceof PegaCaseServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create the Pega-backed session.'
      },
      { status: 500 }
    )
  }
}
