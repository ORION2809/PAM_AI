import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface ServerEnv {
  openAiApiKey: string | null
  openAiTranscriptionModel: string
  openAiTranscriptionLanguage: string | null
  openAiTtsModel: string
  openAiTtsVoice: string
  openAiTtsInstructions: string
  openAiModels: string[]
  pamaiSessionTokenSecret: string
  appBaseUrl: string
  mockPegaCallbacks: boolean
  pegaClientId: string | null
  pegaClientSecret: string | null
  pegaTokenEndpoint: string | null
  pegaExpenseDataViewUrl: string | null
  pamaiPegaCallbackUrl: string
  pamaiDefaultCustomerMobile: string
  pamaiDefaultCaseId: string
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

function getOrCreateWorkspaceSecret(fileName: string): string {
  const existingSecret = readSecretFromWorkspaceFile(fileName)

  if (existingSecret) {
    return existingSecret
  }

  if (process.env.NODE_ENV === 'test') {
    return generatedSessionTokenSecret
  }

  const filePath = path.join(process.cwd(), fileName)

  try {
    writeFileSync(filePath, `${generatedSessionTokenSecret}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    })

    return generatedSessionTokenSecret
  } catch {
    return readSecretFromWorkspaceFile(fileName) ?? generatedSessionTokenSecret
  }
}

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv
  }

  cachedEnv = {
    openAiApiKey: process.env.OPENAI_API_KEY ?? readSecretFromWorkspaceFile('openai.txt'),
    openAiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-transcribe',
    openAiTranscriptionLanguage: process.env.OPENAI_TRANSCRIPTION_LANGUAGE ?? 'en',
    openAiTtsModel: process.env.OPENAI_TTS_MODEL ?? 'gpt-4o-mini-tts',
    openAiTtsVoice: process.env.OPENAI_TTS_VOICE ?? 'nova',
    openAiTtsInstructions:
      process.env.OPENAI_TTS_INSTRUCTIONS ??
      'Speak as a warm young adult female support assistant. Keep the delivery natural, bright, and concise. Say Pam AI as Pam A.I., not as one fused word.',
    pamaiSessionTokenSecret:
      process.env.PAMAI_SESSION_TOKEN_SECRET ?? getOrCreateWorkspaceSecret('pamai-session-secret.txt'),
    appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    mockPegaCallbacks: (process.env.PAMAI_MOCK_PEGA_CALLBACKS ?? 'true').toLowerCase() !== 'false',
    pegaClientId: process.env.PEGA_CLIENT_ID ?? null,
    pegaClientSecret: process.env.PEGA_CLIENT_SECRET ?? null,
    pegaTokenEndpoint: process.env.PEGA_TOKEN_ENDPOINT ?? null,
    pegaExpenseDataViewUrl: process.env.PEGA_EXPENSE_DATA_VIEW_URL ?? null,
    pamaiPegaCallbackUrl:
      process.env.PAMAI_PEGA_CALLBACK_URL ??
      'https://bluevoir-251.pegademo.com/prweb/api/VoiceAICaseCreation/V1/ResumeFlowfromVoiceAI',
    pamaiDefaultCustomerMobile: process.env.PAMAI_DEFAULT_CUSTOMER_MOBILE ?? '+910000003210',
    pamaiDefaultCaseId: process.env.PAMAI_DEFAULT_CASE_ID ?? 'E-7036',
    openAiModels: (process.env.OPENAI_REASONING_MODELS ?? 'gpt-5.4-mini,gpt-4o-mini')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean)
  }

  return cachedEnv
}

export function resetServerEnvCache(): void {
  cachedEnv = null
}
