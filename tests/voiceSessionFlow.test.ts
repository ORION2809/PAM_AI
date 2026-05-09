import { describe, expect, it } from 'vitest'

import { createVoiceSessionSeed, type CreateVoiceSessionRequest } from '@/lib/schemas/voiceSession'
import { processVoiceSessionTurn, startVoiceSession } from '@/lib/services/voiceSessionFlow'

function createRequest(overrides: Partial<CreateVoiceSessionRequest> = {}): CreateVoiceSessionRequest {
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
    },
    ...overrides
  }
}

function createSession(requestOverrides: Partial<CreateVoiceSessionRequest> = {}) {
  return createVoiceSessionSeed({
    sessionId: 'PAMAI-SESSION-9f8a12',
    sessionTokenHash: 'hashed-token',
    request: createRequest(requestOverrides),
    createdAt: '2026-05-06T10:00:00.000Z'
  })
}

describe('voiceSessionFlow', () => {
  it('starts directly with a signed-link clarification prompt', () => {
    const result = startVoiceSession({
      session: createSession(),
      now: '2026-05-06T10:01:00.000Z'
    })

    expect(result.session.sessionStatus).toBe('STARTED')
    expect(result.session.sessionState).toBe('USER_CLARIFICATION')
    expect(result.assistantText).toContain('Rahul Sharma')
    expect(result.assistantText).toContain('Pam A.I.')
    expect(result.assistantText).toContain('verified through this secure link')
    expect(result.assistantText).toContain('Pega case C-382910')
    expect(result.assistantText).toContain('two receipt entries flagged as possible duplicates')
    expect(result.assistantText).toContain('separate valid expenses')
    expect(result.assistantText).not.toContain('last four digits')
    expect(result.session.transcript).toHaveLength(1)
  })

  it('uses live Pega case context in the opening greeting when provided', () => {
    const result = startVoiceSession({
      session: createSession({
        caseReference: 'E-7036',
        customer: {
          customerId: 'manohar.lakkam@bluevoir.com',
          fullName: 'Manohar Lakkam',
          email: 'manohar.lakkam@bluevoir.com',
          mobile: '+910000003210'
        },
        caseContextText:
          'Pega flagged duplicate entries in the hotel stay documents and needs confirmation whether this was submitted by mistake.'
      }),
      now: '2026-05-06T10:01:00.000Z'
    })

    expect(result.assistantText).toContain('Manohar Lakkam')
    expect(result.assistantText).toContain('Pega case E-7036')
    expect(result.assistantText).toContain('two receipt entries flagged as possible duplicates')
    expect(result.assistantText).not.toContain('last four digits')
  })

  it('keeps the opening prompt concise even when verbose Pega context exists', () => {
    const result = startVoiceSession({
      session: createSession({
        caseContextText:
          'Pega flagged two hotel expenses from 14/10/2023 for the same amount of $972.76 and needs confirmation whether this was submitted by mistake.'
      }),
      now: '2026-05-06T10:01:00.000Z'
    })

    expect(result.session.sessionState).toBe('USER_CLARIFICATION')
    expect(result.assistantText).toContain('Pega case C-382910')
    expect(result.assistantText).toContain('two receipt entries flagged as possible duplicates')
    expect(result.assistantText).not.toContain('Pega flagged two hotel expenses')
  })

  it('collects a not-duplicate explanation and finishes after final confirmation', () => {
    const startedSession = startVoiceSession({
      session: createSession(),
      now: '2026-05-06T10:01:00.000Z'
    }).session
    const clarificationResult = processVoiceSessionTurn({
      session: startedSession,
      userText: 'They are separate rides. One was from home to office and the other was from office to a client meeting.',
      inputMode: 'voice',
      now: '2026-05-06T10:02:00.000Z'
    })

    expect(clarificationResult.session.sessionState).toBe('CONFIRM_FINAL_ANSWER')
    expect(clarificationResult.assistantText).toContain('separate valid expenses')

    const completionResult = processVoiceSessionTurn({
      session: clarificationResult.session,
      userText: 'yes, please',
      inputMode: 'voice',
      now: '2026-05-06T10:03:00.000Z',
      voiceModel: 'gpt-4o-mini-tts',
      reasoningModel: 'gpt-5.4-mini'
    })

    expect(completionResult.session.sessionState).toBe('COMPLETED')
    expect(completionResult.completion?.userDecision.decisionType).toBe('SEPARATE_VALID_EXPENSES')
    expect(completionResult.completion?.userDecision.userExplanation).toBe(
      'They are separate rides. One was from home to office and the other was from office to a client meeting.'
    )
    expect(completionResult.completion?.duplicateGroupsReviewed[0]?.userResponse).toBe('NOT_DUPLICATE')
    expect(completionResult.completion?.agentSummary.recommendedNextAction).toBe('PROCEED_TO_MANAGER_APPROVAL')
  })

  it('asks a follow-up question when the user response is unclear', () => {
    const startedSession = startVoiceSession({
      session: createSession(),
      now: '2026-05-06T10:01:00.000Z'
    }).session

    const result = processVoiceSessionTurn({
      session: startedSession,
      userText: 'I am not sure.',
      inputMode: 'voice',
      now: '2026-05-06T10:02:00.000Z'
    })

    expect(result.session.sessionState).toBe('FOLLOW_UP_QUESTION')
    expect(result.assistantText).toContain('actual duplicate')
  })

  it('tells the user to reupload corrected documents when duplicates are confirmed', () => {
    const startedSession = startVoiceSession({
      session: createSession(),
      now: '2026-05-06T10:01:00.000Z'
    }).session

    const clarificationResult = processVoiceSessionTurn({
      session: startedSession,
      userText: 'Yes, I uploaded the same receipt twice by mistake and will remove the duplicate before uploading again.',
      inputMode: 'voice',
      now: '2026-05-06T10:02:00.000Z'
    })

    expect(clarificationResult.session.sessionState).toBe('CONFIRM_FINAL_ANSWER')
    expect(clarificationResult.assistantText).toContain('duplicate documents')
    expect(clarificationResult.assistantText).toContain('reupload the corrected documents')

    const completionResult = processVoiceSessionTurn({
      session: clarificationResult.session,
      userText: 'yes please',
      inputMode: 'voice',
      now: '2026-05-06T10:03:00.000Z',
      voiceModel: 'gpt-4o-mini-tts',
      reasoningModel: 'gpt-5.4-mini'
    })

    expect(completionResult.session.sessionState).toBe('COMPLETED')
    expect(completionResult.completion?.userDecision.decisionType).toBe('DUPLICATE_CONFIRMED')
    expect(completionResult.completion?.userDecision.requiresReupload).toBe(true)
    expect(completionResult.completion?.userDecision.userExplanation).toBe(
      'Yes, I uploaded the same receipt twice by mistake and will remove the duplicate before uploading again.'
    )
    expect(completionResult.completion?.agentSummary.recommendedNextAction).toBe('ROUTE_TO_REUPLOAD_DOCUMENTS')
  })
})
