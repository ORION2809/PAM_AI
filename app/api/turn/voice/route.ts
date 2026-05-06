import { NextResponse } from 'next/server'

import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `voice-turn:${getRequestIdentifier(request)}`,
      limit: 24,
      windowMs: 60_000
    })
    return NextResponse.json(
      {
        error: 'Legacy telecom voice turns are retired.',
        migration: {
          message: 'Send audio through /api/v1/voice-sessions/{sessionId}/turn/voice with the signed session token.',
          endpoint: '/api/v1/voice-sessions/{sessionId}/turn/voice'
        }
      },
      { status: 410 }
    )
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process the legacy voice-turn endpoint.'
      },
      { status: 500 }
    )
  }
}