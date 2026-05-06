import { NextRequest, NextResponse } from 'next/server'

import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'
import { VoiceSessionHttpError, completeManagedVoiceSession } from '@/lib/services/voiceSessionService'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `voice-session-complete:${getRequestIdentifier(request)}`,
      limit: 24,
      windowMs: 60_000
    })
    const { sessionId } = await context.params
    const token = request.headers.get('x-session-token') ?? ''

    if (!token) {
      return NextResponse.json({ error: 'A valid session token is required.' }, { status: 401 })
    }

    return NextResponse.json(await completeManagedVoiceSession({ sessionId, token }))
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }

    if (error instanceof VoiceSessionHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to finalize the voice session.'
      },
      { status: 500 }
    )
  }
}