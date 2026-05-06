import { NextRequest, NextResponse } from 'next/server'

import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `text-turn:${getRequestIdentifier(request)}`,
      limit: 36,
      windowMs: 60_000
    })
    return NextResponse.json(
      {
        error: 'Legacy telecom text turns are retired.',
        migration: {
          message: 'Send turns through /api/v1/voice-sessions/{sessionId}/turn/text with the signed session token.',
          endpoint: '/api/v1/voice-sessions/{sessionId}/turn/text'
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
        error: error instanceof Error ? error.message : 'Failed to process the legacy text-turn endpoint.'
      },
      { status: 500 }
    )
  }
}