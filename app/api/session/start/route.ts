import { NextRequest, NextResponse } from 'next/server'

import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `session-start:${getRequestIdentifier(request)}`,
      limit: 12,
      windowMs: 60_000
    })
    return NextResponse.json(
      {
        error: 'Legacy telecom session start is retired.',
        migration: {
          message: 'Create a PAMAI voice session through the new session APIs.',
          createSessionEndpoint: '/api/v1/voice-sessions',
          demoLaunchEndpoint: '/api/demo/session'
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
        error: error instanceof Error ? error.message : 'Failed to process the legacy session-start endpoint.'
      },
      { status: 500 }
    )
  }
}