import { getPamaiStoragePaths } from '@/lib/storagePaths'
import { createVoiceSessionRepository } from '@/lib/services/voiceSessionRepository'
import type { VoiceSessionRepository } from '@/lib/services/voiceSessionRepository'

let cachedVoiceSessionRepository: VoiceSessionRepository | null = null

function getVoiceSessionRepository(): VoiceSessionRepository {
  if (cachedVoiceSessionRepository) {
    return cachedVoiceSessionRepository
  }

  const storagePaths = getPamaiStoragePaths()

  try {
    cachedVoiceSessionRepository = createVoiceSessionRepository({
      databasePath: storagePaths.databasePath,
      auditDirectory: storagePaths.auditDirectory
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown storage initialization failure.'
    throw new Error(
      `Failed to initialize PAMAI storage at ${storagePaths.rootDirectory}. ${reason}`
    )
  }

  return cachedVoiceSessionRepository
}

export function getVoiceSessionAppServices() {
  return {
    voiceSessionRepository: getVoiceSessionRepository()
  }
}