import { NextRequest, NextResponse } from 'next/server'

import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'
import { VoiceSessionHttpError, getManagedCallbackStatus } from '@/lib/services/voiceSessionService'

export const runtime = 'nodejs'

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `voice-session-callback:${getRequestIdentifier(request)}`,
      limit: 60,
      windowMs: 60_000
    })
    const { sessionId } = await context.params
    const token = request.headers.get('x-session-token') ?? request.nextUrl.searchParams.get('token') ?? ''

    if (!token) {
      return NextResponse.json({ error: 'A valid session token is required.' }, { status: 401 })
    }

    return NextResponse.json({ callbackStatus: getManagedCallbackStatus({ sessionId, token }) })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }

    if (error instanceof VoiceSessionHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to read the callback status.'
      },
      { status: 500 }
    )
  }
}