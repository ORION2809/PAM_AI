import { access, mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type {
  CreateVoiceSessionRequest,
  PegaCallbackAttempt,
  VoiceSessionCompletion
} from '@/lib/schemas/voiceSession'
import { createVoiceSessionRepository } from '@/lib/services/voiceSessionRepository'

function createRequest(): CreateVoiceSessionRequest {
  return {
    sourceSystem: 'Pega',
    caseId: 'EXP-10293',
    caseReference: 'C-382910',
    assignmentId: 'ASSIGN-77281',
    caseType: 'ExpenseReview',
    currentStage: 'Duplicate Document Identification',
    currentStep: 'Wait for Customer Clarification',
    conversationPurpose: 'DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION',
    customer: {
      customerId: 'EMP-10045',
      fullName: 'Rahul Sharma',
      email: 'rahul.sharma@company.com',
      mobile: '+919876543210'
    },
    duplicateFindings: [
      {
        duplicateGroupId: 'DUP-GRP-001',
        reason: 'Same expense date and same amount detected across multiple uploaded documents.',
        confidence: 0.91,
        expenseRecords: [
          {
            expenseRecordId: 'EXP-LINE-001',
            documentId: 'DOC-001',
            fileName: 'cab_receipt_1.pdf',
            expenseDate: '2026-05-01',
            amount: 2450,
            currency: 'INR',
            merchant: 'Uber',
            documentType: 'Receipt'
          },
          {
            expenseRecordId: 'EXP-LINE-002',
            documentId: 'DOC-002',
            fileName: 'cab_receipt_2.pdf',
            expenseDate: '2026-05-01',
            amount: 2450,
            currency: 'INR',
            merchant: 'Uber',
            documentType: 'Receipt'
          }
        ]
      }
    ],
    callback: {
      url: 'https://pega.company.com/prweb/api/pamai/v1/duplicate-response',
      authType: 'OAUTH2_CLIENT_CREDENTIALS'
    },
    expiresAt: '2026-05-08T18:30:00.000Z',
    metadata: {
      createdByOperator: 'System',
      tenant: 'ExpensePOC',
      locale: 'en-IN'
    }
  }
}

function createCompletion(): VoiceSessionCompletion {
  return {
    sessionId: 'PAMAI-SESSION-9f8a12',
    caseId: 'EXP-10293',
    caseReference: 'C-382910',
    assignmentId: 'ASSIGN-77281',
    conversationPurpose: 'DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION',
    status: 'COMPLETED',
    completedAt: '2026-05-06T11:42:30.000Z',
    userDecision: {
      duplicateConfirmed: 'NO',
      decisionType: 'SEPARATE_VALID_EXPENSES',
      requiresReupload: false,
      requiresManualReview: false,
      userExplanation: 'The two rides were separate expenses with the same fare.',
      finalUserConfirmation: true
    },
    duplicateGroupsReviewed: [
      {
        duplicateGroupId: 'DUP-GRP-001',
        expenseRecordIds: ['EXP-LINE-001', 'EXP-LINE-002'],
        documentIds: ['DOC-001', 'DOC-002'],
        userResponse: 'NOT_DUPLICATE',
        explanation: 'Separate rides with the same amount.'
      }
    ],
    agentSummary: {
      summary: 'User confirmed the expenses are separate valid rides.',
      confidence: 0.88,
      recommendedNextAction: 'PROCEED_TO_MANAGER_APPROVAL'
    },
    transcript: [
      {
        speaker: 'agent',
        text: 'We detected two expense documents with the same date, amount, and merchant.',
        timestamp: '2026-05-06T11:40:00.000Z',
        inputMode: 'text'
      },
      {
        speaker: 'user',
        text: 'They were separate rides.',
        timestamp: '2026-05-06T11:41:00.000Z',
        inputMode: 'voice'
      }
    ],
    technicalMetadata: {
      voiceModel: 'gpt-4o-mini-tts',
      reasoningModel: 'gpt-5.4-mini',
      language: 'en-IN',
      durationSeconds: 142,
      idempotencyKey: 'PAMAI-SESSION-9f8a12-COMPLETION'
    }
  }
}

function createCallbackAttempt(): PegaCallbackAttempt {
  return {
    id: 'ATTEMPT-001',
    sessionId: 'PAMAI-SESSION-9f8a12',
    callbackStatus: 'DELIVERED',
    httpStatusCode: 200,
    responseBody: '{"ok":true}',
    attemptedAt: '2026-05-06T11:42:35.000Z',
    retryCount: 0
  }
}

describe('voiceSessionRepository', () => {
  it('stores a ready session with duplicate findings and returns a masked context view', async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'pamai-session-repo-'))
    const databasePath = path.join(tempDirectory, 'voice-sessions.sqlite')
    const auditDirectory = path.join(tempDirectory, 'audit')
    const repository = createVoiceSessionRepository({
      databasePath,
      auditDirectory
    })

    await repository.createSession({
      sessionId: 'PAMAI-SESSION-9f8a12',
      sessionTokenHash: 'hashed-token',
      request: createRequest(),
      createdAt: '2026-05-06T10:00:00.000Z'
    })

    const session = repository.getSession('PAMAI-SESSION-9f8a12')
    const context = repository.getSessionContext('PAMAI-SESSION-9f8a12')

    expect(session?.sessionStatus).toBe('READY')
    expect(context?.customer.fullName).toBe('Rahul Sharma')
    expect(context?.customer.emailMasked).toBe('r***@company.com')
    expect(context?.customer.mobileLastFour).toBe('3210')
    expect(context?.duplicateFindings).toHaveLength(1)
  })

  it('stores completion results, callback attempts, and audit export files', async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'pamai-session-complete-'))
    const databasePath = path.join(tempDirectory, 'voice-sessions.sqlite')
    const auditDirectory = path.join(tempDirectory, 'audit')
    const repository = createVoiceSessionRepository({
      databasePath,
      auditDirectory
    })

    await repository.createSession({
      sessionId: 'PAMAI-SESSION-9f8a12',
      sessionTokenHash: 'hashed-token',
      request: createRequest(),
      createdAt: '2026-05-06T10:00:00.000Z'
    })

    repository.saveCompletion(createCompletion())
    repository.recordCallbackAttempt(createCallbackAttempt())

    const completion = repository.getCompletion('PAMAI-SESSION-9f8a12')
    const callbackStatus = repository.getCallbackStatus('PAMAI-SESSION-9f8a12')
    const completedAuditPath = path.join(auditDirectory, 'completed', 'PAMAI-SESSION-9f8a12.json')

    await expect(access(completedAuditPath)).resolves.toBeUndefined()
    const auditContents = JSON.parse(await readFile(completedAuditPath, 'utf8')) as {
      userDecision: string
      sentToPega: boolean
    }

    expect(completion?.status).toBe('COMPLETED')
    expect(callbackStatus?.callbackStatus).toBe('DELIVERED')
    expect(auditContents.userDecision).toBe('NOT_DUPLICATE')
    expect(auditContents.sentToPega).toBe(true)
  })
})
