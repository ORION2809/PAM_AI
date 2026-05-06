import { getServerEnv } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/utils/network'

export interface VoiceProfile {
  voiceId: string
  name: string
  modelId: string
}

export interface VoiceOption {
  voiceId: string
  name: string
  description: string
  labels: Record<string, string>
}

interface ElevenLabsVoicesResponse {
  voices?: Array<{
    voice_id?: string
    name?: string
    description?: string
    labels?: Record<string, string>
  }>
}

interface ElevenLabsTranscriptionResponse {
  text?: string
}

const fallbackVoiceName = 'Support Voice'

function getFallbackVoice(): VoiceOption {
  const env = getServerEnv()

  return {
    voiceId: env.elevenLabsDefaultVoiceId,
    name: fallbackVoiceName,
    description: 'Fallback ElevenLabs voice for the demo flow.',
    labels: {}
  }
}

function assertElevenLabsKey(): string {
  const env = getServerEnv()

  if (!env.elevenLabsApiKey) {
    throw new Error('ElevenLabs API key is unavailable.')
  }

  return env.elevenLabsApiKey
}

export async function listVoices(): Promise<VoiceOption[]> {
  const apiKey = assertElevenLabsKey()

  try {
    const response = await fetchWithTimeout('https://api.elevenlabs.io/v2/voices?page_size=8&voice_type=default', {
      headers: {
        'xi-api-key': apiKey
      },
      cache: 'no-store'
    })

    if (!response.ok) {
      throw new Error(`ElevenLabs voices failed with status ${response.status}.`)
    }

    const payload = (await response.json()) as ElevenLabsVoicesResponse
    const voices =
      payload.voices
        ?.filter((voice) => Boolean(voice.voice_id && voice.name))
        .map((voice) => ({
          voiceId: voice.voice_id as string,
          name: voice.name as string,
          description: voice.description ?? '',
          labels: voice.labels ?? {}
        })) ?? []

    return voices.length > 0 ? voices : [getFallbackVoice()]
  } catch {
    return [getFallbackVoice()]
  }
}

export async function resolveVoiceProfile(preferredVoiceId?: string | null): Promise<{
  voiceProfile: VoiceProfile
  availableVoices: VoiceOption[]
}> {
  const env = getServerEnv()
  const availableVoices = await listVoices()
  const matchedVoice =
    availableVoices.find((voice) => voice.voiceId === preferredVoiceId) ??
    availableVoices[0] ??
    getFallbackVoice()

  return {
    voiceProfile: {
      voiceId: matchedVoice.voiceId,
      name: matchedVoice.name,
      modelId: env.elevenLabsTtsModel
    },
    availableVoices
  }
}

export async function transcribeAudio(file: File): Promise<string> {
  const env = getServerEnv()
  const apiKey = assertElevenLabsKey()
  const formData = new FormData()

  formData.append('model_id', env.elevenLabsSttModel)
  formData.append('language_code', env.elevenLabsLanguage)
  formData.append('timestamps_granularity', 'word')
  formData.append('tag_audio_events', 'false')
  formData.append('file', file)

  const response = await fetchWithTimeout('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey
    },
    body: formData
  })

  if (!response.ok) {
    throw new Error(`ElevenLabs STT failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as ElevenLabsTranscriptionResponse

  if (!payload.text) {
    throw new Error('ElevenLabs STT returned an empty transcript.')
  }

  return payload.text
}

export async function synthesizeSpeech(input: {
  text: string
  voiceId: string
}): Promise<{ audioBase64: string; mimeType: string }> {
  const env = getServerEnv()
  const apiKey = assertElevenLabsKey()
  const response = await fetchWithTimeout(
    `https://api.elevenlabs.io/v1/text-to-speech/${input.voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: input.text,
        model_id: env.elevenLabsTtsModel,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.2,
          speed: 1
        }
      })
    }
  )

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS failed with status ${response.status}.`)
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())

  return {
    audioBase64: audioBuffer.toString('base64'),
    mimeType: 'audio/mpeg'
  }
}