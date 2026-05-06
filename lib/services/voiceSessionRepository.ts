import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

import {
  auditSessionExportSchema,
  createVoiceSessionRequestSchema,
  pegaCallbackAttemptSchema,
  voiceSessionCompletionSchema,
  voiceSessionContextSchema,
  voiceSessionRecordSchema,
  type AuditSessionExport,
  type CreateVoiceSessionRequest,
  type DuplicateFinding,
  type PegaCallbackAttempt,
  type TranscriptEntry,
  type VoiceSessionCompletion,
  type VoiceSessionContext,
  type VoiceSessionRecord
} from '@/lib/schemas/voiceSession'

interface VoiceSessionRow {
  id: string
  session_status: string
  session_state: string
  session_token_hash: string
  expires_at: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  request_json: string
  transcript_json: string
}

export interface VoiceSessionRepository {
  createSession: (input: {
    sessionId: string
    sessionTokenHash: string
    request: CreateVoiceSessionRequest
    createdAt: string
  }) => VoiceSessionRecord
  getSession: (sessionId: string) => VoiceSessionRecord | null
  getSessionContext: (sessionId: string) => VoiceSessionContext | null
  saveSession: (session: VoiceSessionRecord) => VoiceSessionRecord
  updateTranscript: (sessionId: string, transcript: TranscriptEntry[]) => void
  markStarted: (input: { sessionId: string; startedAt: string; sessionState?: VoiceSessionRecord['sessionState'] }) => void
  saveCompletion: (completion: VoiceSessionCompletion) => VoiceSessionCompletion
  getCompletion: (sessionId: string) => VoiceSessionCompletion | null
  recordCallbackAttempt: (attempt: PegaCallbackAttempt) => PegaCallbackAttempt
  getCallbackStatus: (sessionId: string) => PegaCallbackAttempt | null
}

function sanitizeSessionId(sessionId: string): string {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(sessionId)) {
    throw new Error('Invalid sessionId format.')
  }

  return sessionId
}

function ensureDirectory(directoryPath: string): void {
  mkdirSync(directoryPath, { recursive: true })
}

function assertWritableDirectory(directoryPath: string): void {
  ensureDirectory(directoryPath)
  const probePath = path.join(directoryPath, '.pamai-write-test')

  try {
    writeFileSync(probePath, 'ok', 'utf8')
    unlinkSync(probePath)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown write failure.'
    throw new Error(`Storage directory is not writable: ${directoryPath}. ${reason}`)
  }
}

function parseRequest(row: VoiceSessionRow): CreateVoiceSessionRequest {
  return createVoiceSessionRequestSchema.parse(JSON.parse(row.request_json))
}

function parseTranscript(row: VoiceSessionRow): TranscriptEntry[] {
  return JSON.parse(row.transcript_json) as TranscriptEntry[]
}

function getSessionRecordFromRow(db: Database.Database, row: VoiceSessionRow | undefined): VoiceSessionRecord | null {
  if (!row) {
    return null
  }

  const request = parseRequest(row)
  const duplicateFindings = db
    .prepare('SELECT finding_json FROM duplicate_findings WHERE session_id = ? ORDER BY duplicate_group_id')
    .all(row.id)
    .map((findingRow) => JSON.parse((findingRow as { finding_json: string }).finding_json) as DuplicateFinding)

  return voiceSessionRecordSchema.parse({
    sessionId: row.id,
    sessionStatus: row.session_status,
    sessionState: row.session_state,
    sessionTokenHash: row.session_token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    request,
    duplicateFindings,
    transcript: parseTranscript(row)
  })
}

function maskEmail(email: string): string {
  const [localPart, domainPart] = email.split('@')

  if (!localPart || !domainPart) {
    return '***'
  }

  return `${localPart[0]}***@${domainPart}`
}

function getMobileLastFour(mobile: string): string {
  const digits = mobile.replace(/\D+/g, '')
  return digits.slice(-4).padStart(4, '0')
}

function writeAuditExport(input: {
  auditDirectory: string
  statusFolder: 'ready' | 'completed' | 'callback-failed'
  exportData: AuditSessionExport
}): void {
  const targetDirectory = path.join(input.auditDirectory, input.statusFolder)
  ensureDirectory(targetDirectory)
  const validatedExport = auditSessionExportSchema.parse(input.exportData)

  writeFileSync(
    path.join(targetDirectory, `${validatedExport.sessionId}.json`),
    JSON.stringify(validatedExport, null, 2),
    'utf8'
  )
}

function createDatabase(databasePath: string): Database.Database {
  assertWritableDirectory(path.dirname(databasePath))
  const db = new Database(databasePath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id TEXT PRIMARY KEY,
      session_status TEXT NOT NULL,
      session_state TEXT NOT NULL,
      session_token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      request_json TEXT NOT NULL,
      transcript_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS duplicate_findings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      duplicate_group_id TEXT NOT NULL,
      reason TEXT,
      confidence REAL,
      finding_json TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES voice_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS conversation_results (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      user_decision TEXT NOT NULL,
      requires_reupload INTEGER NOT NULL,
      requires_manual_review INTEGER NOT NULL,
      user_explanation TEXT,
      agent_summary TEXT NOT NULL,
      confidence REAL NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES voice_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS pega_callback_attempts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      callback_status TEXT NOT NULL,
      http_status_code INTEGER,
      response_body TEXT,
      attempted_at TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES voice_sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_duplicate_findings_session ON duplicate_findings(session_id);
    CREATE INDEX IF NOT EXISTS idx_callback_attempts_session ON pega_callback_attempts(session_id, attempted_at DESC);
  `)

  return db
}

export function createVoiceSessionRepository(input: {
  databasePath: string
  auditDirectory: string
}): VoiceSessionRepository {
  const db = createDatabase(input.databasePath)
  assertWritableDirectory(input.auditDirectory)
  assertWritableDirectory(path.join(input.auditDirectory, 'ready'))
  assertWritableDirectory(path.join(input.auditDirectory, 'completed'))
  assertWritableDirectory(path.join(input.auditDirectory, 'callback-failed'))

  const insertSession = db.prepare(`
    INSERT INTO voice_sessions (
      id,
      session_status,
      session_state,
      session_token_hash,
      expires_at,
      created_at,
      started_at,
      completed_at,
      request_json,
      transcript_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertFinding = db.prepare(`
    INSERT INTO duplicate_findings (id, session_id, duplicate_group_id, reason, confidence, finding_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const insertOrReplaceCompletion = db.prepare(`
    INSERT INTO conversation_results (
      id,
      session_id,
      user_decision,
      requires_reupload,
      requires_manual_review,
      user_explanation,
      agent_summary,
      confidence,
      result_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      id = excluded.id,
      user_decision = excluded.user_decision,
      requires_reupload = excluded.requires_reupload,
      requires_manual_review = excluded.requires_manual_review,
      user_explanation = excluded.user_explanation,
      agent_summary = excluded.agent_summary,
      confidence = excluded.confidence,
      result_json = excluded.result_json,
      created_at = excluded.created_at
  `)
  const insertCallbackAttempt = db.prepare(`
    INSERT INTO pega_callback_attempts (
      id,
      session_id,
      callback_status,
      http_status_code,
      response_body,
      attempted_at,
      retry_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const updateSessionStatus = db.prepare(`
    UPDATE voice_sessions
    SET session_status = ?, session_state = ?, started_at = COALESCE(?, started_at), completed_at = COALESCE(?, completed_at)
    WHERE id = ?
  `)
  const saveSessionRow = db.prepare(`
    UPDATE voice_sessions
    SET session_status = ?,
        session_state = ?,
        session_token_hash = ?,
        expires_at = ?,
        created_at = ?,
        started_at = ?,
        completed_at = ?,
        request_json = ?,
        transcript_json = ?
    WHERE id = ?
  `)
  const updateTranscript = db.prepare('UPDATE voice_sessions SET transcript_json = ? WHERE id = ?')
  const selectSession = db.prepare('SELECT * FROM voice_sessions WHERE id = ?')
  const selectCompletion = db.prepare('SELECT result_json FROM conversation_results WHERE session_id = ?')
  const selectLatestCallback = db.prepare(`
    SELECT *
    FROM pega_callback_attempts
    WHERE session_id = ?
    ORDER BY attempted_at DESC, retry_count DESC
    LIMIT 1
  `)

  const createSessionTransaction = db.transaction((sessionId: string, sessionTokenHash: string, request: CreateVoiceSessionRequest, createdAt: string) => {
    insertSession.run(
      sessionId,
      'READY',
      'SESSION_LOADED',
      sessionTokenHash,
      request.expiresAt,
      createdAt,
      null,
      null,
      JSON.stringify(request),
      JSON.stringify([])
    )

    for (const finding of request.duplicateFindings) {
      insertFinding.run(
        `${sessionId}-${finding.duplicateGroupId}`,
        sessionId,
        finding.duplicateGroupId,
        finding.reason,
        finding.confidence,
        JSON.stringify(finding)
      )
    }
  })

  return {
    createSession(repositoryInput) {
      const request = createVoiceSessionRequestSchema.parse(repositoryInput.request)
      const sessionId = sanitizeSessionId(repositoryInput.sessionId)
      createSessionTransaction(sessionId, repositoryInput.sessionTokenHash, request, repositoryInput.createdAt)

      writeAuditExport({
        auditDirectory: input.auditDirectory,
        statusFolder: 'ready',
        exportData: {
          sessionId,
          caseId: request.caseId,
          status: 'READY',
          userDecision: null,
          requiresReupload: null,
          userExplanation: null,
          recommendedNextAction: null,
          sentToPega: false,
          sentToPegaAt: null
        }
      })

      const row = selectSession.get(sessionId) as VoiceSessionRow | undefined
      const record = getSessionRecordFromRow(db, row)

      if (!record) {
        throw new Error('Failed to create voice session.')
      }

      return record
    },
    getSession(sessionId) {
      const row = selectSession.get(sanitizeSessionId(sessionId)) as VoiceSessionRow | undefined
      return getSessionRecordFromRow(db, row)
    },
    getSessionContext(sessionId) {
      const record = this.getSession(sessionId)

      if (!record) {
        return null
      }

      return voiceSessionContextSchema.parse({
        sessionId: record.sessionId,
        sessionStatus: record.sessionStatus,
        sessionState: record.sessionState,
        caseId: record.request.caseId,
        caseReference: record.request.caseReference,
        assignmentId: record.request.assignmentId,
        currentStage: record.request.currentStage,
        currentStep: record.request.currentStep,
        conversationPurpose: record.request.conversationPurpose,
        expiresAt: record.expiresAt,
        customer: {
          customerId: record.request.customer.customerId,
          fullName: record.request.customer.fullName,
          emailMasked: maskEmail(record.request.customer.email),
          mobileLastFour: getMobileLastFour(record.request.customer.mobile)
        },
        duplicateFindings: record.duplicateFindings,
        transcript: record.transcript,
        metadata: record.request.metadata
      })
    },
    saveSession(session) {
      const validatedSession = voiceSessionRecordSchema.parse(session)

      saveSessionRow.run(
        validatedSession.sessionStatus,
        validatedSession.sessionState,
        validatedSession.sessionTokenHash,
        validatedSession.expiresAt,
        validatedSession.createdAt,
        validatedSession.startedAt,
        validatedSession.completedAt,
        JSON.stringify(validatedSession.request),
        JSON.stringify(validatedSession.transcript),
        sanitizeSessionId(validatedSession.sessionId)
      )

      const storedSession = this.getSession(validatedSession.sessionId)

      if (!storedSession) {
        throw new Error('Failed to save the updated voice session.')
      }

      return storedSession
    },
    updateTranscript(sessionId, transcript) {
      updateTranscript.run(JSON.stringify(transcript), sanitizeSessionId(sessionId))
    },
    markStarted(markInput) {
      const sessionId = sanitizeSessionId(markInput.sessionId)
      updateSessionStatus.run('STARTED', markInput.sessionState ?? 'IDENTITY_CHECK', markInput.startedAt, null, sessionId)
    },
    saveCompletion(completion) {
      const validatedCompletion = voiceSessionCompletionSchema.parse(completion)
      const sessionId = sanitizeSessionId(validatedCompletion.sessionId)

      insertOrReplaceCompletion.run(
        `${sessionId}-completion`,
        sessionId,
        validatedCompletion.duplicateGroupsReviewed[0]?.userResponse ?? 'UNCLEAR_RESPONSE',
        validatedCompletion.userDecision.requiresReupload ? 1 : 0,
        validatedCompletion.userDecision.requiresManualReview ? 1 : 0,
        validatedCompletion.userDecision.userExplanation,
        validatedCompletion.agentSummary.summary,
        validatedCompletion.agentSummary.confidence,
        JSON.stringify(validatedCompletion),
        validatedCompletion.completedAt
      )

      updateSessionStatus.run('COMPLETED', 'COMPLETED', null, validatedCompletion.completedAt, sessionId)
      updateTranscript.run(JSON.stringify(validatedCompletion.transcript), sessionId)

      writeAuditExport({
        auditDirectory: input.auditDirectory,
        statusFolder: 'completed',
        exportData: {
          sessionId,
          caseId: validatedCompletion.caseId,
          status: 'COMPLETED',
          userDecision: validatedCompletion.duplicateGroupsReviewed[0]?.userResponse ?? null,
          requiresReupload: validatedCompletion.userDecision.requiresReupload,
          userExplanation: validatedCompletion.userDecision.userExplanation,
          recommendedNextAction: validatedCompletion.agentSummary.recommendedNextAction,
          sentToPega: false,
          sentToPegaAt: null
        }
      })

      return validatedCompletion
    },
    getCompletion(sessionId) {
      const row = selectCompletion.get(sanitizeSessionId(sessionId)) as { result_json: string } | undefined

      if (!row) {
        return null
      }

      return voiceSessionCompletionSchema.parse(JSON.parse(row.result_json))
    },
    recordCallbackAttempt(attempt) {
      const validatedAttempt = pegaCallbackAttemptSchema.parse(attempt)
      const sessionId = sanitizeSessionId(validatedAttempt.sessionId)
      insertCallbackAttempt.run(
        validatedAttempt.id,
        sessionId,
        validatedAttempt.callbackStatus,
        validatedAttempt.httpStatusCode,
        validatedAttempt.responseBody,
        validatedAttempt.attemptedAt,
        validatedAttempt.retryCount
      )

      const completion = this.getCompletion(sessionId)

      if (completion) {
        const wasDelivered = validatedAttempt.callbackStatus === 'DELIVERED'
        const nextStatus = wasDelivered ? 'COMPLETED' : 'CALLBACK_FAILED'

        updateSessionStatus.run(nextStatus, 'COMPLETED', null, completion.completedAt, sessionId)
        writeAuditExport({
          auditDirectory: input.auditDirectory,
          statusFolder: wasDelivered ? 'completed' : 'callback-failed',
          exportData: {
            sessionId,
            caseId: completion.caseId,
            status: nextStatus,
            userDecision: completion.duplicateGroupsReviewed[0]?.userResponse ?? null,
            requiresReupload: completion.userDecision.requiresReupload,
            userExplanation: completion.userDecision.userExplanation,
            recommendedNextAction: completion.agentSummary.recommendedNextAction,
            sentToPega: wasDelivered,
            sentToPegaAt: wasDelivered ? validatedAttempt.attemptedAt : null
          }
        })
      }

      return validatedAttempt
    },
    getCallbackStatus(sessionId) {
      const row = selectLatestCallback.get(sanitizeSessionId(sessionId)) as
        | {
            id: string
            session_id: string
            callback_status: string
            http_status_code: number | null
            response_body: string | null
            attempted_at: string
            retry_count: number
          }
        | undefined

      if (!row) {
        return null
      }

      return pegaCallbackAttemptSchema.parse({
        id: row.id,
        sessionId: row.session_id,
        callbackStatus: row.callback_status,
        httpStatusCode: row.http_status_code,
        responseBody: row.response_body,
        attemptedAt: row.attempted_at,
        retryCount: row.retry_count
      })
    }
  }
}