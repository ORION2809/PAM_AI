import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetServerEnvCache } from '@/lib/env'
import { resolveVoiceProfile, synthesizeSpeech, transcribeAudio } from '@/lib/services/providers/openAiSpeech'

const originalEnv = process.env

describe('openAiSpeech provider', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      OPENAI_API_KEY: 'sk-test-openai',
      OPENAI_TRANSCRIPTION_MODEL: 'gpt-4o-transcribe',
      OPENAI_TRANSCRIPTION_LANGUAGE: 'en',
      OPENAI_TTS_MODEL: 'gpt-4o-mini-tts',
      OPENAI_TTS_VOICE: 'marin',
      OPENAI_TTS_INSTRUCTIONS: 'Speak brightly and naturally.'
    }
    resetServerEnvCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env = originalEnv
    resetServerEnvCache()
  })

  it('resolves configured OpenAI voices without calling a vendor voice-list endpoint', async () => {
    const resolved = await resolveVoiceProfile(null)

    expect(resolved.voiceProfile).toMatchObject({
      voiceId: 'marin',
      modelId: 'gpt-4o-mini-tts'
    })
    expect(resolved.availableVoices[0]?.voiceId).toBe('marin')
  })

  it('transcribes uploaded audio through the OpenAI audio transcriptions endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: '  separate valid expenses  ' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )

    const transcript = await transcribeAudio(new File([new Uint8Array([1, 2, 3])], 'turn.webm', { type: 'audio/webm' }))
    const [url, init] = fetchMock.mock.calls[0] ?? []
    const body = init?.body as FormData

    expect(transcript).toBe('separate valid expenses')
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-test-openai' })
    expect(body.get('model')).toBe('gpt-4o-transcribe')
    expect(body.get('language')).toBe('en')
    expect(body.get('response_format')).toBe('json')
    expect(body.get('file')).toBeInstanceOf(File)
  })

  it('synthesizes assistant speech through the OpenAI speech endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([115, 111, 117, 110, 100]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' }
      })
    )

    const audio = await synthesizeSpeech({
      text: 'Are these duplicates or separate valid expenses?',
      voiceId: 'cedar'
    })
    const [url, init] = fetchMock.mock.calls[0] ?? []

    expect(audio).toEqual({
      audioBase64: Buffer.from('sound').toString('base64'),
      mimeType: 'audio/mpeg'
    })
    expect(url).toBe('https://api.openai.com/v1/audio/speech')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-test-openai',
      'Content-Type': 'application/json'
    })
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'gpt-4o-mini-tts',
      voice: 'cedar',
      input: 'Are these duplicates or separate valid expenses?',
      instructions: 'Speak brightly and naturally.',
      response_format: 'mp3'
    })
  })
})
