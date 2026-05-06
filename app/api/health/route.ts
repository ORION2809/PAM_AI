import { mkdir } from 'node:fs/promises'

import { NextResponse } from 'next/server'

import { getPamaiStoragePaths } from '@/lib/storagePaths'
import { getVoiceSessionAppServices } from '@/lib/services/voiceSessionAppServices'

export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const storagePaths = getPamaiStoragePaths()

  try {
    await mkdir(storagePaths.rootDirectory, { recursive: true })

    const { voiceSessionRepository } = getVoiceSessionAppServices()
    voiceSessionRepository.getCallbackStatus('HEALTH-CHECK')

    return NextResponse.json({
      status: 'ok',
      storage: {
        rootDirectory: storagePaths.rootDirectory,
        database: storagePaths.databasePath,
        auditDirectory: storagePaths.auditDirectory
      }
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Storage initialization failed.',
        storage: {
          rootDirectory: storagePaths.rootDirectory,
          database: storagePaths.databasePath,
          auditDirectory: storagePaths.auditDirectory
        }
      },
      { status: 503 }
    )
  }
}