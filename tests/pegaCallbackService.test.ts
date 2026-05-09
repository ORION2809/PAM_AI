import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetServerEnvCache } from '@/lib/env'
import type { CreateVoiceSessionRequest, VoiceSessionCompletion } from '@/lib/schemas/voiceSession'
import { buildPegaVoiceAiResumePayload, deliverPegaCallback } from '@/lib/services/pegaCallbackService'

const originalEnv = process.env
const callbackUrl = 'https://bluevoir-251.pegademo.com/prweb/api/VoiceAICaseCreation/V1/ResumeFlowfromVoiceAI'

function createRequest(): CreateVoiceSessionRequest {
  return {
    sourceSystem: 'Pega',
    caseId: 'E-9020',
    caseReference: 'E-9020',
    assignmentId: 'ASSIGN-E-9020',
    caseType: 'Expense Processing',
    currentStage: 'Approval Rejection',
    currentStep: 'Wait for Customer Clarification',
    conversationPurpose: 'DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION',
    customer: {
      customerId: 'user@example.com',
      fullName: 'Test User',
      email: 'user@example.com',
      mobile: '+910000003210'
    },
    duplicateFindings: [
      {
        duplicateGroupId: 'DUP-GRP-E-9020',
        reason: 'Possible duplicate hotel expenses.',
        confidence: 0.9,
        expenseRecords: [
          {
            expenseRecordId: 'document_1',
            documentId: 'ATTACH-1',
            fileName: 'hotel1.pdf',
            expenseDate: '2026-05-01',
            amount: 972.76,
            currency: 'USD',
            merchant: 'Windsor Court Hotel',
            documentType: 'Hotel Stay'
          }
        ]
      }
    ],
    callback: {
      url: callbackUrl,
      authType: 'OAUTH2_CLIENT_CREDENTIALS'
    },
    expiresAt: '2026-05-12T12:00:00.000Z',
    metadata: {
      createdByOperator: 'Pega',
      tenant: 'Bluevoir',
      locale: 'en-IN'
    }
  }
}

function createCompletion(overrides: {
  userDecision?: Partial<VoiceSessionCompletion['userDecision']>
  agentSummary?: Partial<VoiceSessionCompletion['agentSummary']>
  transcript?: VoiceSessionCompletion['transcript']
} = {}): VoiceSessionCompletion {
  return {
    sessionId: 'PAMAI-SESSION-test',
    caseId: 'E-9020',
    caseReference: 'E-9020',
    assignmentId: 'ASSIGN-E-9020',
    conversationPurpose: 'DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION',
    status: 'COMPLETED',
    completedAt: '2026-05-09T10:30:00.000Z',
    userDecision: {
      duplicateConfirmed: 'NO',
      decisionType: 'SEPARATE_VALID_EXPENSES',
      requiresReupload: false,
      requiresManualReview: false,
      userExplanation: 'Ilakathamafaliya.',
      finalUserConfirmation: true,
      ...overrides.userDecision
    },
    duplicateGroupsReviewed: [
      {
        duplicateGroupId: 'DUP-GRP-E-9020',
        expenseRecordIds: ['document_1'],
        documentIds: ['ATTACH-1'],
        userResponse: 'NOT_DUPLICATE',
        explanation: 'Ilakathamafaliya.'
      }
    ],
    agentSummary: {
      summary: 'User clarified the flagged expenses.',
      confidence: 0.88,
      recommendedNextAction: 'PROCEED_TO_MANAGER_APPROVAL',
      ...overrides.agentSummary
    },
    transcript: overrides.transcript ?? [],
    technicalMetadata: {
      voiceModel: 'gpt-4o-mini-tts',
      reasoningModel: 'gpt-5.4-mini',
      language: 'en-IN',
      durationSeconds: 42,
      idempotencyKey: 'PAMAI-SESSION-test-COMPLETION'
    }
  }
}

describe('pegaCallbackService', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PEGA_CLIENT_ID: 'client-id',
      PEGA_CLIENT_SECRET: 'client-secret',
      PEGA_TOKEN_ENDPOINT: 'https://bluevoir-251.pegademo.com/prweb/PRRestService/oauth2/v1/token',
      PAMAI_MOCK_PEGA_CALLBACKS: 'false'
    }
    resetServerEnvCache()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    process.env = originalEnv
    resetServerEnvCache()
  })

  it('maps a completion into the Pega Voice AI resume payload', () => {
    expect(buildPegaVoiceAiResumePayload(createCompletion())).toEqual({
      EmailResponseBody: 'User clarified the flagged expenses.\n\nCustomer explanation: Ilakathamafaliya.',
      pyID: 'E-9020',
      IsUserWantToReupload: false
    })

    expect(
      buildPegaVoiceAiResumePayload(
        createCompletion({
          userDecision: {
            duplicateConfirmed: 'UNCLEAR',
            decisionType: 'REUPLOAD_REQUIRED',
            requiresReupload: true,
            userExplanation: 'I need to reupload the correct document.'
          }
        })
      ).IsUserWantToReupload
    ).toBe(true)

    expect(
      buildPegaVoiceAiResumePayload(
        createCompletion({
          userDecision: {
            duplicateConfirmed: 'YES',
            decisionType: 'DUPLICATE_CONFIRMED',
            requiresReupload: true,
            userExplanation: 'Yes, I uploaded the same receipt twice by mistake.'
          },
          agentSummary: {
            summary: 'User confirmed the flagged documents are duplicates and asked to remove the duplicate receipt before uploading again.',
            recommendedNextAction: 'ROUTE_TO_REUPLOAD_DOCUMENTS'
          }
        })
      )
    ).toEqual({
      EmailResponseBody:
        'User confirmed the flagged documents are duplicates and asked to remove the duplicate receipt before uploading again.\n\nCustomer explanation: Yes, I uploaded the same receipt twice by mistake.',
      pyID: 'E-9020',
      IsUserWantToReupload: true
    })
  })

  it('uses the transcript-backed explanation when the stored explanation is only a final confirmation', () => {
    const payload = buildPegaVoiceAiResumePayload(
      createCompletion({
        userDecision: {
          userExplanation: 'yes, please'
        },
        agentSummary: {
          summary: 'User confirmed the flagged documents are separate valid expenses after explaining the rides were different.',
          recommendedNextAction: 'PROCEED_TO_MANAGER_APPROVAL'
        },
        transcript: [
          {
            speaker: 'agent',
            text: 'Are these duplicates, or separate valid expenses?',
            timestamp: '2026-05-09T10:30:00.000Z',
            inputMode: 'text'
          },
          {
            speaker: 'user',
            text: 'No, these are not duplicate receipts because one was from home to office and the other was from office to a client meeting.',
            timestamp: '2026-05-09T10:30:20.000Z',
            inputMode: 'text'
          },
          {
            speaker: 'user',
            text: 'yes, please',
            timestamp: '2026-05-09T10:30:40.000Z',
            inputMode: 'text'
          }
        ]
      })
    )

    expect(payload.EmailResponseBody).toBe(
      'User confirmed the flagged documents are separate valid expenses after explaining the rides were different.\n\nCustomer explanation: No, these are not duplicate receipts because one was from home to office and the other was from office to a client meeting.'
    )
    expect(payload.EmailResponseBody).not.toContain('Customer explanation: yes, please')
    expect(payload.IsUserWantToReupload).toBe(false)
  })

  it('falls back to a decision summary when no meaningful explanation is available', () => {
    const payload = buildPegaVoiceAiResumePayload(
      createCompletion({
        userDecision: {
          requiresReupload: true,
          userExplanation: 'yes'
        },
        agentSummary: {
          summary: ''
        },
        transcript: [
          {
            speaker: 'user',
            text: 'yes, please',
            timestamp: '2026-05-09T10:31:00.000Z',
            inputMode: 'text'
          }
        ]
      })
    )

    expect(payload.EmailResponseBody).toBe('User confirmed corrected documents must be reuploaded.')
    expect(payload.IsUserWantToReupload).toBe(true)
  })

  it('posts the Pega resume payload with OAuth client-credentials auth', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'pega-access-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response('<?xml version="1.0"?><pagedata><pxObjClass>ok</pxObjClass></pagedata>', {
          status: 200,
          headers: { 'content-type': 'application/xml;charset=UTF-8' }
        })
      )

    const attempt = await deliverPegaCallback({
      request: createRequest(),
      completion: createCompletion(),
      now: '2026-05-09T10:31:00.000Z'
    })

    const [, tokenInit] = fetchMock.mock.calls[0] ?? []
    const [callbackRequest, callbackInit] = fetchMock.mock.calls[1] ?? []

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(tokenInit?.method).toBe('POST')
    expect(String((tokenInit?.body as URLSearchParams).get('grant_type'))).toBe('client_credentials')
    expect(callbackRequest).toBe(callbackUrl)
    expect(callbackInit?.method).toBe('POST')
    expect(callbackInit?.headers).toMatchObject({
      Authorization: 'Bearer pega-access-token',
      'Content-Type': 'application/json',
      'x-pamai-idempotency-key': 'PAMAI-SESSION-test-COMPLETION'
    })
    expect(JSON.parse(callbackInit?.body as string)).toEqual({
      EmailResponseBody: 'User clarified the flagged expenses.\n\nCustomer explanation: Ilakathamafaliya.',
      pyID: 'E-9020',
      IsUserWantToReupload: false
    })
    expect(attempt.callbackStatus).toBe('DELIVERED')
    expect(attempt.httpStatusCode).toBe(200)
    expect(attempt.responseBody).toContain('pagedata')
  })
})
