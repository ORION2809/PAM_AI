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

interface OpenAiTranscriptionResponse {
  text?: string
}

const openAiVoiceOptions: VoiceOption[] = [
  {
    voiceId: 'alloy',
    name: 'Alloy',
    description: 'Balanced OpenAI voice for clear support conversations.',
    labels: { provider: 'OpenAI', tone: 'balanced' }
  },
  {
    voiceId: 'ash',
    name: 'Ash',
    description: 'OpenAI voice with a composed support delivery.',
    labels: { provider: 'OpenAI', tone: 'composed' }
  },
  {
    voiceId: 'ballad',
    name: 'Ballad',
    description: 'Expressive OpenAI voice for polished demo narration.',
    labels: { provider: 'OpenAI', tone: 'expressive' }
  },
  {
    voiceId: 'marin',
    name: 'Marin',
    description: 'High-quality OpenAI voice recommended for natural support audio.',
    labels: { provider: 'OpenAI', tone: 'natural' }
  },
  {
    voiceId: 'cedar',
    name: 'Cedar',
    description: 'High-quality OpenAI voice with a calm, grounded delivery.',
    labels: { provider: 'OpenAI', tone: 'calm' }
  },
  {
    voiceId: 'coral',
    name: 'Coral',
    description: 'Warm OpenAI voice for concise customer guidance.',
    labels: { provider: 'OpenAI', tone: 'warm' }
  },
  {
    voiceId: 'echo',
    name: 'Echo',
    description: 'Crisp OpenAI voice for operational demos.',
    labels: { provider: 'OpenAI', tone: 'crisp' }
  },
  {
    voiceId: 'fable',
    name: 'Fable',
    description: 'Narrative OpenAI voice for guided walkthroughs.',
    labels: { provider: 'OpenAI', tone: 'narrative' }
  },
  {
    voiceId: 'nova',
    name: 'Nova',
    description: 'Bright OpenAI voice for energetic demo delivery.',
    labels: { provider: 'OpenAI', tone: 'bright' }
  },
  {
    voiceId: 'onyx',
    name: 'Onyx',
    description: 'Deeper OpenAI voice for steady support interactions.',
    labels: { provider: 'OpenAI', tone: 'steady' }
  },
  {
    voiceId: 'shimmer',
    name: 'Shimmer',
    description: 'Lighter OpenAI voice for friendly customer prompts.',
    labels: { provider: 'OpenAI', tone: 'friendly' }
  },
  {
    voiceId: 'sage',
    name: 'Sage',
    description: 'Measured OpenAI voice for careful confirmation prompts.',
    labels: { provider: 'OpenAI', tone: 'measured' }
  },
  {
    voiceId: 'verse',
    name: 'Verse',
    description: 'Smooth OpenAI voice for confident demo narration.',
    labels: { provider: 'OpenAI', tone: 'smooth' }
  }
]

function assertOpenAiKey(): string {
  const env = getServerEnv()

  if (!env.openAiApiKey) {
    throw new Error('OpenAI API key is unavailable.')
  }

  return env.openAiApiKey
}

function getFallbackVoice(): VoiceOption {
  const env = getServerEnv()

  return (
    openAiVoiceOptions.find((voice) => voice.voiceId === env.openAiTtsVoice) ?? {
      voiceId: env.openAiTtsVoice,
      name: env.openAiTtsVoice,
      description: 'Configured OpenAI voice for the demo flow.',
      labels: { provider: 'OpenAI' }
    }
  )
}

function resolveOpenAiVoiceId(preferredVoiceId?: string | null): string {
  const env = getServerEnv()
  const configuredVoice = openAiVoiceOptions.find((voice) => voice.voiceId === env.openAiTtsVoice)
  const preferredVoice = openAiVoiceOptions.find((voice) => voice.voiceId === preferredVoiceId)

  return preferredVoice?.voiceId ?? configuredVoice?.voiceId ?? env.openAiTtsVoice
}

export async function listVoices(): Promise<VoiceOption[]> {
  const fallbackVoice = getFallbackVoice()
  const dedupedVoices = [
    fallbackVoice,
    ...openAiVoiceOptions.filter((voice) => voice.voiceId !== fallbackVoice.voiceId)
  ]

  return dedupedVoices
}

export async function resolveVoiceProfile(preferredVoiceId?: string | null): Promise<{
  voiceProfile: VoiceProfile
  availableVoices: VoiceOption[]
}> {
  const env = getServerEnv()
  const availableVoices = await listVoices()
  const voiceId = resolveOpenAiVoiceId(preferredVoiceId)
  const matchedVoice = availableVoices.find((voice) => voice.voiceId === voiceId) ?? getFallbackVoice()

  return {
    voiceProfile: {
      voiceId: matchedVoice.voiceId,
      name: matchedVoice.name,
      modelId: env.openAiTtsModel
    },
    availableVoices
  }
}

export async function transcribeAudio(file: File): Promise<string> {
  const env = getServerEnv()
  const apiKey = assertOpenAiKey()
  const formData = new FormData()

  formData.append('model', env.openAiTranscriptionModel)
  formData.append('response_format', 'json')

  if (env.openAiTranscriptionLanguage) {
    formData.append('language', env.openAiTranscriptionLanguage)
  }

  formData.append('file', file)

  const response = await fetchWithTimeout('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  })

  if (!response.ok) {
    throw new Error(`OpenAI transcription failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as OpenAiTranscriptionResponse
  const transcript = payload.text?.trim()

  if (!transcript) {
    throw new Error('OpenAI transcription returned an empty transcript.')
  }

  return transcript
}

export async function synthesizeSpeech(input: {
  text: string
  voiceId: string
}): Promise<{ audioBase64: string; mimeType: string }> {
  const env = getServerEnv()
  const apiKey = assertOpenAiKey()
  const voiceId = resolveOpenAiVoiceId(input.voiceId)
  const response = await fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: env.openAiTtsModel,
      voice: voiceId,
      input: input.text,
      instructions: env.openAiTtsInstructions,
      response_format: 'mp3'
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI speech synthesis failed with status ${response.status}.`)
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())

  return {
    audioBase64: audioBuffer.toString('base64'),
    mimeType: 'audio/mpeg'
  }
}
