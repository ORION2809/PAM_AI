import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { resolveVoiceProfile, synthesizeSpeech } from '@/lib/services/providers/openAiSpeech'
import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'
import { VoiceSessionHttpError, processManagedVoiceSessionTurn } from '@/lib/services/voiceSessionService'

export const runtime = 'nodejs'

const textTurnSchema = z.object({
  text: z.string().min(1).max(2_000),
  voiceId: z.string().max(80).regex(/^[A-Za-z0-9_-]+$/).nullable().optional()
})

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `voice-session-text:${getRequestIdentifier(request)}`,
      limit: 48,
      windowMs: 60_000
    })
    const { sessionId } = await context.params
    const token = request.headers.get('x-session-token') ?? ''

    if (!token) {
      return NextResponse.json({ error: 'A valid session token is required.' }, { status: 401 })
    }

    const payload = textTurnSchema.parse(await request.json())
    const { voiceProfile } = await resolveVoiceProfile(payload.voiceId)
    const result = await processManagedVoiceSessionTurn({
      sessionId,
      token,
      text: payload.text,
      inputMode: 'text',
      voiceModel: voiceProfile.modelId,
      reasoningModel: 'gpt-5.4-mini'
    })
    const audio = await synthesizeSpeech({
      text: result.assistantText,
      voiceId: voiceProfile.voiceId
    })

    return NextResponse.json({
      ...result,
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
        error: error instanceof Error ? error.message : 'Failed to process the text turn.'
      },
      { status: 500 }
    )
  }
}
