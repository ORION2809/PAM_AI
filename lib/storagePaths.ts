import path from 'node:path'

export interface PamaiStoragePaths {
  rootDirectory: string
  databasePath: string
  auditDirectory: string
}

function resolveStorageRoot(): string {
  const configuredRoot = process.env.PAMAI_DATA_DIR?.trim()

  if (configuredRoot) {
    return path.resolve(configuredRoot)
  }

  return path.join(process.cwd(), 'data')
}

export function getPamaiStoragePaths(): PamaiStoragePaths {
  const rootDirectory = resolveStorageRoot()

  return {
    rootDirectory,
    databasePath: path.join(rootDirectory, 'pamai.sqlite'),
    auditDirectory: path.join(rootDirectory, 'pamai-sessions')
  }
}