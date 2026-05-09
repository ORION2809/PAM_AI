import {
  createVoiceSessionSeed,
  type TranscriptEntry,
  type VoiceSessionCompletion,
  type VoiceSessionRecord
} from '@/lib/schemas/voiceSession'
import { parseResolutionAnswer } from '@/lib/utils/text'

type SupportedUserResponse =
  | 'DUPLICATE_CONFIRMED'
  | 'NOT_DUPLICATE'
  | 'PARTIAL_DUPLICATE'
  | 'REUPLOAD_REQUIRED'
  | 'UNCLEAR_RESPONSE'

interface ClassificationResult {
  userResponse: SupportedUserResponse
  duplicateConfirmed: 'YES' | 'NO' | 'PARTIAL' | 'UNCLEAR'
  decisionType:
    | 'DUPLICATE_CONFIRMED'
    | 'SEPARATE_VALID_EXPENSES'
    | 'PARTIAL_DUPLICATE'
    | 'REUPLOAD_REQUIRED'
    | 'UNCLEAR_RESPONSE'
  requiresReupload: boolean
  requiresManualReview: boolean
}

export interface VoiceSessionTurnResult {
  session: VoiceSessionRecord
  assistantText: string
  completion?: VoiceSessionCompletion
}

function sanitizeUserInput(text: string): string {
  return text
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, 5_000)
}

function appendTranscript(session: VoiceSessionRecord, entry: TranscriptEntry): VoiceSessionRecord {
  return {
    ...session,
    transcript: [...session.transcript, entry]
  }
}

function withAssistantReply(input: {
  session: VoiceSessionRecord
  assistantText: string
  now: string
  nextState: VoiceSessionRecord['sessionState']
  nextStatus?: VoiceSessionRecord['sessionStatus']
  completedAt?: string | null
}): VoiceSessionTurnResult {
  const sessionWithReply = appendTranscript(
    {
      ...input.session,
      sessionState: input.nextState,
      sessionStatus: input.nextStatus ?? input.session.sessionStatus,
      completedAt: input.completedAt ?? input.session.completedAt
    },
    {
      speaker: 'agent',
      text: input.assistantText,
      timestamp: input.now,
      inputMode: 'text'
    }
  )

  return {
    session: sessionWithReply,
    assistantText: input.assistantText
  }
}

function buildFindingSummary(finding: VoiceSessionRecord['duplicateFindings'][number]): string {
  const expenseDate = finding.expenseRecords[0]?.expenseDate ?? 'the same date'
  const amount = finding.expenseRecords[0]?.amount ?? 0
  const currency = finding.expenseRecords[0]?.currency ?? 'INR'
  const merchant = finding.expenseRecords[0]?.merchant ?? 'the same merchant'
  const formattedCurrency = currency === 'INR' ? `₹${amount.toLocaleString('en-IN')}` : `${currency} ${amount}`

  return `We detected possible duplicate expense documents for ${formattedCurrency} on ${expenseDate} at ${merchant}. Are these actual duplicates or separate valid expenses?`
}

function formatRecordCount(count: number): string {
  if (count === 1) {
    return 'one'
  }

  if (count === 2) {
    return 'two'
  }

  if (count === 3) {
    return 'three'
  }

  return `${count}`
}

function buildShortCaseSummary(session: VoiceSessionRecord): string {
  const records = session.duplicateFindings[0]?.expenseRecords ?? []
  const recordCount = Math.max(records.length, 1)
  const firstRecord = records[0]
  const documentType = firstRecord?.documentType?.trim().toLowerCase() || 'expense'

  return `${formatRecordCount(recordCount)} ${documentType} ${recordCount === 1 ? 'entry' : 'entries'} flagged as possible duplicates`
}

function classifyUserResponse(text: string): ClassificationResult {
  const normalizedText = text.trim().toLowerCase()

  if (!normalizedText) {
    return {
      userResponse: 'UNCLEAR_RESPONSE',
      duplicateConfirmed: 'UNCLEAR',
      decisionType: 'UNCLEAR_RESPONSE',
      requiresReupload: false,
      requiresManualReview: true
    }
  }

  if (/(reupload|upload again|submit again|send the correct|replace the document)/.test(normalizedText)) {
    return {
      userResponse: 'REUPLOAD_REQUIRED',
      duplicateConfirmed: 'UNCLEAR',
      decisionType: 'REUPLOAD_REQUIRED',
      requiresReupload: true,
      requiresManualReview: false
    }
  }

  if (/(partial|some of them|one of them|one receipt is duplicate|one document is duplicate)/.test(normalizedText)) {
    return {
      userResponse: 'PARTIAL_DUPLICATE',
      duplicateConfirmed: 'PARTIAL',
      decisionType: 'PARTIAL_DUPLICATE',
      requiresReupload: false,
      requiresManualReview: true
    }
  }

  if (/(not duplicate|separate|different expense|different ride|different trip|valid expense|two rides|two trips)/.test(normalizedText)) {
    return {
      userResponse: 'NOT_DUPLICATE',
      duplicateConfirmed: 'NO',
      decisionType: 'SEPARATE_VALID_EXPENSES',
      requiresReupload: false,
      requiresManualReview: false
    }
  }

  if (/(duplicate|same expense|uploaded twice|same receipt|same ride|same trip)/.test(normalizedText)) {
    return {
      userResponse: 'DUPLICATE_CONFIRMED',
      duplicateConfirmed: 'YES',
      decisionType: 'DUPLICATE_CONFIRMED',
      requiresReupload: true,
      requiresManualReview: false
    }
  }

  return {
    userResponse: 'UNCLEAR_RESPONSE',
    duplicateConfirmed: 'UNCLEAR',
    decisionType: 'UNCLEAR_RESPONSE',
    requiresReupload: false,
    requiresManualReview: true
  }
}

function hasDetailedExplanation(text: string): boolean {
  const normalizedText = text.trim().toLowerCase()
  const wordCount = normalizedText.split(/\s+/).filter(Boolean).length

  return wordCount >= 8 || /(because|one was|other was|separate|different|client|office|home)/.test(normalizedText)
}

function findPreviousUserTexts(session: VoiceSessionRecord, count: number): string[] {
  return session.transcript
    .filter((entry) => entry.speaker === 'user')
    .slice(-count)
    .map((entry) => entry.text)
}

function mapRecommendedAction(result: ClassificationResult): VoiceSessionCompletion['agentSummary']['recommendedNextAction'] {
  if (result.userResponse === 'NOT_DUPLICATE') {
    return 'PROCEED_TO_MANAGER_APPROVAL'
  }

  if (result.userResponse === 'DUPLICATE_CONFIRMED' || result.userResponse === 'REUPLOAD_REQUIRED') {
    return 'ROUTE_TO_REUPLOAD_DOCUMENTS'
  }

  if (result.userResponse === 'PARTIAL_DUPLICATE') {
    return 'ROUTE_TO_MANUAL_REVIEW'
  }

  return 'WAIT_FOR_CUSTOMER_CLARIFICATION'
}

function buildDecisionSummary(result: ClassificationResult, explanation: string): string {
  switch (result.userResponse) {
    case 'NOT_DUPLICATE':
      return `User confirmed the flagged documents are separate valid expenses. ${explanation}`.trim()
    case 'DUPLICATE_CONFIRMED':
      return `User confirmed the flagged documents are duplicates. ${explanation}`.trim()
    case 'PARTIAL_DUPLICATE':
      return `User confirmed some documents are duplicates and some are valid. ${explanation}`.trim()
    case 'REUPLOAD_REQUIRED':
      return `User requested a corrected upload. ${explanation}`.trim()
    case 'UNCLEAR_RESPONSE':
      return `The conversation remained inconclusive. ${explanation}`.trim()
  }
}

function buildSubmissionConfirmationStatement(result: ClassificationResult): string {
  switch (result.userResponse) {
    case 'NOT_DUPLICATE':
      return 'You are confirming these are separate valid expenses.'
    case 'DUPLICATE_CONFIRMED':
      return 'You are confirming these are duplicate documents, so you can reupload the corrected documents without the duplicates.'
    case 'PARTIAL_DUPLICATE':
      return 'You are confirming some documents are duplicates and some are valid.'
    case 'REUPLOAD_REQUIRED':
      return 'You are confirming that a corrected upload is required.'
    case 'UNCLEAR_RESPONSE':
      return 'You are confirming this result needs manual review.'
  }
}

function isStandaloneResolutionAnswer(text: string): boolean {
  const normalizedText = text.trim().toLowerCase().replace(/[.,!?]+/g, ' ').replace(/\s+/g, ' ')

  return /^(yes|yeah|yep|resolved|fixed|working now|done)(?: please| pls| okay| ok| sure| thanks| thank you| go ahead| proceed| send it| send this| submit it| submit this)*$/i.test(
    normalizedText
  )
    || /^(no|not yet|still not|unresolved|not working|issue persists)(?: please| pls| okay| ok| thanks| thank you)*$/i.test(
      normalizedText
    )
}

function extractCompletionExplanation(userTexts: string[]): string {
  const explanation = [...userTexts]
    .reverse()
    .find((text) => {
      const trimmedText = text.trim()

      return trimmedText.length > 0 && !isStandaloneResolutionAnswer(trimmedText)
    })

  return explanation ?? ''
}

function buildCompletion(input: {
  session: VoiceSessionRecord
  classification: ClassificationResult
  explanation: string
  completedAt: string
  voiceModel: string
  reasoningModel: string
}): VoiceSessionCompletion {
  const durationSeconds = Math.max(
    0,
    Math.round((Date.parse(input.completedAt) - Date.parse(input.session.startedAt ?? input.session.createdAt)) / 1000)
  )

  return {
    sessionId: input.session.sessionId,
    caseId: input.session.request.caseId,
    caseReference: input.session.request.caseReference,
    assignmentId: input.session.request.assignmentId,
    conversationPurpose: input.session.request.conversationPurpose,
    status: 'COMPLETED',
    completedAt: input.completedAt,
    userDecision: {
      duplicateConfirmed: input.classification.duplicateConfirmed,
      decisionType: input.classification.decisionType,
      requiresReupload: input.classification.requiresReupload,
      requiresManualReview: input.classification.requiresManualReview,
      userExplanation: input.explanation,
      finalUserConfirmation: true
    },
    duplicateGroupsReviewed: input.session.duplicateFindings.map((finding) => ({
      duplicateGroupId: finding.duplicateGroupId,
      expenseRecordIds: finding.expenseRecords.map((record) => record.expenseRecordId),
      documentIds: finding.expenseRecords.map((record) => record.documentId),
      userResponse: input.classification.userResponse,
      explanation: input.explanation
    })),
    agentSummary: {
      summary: buildDecisionSummary(input.classification, input.explanation),
      confidence: input.classification.userResponse === 'UNCLEAR_RESPONSE' ? 0.52 : 0.88,
      recommendedNextAction: mapRecommendedAction(input.classification)
    },
    transcript: input.session.transcript,
    technicalMetadata: {
      voiceModel: input.voiceModel,
      reasoningModel: input.reasoningModel,
      language: input.session.request.metadata.locale,
      durationSeconds,
      idempotencyKey: `${input.session.sessionId}-COMPLETION`
    }
  }
}

export function createVoiceSession(input: Parameters<typeof createVoiceSessionSeed>[0]): VoiceSessionRecord {
  return createVoiceSessionSeed(input)
}

export function startVoiceSession(input: {
  session: VoiceSessionRecord
  now: string
}): VoiceSessionTurnResult {
  const caseSummary = buildShortCaseSummary(input.session)
  const greetingText = `Hi ${input.session.request.customer.fullName}, this is Pam A.I. You're verified through this secure link. I found Pega case ${input.session.request.caseReference}: ${caseSummary}. Are these duplicates, or separate valid expenses?`

  return withAssistantReply({
    session: {
      ...input.session,
      sessionStatus: 'STARTED',
      sessionState: 'USER_CLARIFICATION',
      startedAt: input.now
    },
    assistantText: greetingText,
    now: input.now,
    nextState: 'USER_CLARIFICATION',
    nextStatus: 'STARTED'
  })
}

export function processVoiceSessionTurn(input: {
  session: VoiceSessionRecord
  userText: string
  inputMode: 'text' | 'voice'
  now: string
  voiceModel?: string
  reasoningModel?: string
}): VoiceSessionTurnResult {
  const trimmedText = sanitizeUserInput(input.userText)
  const sessionWithUserMessage = appendTranscript(input.session, {
    speaker: 'user',
    text: trimmedText,
    timestamp: input.now,
    inputMode: input.inputMode
  })

  if (!trimmedText) {
    return withAssistantReply({
      session: sessionWithUserMessage,
      assistantText: 'I did not catch that. Please say that once more.',
      now: input.now,
      nextState: sessionWithUserMessage.sessionState
    })
  }

  switch (sessionWithUserMessage.sessionState) {
    case 'IDENTITY_CHECK':
    case 'USER_CLARIFICATION': {
      const classification = classifyUserResponse(trimmedText)

      if (classification.userResponse === 'UNCLEAR_RESPONSE') {
        return withAssistantReply({
          session: sessionWithUserMessage,
          assistantText:
            'I need a clearer answer so I can update the case correctly. Are these documents an actual duplicate, separate valid expenses, or do you need to reupload corrected documents?',
          now: input.now,
          nextState: 'FOLLOW_UP_QUESTION'
        })
      }

      if (hasDetailedExplanation(trimmedText)) {
        return withAssistantReply({
          session: sessionWithUserMessage,
          assistantText: `Understood. ${buildSubmissionConfirmationStatement(classification)} Should I send this clarification back to the expense review team?`,
          now: input.now,
          nextState: 'CONFIRM_FINAL_ANSWER'
        })
      }

      return withAssistantReply({
        session: sessionWithUserMessage,
        assistantText:
          classification.userResponse === 'NOT_DUPLICATE'
            ? 'Understood. Please briefly explain why these are separate valid expenses even though they were flagged as possible duplicates.'
            : classification.userResponse === 'DUPLICATE_CONFIRMED'
              ? 'Understood. Please briefly explain what makes these duplicate documents so I can send the clarification back to the expense review team.'
              : classification.userResponse === 'REUPLOAD_REQUIRED'
                ? 'Understood. Please briefly explain what needs to be reuploaded so I can update the expense review team.'
                : 'Understood. Please explain which documents are duplicates and which are valid.',
        now: input.now,
        nextState: 'FOLLOW_UP_QUESTION'
      })
    }
    case 'FOLLOW_UP_QUESTION': {
      const previousUserTexts = findPreviousUserTexts(sessionWithUserMessage, 2)
      const classification = classifyUserResponse(previousUserTexts[0] ?? trimmedText)

      return withAssistantReply({
        session: sessionWithUserMessage,
        assistantText:
          classification.userResponse === 'NOT_DUPLICATE'
            ? 'Thank you. You are confirming these should be marked as separate valid expenses. Should I send this clarification back to the expense review team?'
            : classification.userResponse === 'DUPLICATE_CONFIRMED'
              ? 'Thank you. You are confirming these should be marked as duplicate documents, and you can reupload the corrected documents without the duplicates. Should I send this clarification back to the expense review team?'
              : classification.userResponse === 'REUPLOAD_REQUIRED'
                ? 'Thank you. You are confirming that a corrected upload is required. Should I send this clarification back to the expense review team?'
                : 'Thank you. You are confirming this result needs manual review. Should I send this clarification back to the expense review team?',
        now: input.now,
        nextState: 'CONFIRM_FINAL_ANSWER'
      })
    }
    case 'CONFIRM_FINAL_ANSWER': {
      const confirmation = parseResolutionAnswer(trimmedText)

      if (confirmation !== true) {
        return withAssistantReply({
          session: sessionWithUserMessage,
          assistantText: 'Please answer yes if I should submit this clarification to the expense review team, or no if you want to restate your answer.',
          now: input.now,
          nextState: confirmation === false ? 'USER_CLARIFICATION' : 'CONFIRM_FINAL_ANSWER'
        })
      }

      const previousUserTexts = findPreviousUserTexts(sessionWithUserMessage, 3)
      const explanation = extractCompletionExplanation(previousUserTexts)
      const classificationText = previousUserTexts.find((text) => classifyUserResponse(text).userResponse !== 'UNCLEAR_RESPONSE') ?? explanation
      const classification = classifyUserResponse(classificationText)
      const completedSession: VoiceSessionRecord = {
        ...sessionWithUserMessage,
        sessionStatus: 'COMPLETED',
        sessionState: 'COMPLETED',
        completedAt: input.now
      }
      const completion = buildCompletion({
        session: completedSession,
        classification,
        explanation,
        completedAt: input.now,
        voiceModel: input.voiceModel ?? 'gpt-4o-mini-tts',
        reasoningModel: input.reasoningModel ?? 'deterministic-fallback'
      })
      const finalReply = withAssistantReply({
        session: completedSession,
        assistantText: 'Done. I have submitted your clarification to the expense review team.',
        now: input.now,
        nextState: 'COMPLETED',
        nextStatus: 'COMPLETED',
        completedAt: input.now
      })

      return {
        ...finalReply,
        completion: {
          ...completion,
          transcript: finalReply.session.transcript
        }
      }
    }
    case 'COMPLETED': {
      return withAssistantReply({
        session: sessionWithUserMessage,
        assistantText: 'This Pam AI session is already complete. The clarification has already been prepared for the expense review team.',
        now: input.now,
        nextState: 'COMPLETED',
        nextStatus: 'COMPLETED',
        completedAt: sessionWithUserMessage.completedAt
      })
    }
    case 'SESSION_LOADED':
    case 'CASE_CONTEXT_EXPLANATION':
    case 'DUPLICATE_FINDING_EXPLANATION':
    case 'SUBMIT_TO_PEGA': {
      return withAssistantReply({
        session: sessionWithUserMessage,
        assistantText: 'The session is being prepared. Please wait a moment and try again.',
        now: input.now,
        nextState: 'USER_CLARIFICATION'
      })
    }
  }
}
