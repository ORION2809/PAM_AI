import { NextRequest, NextResponse } from 'next/server'

import { getServerEnv } from '@/lib/env'
import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'
import { getPublicRequestOrigin } from '@/lib/utils/network'
import { VoiceSessionHttpError, createVoiceSession } from '@/lib/services/voiceSessionService'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `voice-session-create:${getRequestIdentifier(request)}`,
      limit: 24,
      windowMs: 60_000
    })
    const env = getServerEnv()
    const payload = await request.json()
    const session = createVoiceSession({ request: payload, baseUrl: getPublicRequestOrigin(request, env.appBaseUrl) })

    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }

    if (error instanceof VoiceSessionHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create the voice session.'
      },
      { status: 500 }
    )
  }
}
