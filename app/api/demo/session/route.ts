import { NextRequest, NextResponse } from 'next/server'

import { createDemoVoiceSessionRequest } from '@/lib/fixtures/demoVoiceSession'
import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'
import { createVoiceSession } from '@/lib/services/voiceSessionService'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `demo-session-create:${getRequestIdentifier(request)}`,
      limit: 12,
      windowMs: 60_000
    })
    return NextResponse.json(
      createVoiceSession({
        request: createDemoVoiceSessionRequest()
      }),
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create the demo session.'
      },
      { status: 500 }
    )
  }
}