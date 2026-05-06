import { describe, expect, it } from 'vitest'

import { createVoiceSessionSeed } from '@/lib/schemas/voiceSession'
import { processVoiceSessionTurn, startVoiceSession } from '@/lib/services/voiceSessionFlow'

function createRequest() {
  return {
    sourceSystem: 'Pega' as const,
    caseId: 'EXP-10293',
    caseReference: 'C-382910',
    assignmentId: 'ASSIGN-77281',
    caseType: 'ExpenseReview',
    currentStage: 'Duplicate Document Identification',
    currentStep: 'Wait for Customer Clarification',
    conversationPurpose: 'DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION' as const,
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
      authType: 'OAUTH2_CLIENT_CREDENTIALS' as const
    },
    expiresAt: '2026-05-08T18:30:00.000Z',
    metadata: {
      createdByOperator: 'System',
      tenant: 'ExpensePOC',
      locale: 'en-IN'
    }
  }
}

function createSession() {
  return createVoiceSessionSeed({
    sessionId: 'PAMAI-SESSION-9f8a12',
    sessionTokenHash: 'hashed-token',
    request: createRequest(),
    createdAt: '2026-05-06T10:00:00.000Z'
  })
}

describe('voiceSessionFlow', () => {
  it('starts with an identity-check greeting', () => {
    const result = startVoiceSession({
      session: createSession(),
      now: '2026-05-06T10:01:00.000Z'
    })

    expect(result.session.sessionStatus).toBe('STARTED')
    expect(result.session.sessionState).toBe('IDENTITY_CHECK')
    expect(result.assistantText).toContain('last four digits')
    expect(result.session.transcript).toHaveLength(1)
  })

  it('explains the duplicate finding after the user passes identity verification', () => {
    const startedSession = startVoiceSession({
      session: createSession(),
      now: '2026-05-06T10:01:00.000Z'
    }).session

    const result = processVoiceSessionTurn({
      session: startedSession,
      userText: '3210',
      inputMode: 'voice',
      now: '2026-05-06T10:02:00.000Z'
    })

    expect(result.session.sessionState).toBe('USER_CLARIFICATION')
    expect(result.assistantText).toContain('possible duplicate expense documents')
    expect(result.assistantText).toContain('Uber')
  })

  it('collects a not-duplicate explanation and finishes after final confirmation', () => {
    const startedSession = startVoiceSession({
      session: createSession(),
      now: '2026-05-06T10:01:00.000Z'
    }).session
    const verifiedSession = processVoiceSessionTurn({
      session: startedSession,
      userText: '3210',
      inputMode: 'voice',
      now: '2026-05-06T10:02:00.000Z'
    }).session
    const clarificationResult = processVoiceSessionTurn({
      session: verifiedSession,
      userText: 'They are separate rides. One was from home to office and the other was from office to a client meeting.',
      inputMode: 'voice',
      now: '2026-05-06T10:03:00.000Z'
    })

    expect(clarificationResult.session.sessionState).toBe('CONFIRM_FINAL_ANSWER')
    expect(clarificationResult.assistantText).toContain('separate valid expenses')

    const completionResult = processVoiceSessionTurn({
      session: clarificationResult.session,
      userText: 'yes',
      inputMode: 'voice',
      now: '2026-05-06T10:04:00.000Z',
      voiceModel: 'eleven_multilingual_v2',
      reasoningModel: 'gpt-5.4-mini'
    })

    expect(completionResult.session.sessionState).toBe('COMPLETED')
    expect(completionResult.completion?.userDecision.decisionType).toBe('SEPARATE_VALID_EXPENSES')
    expect(completionResult.completion?.duplicateGroupsReviewed[0]?.userResponse).toBe('NOT_DUPLICATE')
    expect(completionResult.completion?.agentSummary.recommendedNextAction).toBe('PROCEED_TO_MANAGER_APPROVAL')
  })

  it('asks a follow-up question when the user response is unclear', () => {
    const startedSession = startVoiceSession({
      session: createSession(),
      now: '2026-05-06T10:01:00.000Z'
    }).session
    const verifiedSession = processVoiceSessionTurn({
      session: startedSession,
      userText: '3210',
      inputMode: 'voice',
      now: '2026-05-06T10:02:00.000Z'
    }).session

    const result = processVoiceSessionTurn({
      session: verifiedSession,
      userText: 'I am not sure.',
      inputMode: 'voice',
      now: '2026-05-06T10:03:00.000Z'
    })

    expect(result.session.sessionState).toBe('FOLLOW_UP_QUESTION')
    expect(result.assistantText).toContain('actual duplicate')
  })
})