import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export interface ServerEnv {
  elevenLabsApiKey: string | null
  openAiApiKey: string | null
  elevenLabsSttModel: string
  elevenLabsTtsModel: string
  elevenLabsLanguage: string
  elevenLabsDefaultVoiceId: string
  openAiModels: string[]
  pamaiSessionTokenSecret: string
  appBaseUrl: string
  mockPegaCallbacks: boolean
}

let cachedEnv: ServerEnv | null = null
const generatedSessionTokenSecret = randomBytes(32).toString('hex')

function readSecretFromWorkspaceFile(fileName: string): string | null {
  const filePath = path.join(process.cwd(), fileName)

  if (!existsSync(filePath)) {
    return null
  }

  const fileContents = readFileSync(filePath, 'utf8').trim()
  return fileContents.length > 0 ? fileContents : null
}

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv
  }

  cachedEnv = {
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? readSecretFromWorkspaceFile('elevenlabs.txt'),
    openAiApiKey: process.env.OPENAI_API_KEY ?? readSecretFromWorkspaceFile('openai.txt'),
    elevenLabsSttModel: process.env.ELEVENLABS_STT_MODEL ?? 'scribe_v2',
    elevenLabsTtsModel: process.env.ELEVENLABS_TTS_MODEL ?? 'eleven_multilingual_v2',
    elevenLabsLanguage: process.env.ELEVENLABS_LANGUAGE ?? 'en',
    elevenLabsDefaultVoiceId: process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb',
    pamaiSessionTokenSecret:
      process.env.PAMAI_SESSION_TOKEN_SECRET ?? readSecretFromWorkspaceFile('pamai-session-secret.txt') ?? generatedSessionTokenSecret,
    appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    mockPegaCallbacks: (process.env.PAMAI_MOCK_PEGA_CALLBACKS ?? 'true').toLowerCase() !== 'false',
    openAiModels: (process.env.OPENAI_REASONING_MODELS ?? 'gpt-5.4-mini,gpt-4o-mini')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean)
  }

  return cachedEnv
}