import { describe, expect, it } from 'vitest'

import type { PegaCallbackAttempt, VoiceSessionCompletion, VoiceSessionContext } from '@/lib/schemas/voiceSession'
import { getPamaiOrbPresentation } from '@/lib/ui/pamaiOrbPresentation'

function createBaseSession(): VoiceSessionContext {
  return {
    sessionId: 'session-1',
    sessionStatus: 'READY',
    sessionState: 'IDENTITY_CHECK',
    caseId: 'CASE-20260505-0001',
    caseReference: 'EXP-1001',
    assignmentId: 'ASSIGN-1001',
    currentStage: 'Duplicate Review',
    currentStep: 'Identity Check',
    conversationPurpose: 'DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION',
    expiresAt: '2026-05-05T11:30:00.000Z',
    customer: {
      customerId: 'CUST-1001',
      fullName: 'Aisha Khan',
      emailMasked: 'ai***@example.com',
      mobileLastFour: '3210'
    },
    duplicateFindings: [
      {
        duplicateGroupId: 'DG-1',
        reason: 'Two receipts look similar but have different destinations.',
        confidence: 0.93,
        expenseRecords: [
          {
            expenseRecordId: 'ER-1',
            documentId: 'DOC-1',
            fileName: 'ride-a.pdf',
            expenseDate: '2026-05-01',
            amount: 42.5,
            currency: 'USD',
            merchant: 'Metro Cab',
            documentType: 'receipt'
          }
        ]
      }
    ],
    transcript: [],
    metadata: {
      createdByOperator: 'demo-operator',
      tenant: 'demo',
      locale: 'en-US'
    }
  }
}

function createCompletion(): VoiceSessionCompletion {
  return {
    sessionId: 'session-1',
    caseId: 'CASE-20260505-0001',
    caseReference: 'EXP-1001',
    assignmentId: 'ASSIGN-1001',
    conversationPurpose: 'DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION',
    status: 'COMPLETED',
    completedAt: '2026-05-05T10:45:00.000Z',
    userDecision: {
      duplicateConfirmed: 'NO',
      decisionType: 'SEPARATE_VALID_EXPENSES',
      requiresReupload: false,
      requiresManualReview: false,
      userExplanation: 'They were separate client visits on the same day.',
      finalUserConfirmation: true
    },
    duplicateGroupsReviewed: [
      {
        duplicateGroupId: 'DG-1',
        expenseRecordIds: ['ER-1'],
        documentIds: ['DOC-1'],
        userResponse: 'NOT_DUPLICATE',
        explanation: 'They were separate client visits on the same day.'
      }
    ],
    agentSummary: {
      summary: 'User clarified that the expenses are valid and separate.',
      confidence: 0.95,
      recommendedNextAction: 'PROCEED_TO_MANAGER_APPROVAL'
    },
    transcript: [],
    technicalMetadata: {
      voiceModel: 'eleven_multilingual_v2',
      reasoningModel: 'deterministic-flow',
      language: 'en-US',
      durationSeconds: 58,
      idempotencyKey: 'idem-123'
    }
  }
}

function createCallbackStatus(status: PegaCallbackAttempt['callbackStatus']): PegaCallbackAttempt {
  return {
    id: 'callback-1',
    sessionId: 'session-1',
    callbackStatus: status,
    httpStatusCode: status === 'DELIVERED' ? 202 : 500,
    responseBody: status === 'DELIVERED' ? 'accepted' : 'failed',
    attemptedAt: '2026-05-05T10:45:05.000Z',
    retryCount: 0
  }
}

describe('getPamaiOrbPresentation', () => {
  it('shows secure-session bootstrapping text while the token is being validated', () => {
    const presentation = getPamaiOrbPresentation({
      session: null,
      completion: null,
      callbackStatus: null,
      runtimeState: 'booting',
      audioLevel: 0,
      isRecording: false,
      statusText: '',
      errorText: ''
    })

    expect(presentation.state).toBe('booting')
    expect(presentation.title).toContain('secure PAMAI link')
    expect(presentation.hint).toContain('secure session')
  })

  it('keeps the final confirmation prompt visible when the flow waits for submission approval', () => {
    const presentation = getPamaiOrbPresentation({
      session: {
        ...createBaseSession(),
        sessionState: 'CONFIRM_FINAL_ANSWER'
      },
      completion: null,
      callbackStatus: null,
      runtimeState: 'idle',
      audioLevel: 0.1,
      isRecording: false,
      statusText: 'Please say yes to submit this clarification to Pega.',
      errorText: ''
    })

    expect(presentation.state).toBe('confirmation')
    expect(presentation.description).toBe('Please say yes to submit this clarification to Pega.')
  })

  it('shows live-listening guidance while the user is recording a response', () => {
    const presentation = getPamaiOrbPresentation({
      session: createBaseSession(),
      completion: null,
      callbackStatus: null,
      runtimeState: 'listening',
      audioLevel: 0.1,
      isRecording: true,
      statusText: 'Tell me whether these receipts are duplicates or separate expenses.',
      errorText: ''
    })

    expect(presentation.state).toBe('listening')
    expect(presentation.description).toBe('Tell me whether these receipts are duplicates or separate expenses.')
    expect(presentation.hint).toContain('submit automatically')
  })

  it('shows the submitted state with callback delivery details after completion', () => {
    const presentation = getPamaiOrbPresentation({
      session: {
        ...createBaseSession(),
        sessionStatus: 'COMPLETED',
        sessionState: 'COMPLETED'
      },
      completion: createCompletion(),
      callbackStatus: createCallbackStatus('DELIVERED'),
      runtimeState: 'idle',
      audioLevel: 0,
      isRecording: false,
      statusText: 'Clarification submitted to Pega.',
      errorText: ''
    })

    expect(presentation.state).toBe('resolved')
    expect(presentation.status).toBe('SUBMITTED')
    expect(presentation.detailLines).toContain('CALLBACK DELIVERED')
  })
})
