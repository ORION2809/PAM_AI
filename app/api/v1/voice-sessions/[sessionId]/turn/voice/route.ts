import { NextResponse } from 'next/server'

import { resolveVoiceProfile, synthesizeSpeech, transcribeAudio } from '@/lib/services/providers/elevenLabsSpeech'
import { RateLimitError, assertRateLimit, getRequestIdentifier } from '@/lib/services/rateLimit'
import { VoiceSessionHttpError, processManagedVoiceSessionTurn } from '@/lib/services/voiceSessionService'

export const runtime = 'nodejs'

const maxAudioSizeBytes = 10 * 1024 * 1024

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }): Promise<NextResponse> {
  try {
    assertRateLimit({
      key: `voice-session-voice:${getRequestIdentifier(request)}`,
      limit: 32,
      windowMs: 60_000
    })
    const { sessionId } = await context.params
    const token = request.headers.get('x-session-token') ?? ''

    if (!token) {
      return NextResponse.json({ error: 'A valid session token is required.' }, { status: 401 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio')
    const voiceId = formData.get('voiceId')

    if (!(audioFile instanceof File)) {
      return NextResponse.json({ error: 'An audio file is required.' }, { status: 400 })
    }

    if (audioFile.size === 0 || audioFile.size > maxAudioSizeBytes) {
      return NextResponse.json({ error: 'Audio file size is invalid for this demo endpoint.' }, { status: 413 })
    }

    if (!audioFile.type.startsWith('audio/')) {
      return NextResponse.json({ error: 'Only audio uploads are accepted.' }, { status: 400 })
    }

    const transcript = await transcribeAudio(audioFile)
    const { voiceProfile } = await resolveVoiceProfile(typeof voiceId === 'string' ? voiceId : null)
    const result = await processManagedVoiceSessionTurn({
      sessionId,
      token,
      text: transcript,
      inputMode: 'voice',
      voiceModel: voiceProfile.modelId,
      reasoningModel: 'gpt-5.4-mini'
    })
    const audio = await synthesizeSpeech({
      text: result.assistantText,
      voiceId: voiceProfile.voiceId
    })

    return NextResponse.json({
      ...result,
      transcript,
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
        error: error instanceof Error ? error.message : 'Failed to process the voice turn.'
      },
      { status: 500 }
    )
  }
}