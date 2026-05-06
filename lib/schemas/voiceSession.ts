import { z } from 'zod'

export const voiceSessionStatuses = [
  'READY',
  'STARTED',
  'COMPLETED',
  'CALLBACK_FAILED',
  'SESSION_EXPIRED',
  'IDENTITY_FAILED',
  'INCOMPLETE'
] as const
export const voiceConversationStates = [
  'SESSION_LOADED',
  'IDENTITY_CHECK',
  'CASE_CONTEXT_EXPLANATION',
  'DUPLICATE_FINDING_EXPLANATION',
  'USER_CLARIFICATION',
  'FOLLOW_UP_QUESTION',
  'CONFIRM_FINAL_ANSWER',
  'SUBMIT_TO_PEGA',
  'COMPLETED'
] as const
export const conversationPurposes = ['DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION'] as const
export const callbackAuthTypes = ['NONE', 'OAUTH2_CLIENT_CREDENTIALS', 'HMAC'] as const
export const transcriptSpeakers = ['agent', 'user', 'system'] as const
export const inputModes = ['text', 'voice'] as const
export const duplicateConfirmedValues = ['YES', 'NO', 'PARTIAL', 'UNCLEAR'] as const
export const decisionTypes = [
  'DUPLICATE_CONFIRMED',
  'SEPARATE_VALID_EXPENSES',
  'PARTIAL_DUPLICATE',
  'REUPLOAD_REQUIRED',
  'UNCLEAR_RESPONSE'
] as const
export const duplicateUserResponses = [
  'DUPLICATE_CONFIRMED',
  'NOT_DUPLICATE',
  'PARTIAL_DUPLICATE',
  'REUPLOAD_REQUIRED',
  'UNCLEAR_RESPONSE'
] as const
export const recommendedNextActions = [
  'PROCEED_TO_MANAGER_APPROVAL',
  'ROUTE_TO_REUPLOAD_DOCUMENTS',
  'ROUTE_TO_MANUAL_REVIEW',
  'SEND_REMINDER',
  'WAIT_FOR_CUSTOMER_CLARIFICATION'
] as const
export const callbackStatuses = ['PENDING', 'DELIVERED', 'FAILED'] as const

export const voiceSessionStatusSchema = z.enum(voiceSessionStatuses)
export const voiceConversationStateSchema = z.enum(voiceConversationStates)
export const conversationPurposeSchema = z.enum(conversationPurposes)
export const callbackAuthTypeSchema = z.enum(callbackAuthTypes)
export const transcriptSpeakerSchema = z.enum(transcriptSpeakers)
export const inputModeSchema = z.enum(inputModes)
export const duplicateConfirmedSchema = z.enum(duplicateConfirmedValues)
export const decisionTypeSchema = z.enum(decisionTypes)
export const duplicateUserResponseSchema = z.enum(duplicateUserResponses)
export const recommendedNextActionSchema = z.enum(recommendedNextActions)
export const callbackStatusSchema = z.enum(callbackStatuses)

export const customerSchema = z.object({
  customerId: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().min(8)
})

export const expenseRecordSchema = z.object({
  expenseRecordId: z.string().min(1),
  documentId: z.string().min(1),
  fileName: z.string().min(1),
  expenseDate: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().min(1),
  merchant: z.string().min(1),
  documentType: z.string().min(1)
})

export const duplicateFindingSchema = z.object({
  duplicateGroupId: z.string().min(1),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  expenseRecords: z.array(expenseRecordSchema).min(1)
})

export const callbackConfigSchema = z.object({
  url: z.string().url(),
  authType: callbackAuthTypeSchema
})

export const sessionMetadataSchema = z.object({
  createdByOperator: z.string().min(1),
  tenant: z.string().min(1),
  locale: z.string().min(1)
})

export const createVoiceSessionRequestSchema = z.object({
  sourceSystem: z.literal('Pega'),
  caseId: z.string().min(1),
  caseReference: z.string().min(1),
  assignmentId: z.string().min(1),
  caseType: z.string().min(1),
  currentStage: z.string().min(1),
  currentStep: z.string().min(1),
  conversationPurpose: conversationPurposeSchema,
  customer: customerSchema,
  duplicateFindings: z.array(duplicateFindingSchema).min(1),
  callback: callbackConfigSchema,
  expiresAt: z.string().datetime(),
  metadata: sessionMetadataSchema
})

export const maskedCustomerSchema = z.object({
  customerId: z.string(),
  fullName: z.string(),
  emailMasked: z.string(),
  mobileLastFour: z.string().length(4)
})

export const transcriptEntrySchema = z.object({
  speaker: transcriptSpeakerSchema,
  text: z.string().min(1),
  timestamp: z.string().datetime(),
  inputMode: inputModeSchema
})

export const duplicateGroupReviewSchema = z.object({
  duplicateGroupId: z.string().min(1),
  expenseRecordIds: z.array(z.string().min(1)).min(1),
  documentIds: z.array(z.string().min(1)).min(1),
  userResponse: duplicateUserResponseSchema,
  explanation: z.string().min(1)
})

export const userDecisionSchema = z.object({
  duplicateConfirmed: duplicateConfirmedSchema,
  decisionType: decisionTypeSchema,
  requiresReupload: z.boolean(),
  requiresManualReview: z.boolean(),
  userExplanation: z.string().min(1),
  finalUserConfirmation: z.boolean()
})

export const agentSummarySchema = z.object({
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  recommendedNextAction: recommendedNextActionSchema
})

export const technicalMetadataSchema = z.object({
  voiceModel: z.string().min(1),
  reasoningModel: z.string().min(1),
  language: z.string().min(1),
  durationSeconds: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1)
})

export const voiceSessionCompletionSchema = z.object({
  sessionId: z.string().min(1),
  caseId: z.string().min(1),
  caseReference: z.string().min(1),
  assignmentId: z.string().min(1),
  conversationPurpose: conversationPurposeSchema,
  status: z.literal('COMPLETED'),
  completedAt: z.string().datetime(),
  userDecision: userDecisionSchema,
  duplicateGroupsReviewed: z.array(duplicateGroupReviewSchema).min(1),
  agentSummary: agentSummarySchema,
  transcript: z.array(transcriptEntrySchema),
  technicalMetadata: technicalMetadataSchema
})

export const pegaCallbackAttemptSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  callbackStatus: callbackStatusSchema,
  httpStatusCode: z.number().int().min(100).max(599).nullable(),
  responseBody: z.string().nullable(),
  attemptedAt: z.string().datetime(),
  retryCount: z.number().int().min(0)
})

export const voiceSessionRecordSchema = z.object({
  sessionId: z.string().min(1),
  sessionStatus: voiceSessionStatusSchema,
  sessionState: voiceConversationStateSchema,
  sessionTokenHash: z.string().min(1),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
  request: createVoiceSessionRequestSchema,
  duplicateFindings: z.array(duplicateFindingSchema),
  transcript: z.array(transcriptEntrySchema)
})

export const voiceSessionContextSchema = z.object({
  sessionId: z.string().min(1),
  sessionStatus: voiceSessionStatusSchema,
  sessionState: voiceConversationStateSchema,
  caseId: z.string().min(1),
  caseReference: z.string().min(1),
  assignmentId: z.string().min(1),
  currentStage: z.string().min(1),
  currentStep: z.string().min(1),
  conversationPurpose: conversationPurposeSchema,
  expiresAt: z.string().datetime(),
  customer: maskedCustomerSchema,
  duplicateFindings: z.array(duplicateFindingSchema),
  transcript: z.array(transcriptEntrySchema),
  metadata: sessionMetadataSchema
})

export const auditSessionExportSchema = z.object({
  sessionId: z.string().min(1),
  caseId: z.string().min(1),
  status: voiceSessionStatusSchema,
  userDecision: z.string().nullable(),
  requiresReupload: z.boolean().nullable(),
  userExplanation: z.string().nullable(),
  recommendedNextAction: z.string().nullable(),
  sentToPega: z.boolean(),
  sentToPegaAt: z.string().datetime().nullable()
})

export type CreateVoiceSessionRequest = z.infer<typeof createVoiceSessionRequestSchema>
export type DuplicateFinding = z.infer<typeof duplicateFindingSchema>
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>
export type VoiceSessionContext = z.infer<typeof voiceSessionContextSchema>
export type VoiceSessionRecord = z.infer<typeof voiceSessionRecordSchema>
export type VoiceSessionCompletion = z.infer<typeof voiceSessionCompletionSchema>
export type PegaCallbackAttempt = z.infer<typeof pegaCallbackAttemptSchema>
export type AuditSessionExport = z.infer<typeof auditSessionExportSchema>

export function createVoiceSessionSeed(input: {
  sessionId: string
  sessionTokenHash: string
  request: CreateVoiceSessionRequest
  createdAt: string
}): VoiceSessionRecord {
  return voiceSessionRecordSchema.parse({
    sessionId: input.sessionId,
    sessionStatus: 'READY',
    sessionState: 'SESSION_LOADED',
    sessionTokenHash: input.sessionTokenHash,
    createdAt: input.createdAt,
    startedAt: null,
    completedAt: null,
    expiresAt: input.request.expiresAt,
    request: input.request,
    duplicateFindings: input.request.duplicateFindings,
    transcript: []
  })
}