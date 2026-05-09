import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { resolveVoiceProfile, synthesizeSpeech } from '@/lib/services/providers/openAiSpeech'
import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'
import { VoiceSessionHttpError, startManagedVoiceSession } from '@/lib/services/voiceSessionService'

export const runtime = 'nodejs'

const startSchema = z.object({
  voiceId: z.string().max(80).regex(/^[A-Za-z0-9_-]+$/).nullable().optional()
})

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `voice-session-start:${getRequestIdentifier(request)}`,
      limit: 30,
      windowMs: 60_000
    })
    const { sessionId } = await context.params
    const token = request.headers.get('x-session-token') ?? ''

    if (!token) {
      return NextResponse.json({ error: 'A valid session token is required.' }, { status: 401 })
    }

    const payload = startSchema.parse(await request.json().catch(() => ({})))
    const { voiceProfile, availableVoices } = await resolveVoiceProfile(payload.voiceId)
    const result = startManagedVoiceSession({ sessionId, token })
    const audio = await synthesizeSpeech({
      text: result.assistantText,
      voiceId: voiceProfile.voiceId
    })

    return NextResponse.json({
      ...result,
      voices: availableVoices,
      audio
    })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 })
    }

    if (error instanceof VoiceSessionHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to start the voice session.'
      },
      { status: 500 }
    )
  }
}
