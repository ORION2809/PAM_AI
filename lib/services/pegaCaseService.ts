import { getServerEnv } from '@/lib/env'
import { z } from 'zod'

import { createVoiceSessionRequestSchema, type CreateVoiceSessionRequest } from '@/lib/schemas/voiceSession'
import { fetchWithTimeout } from '@/lib/utils/network'

const pegaExpenseRecordSchema = z
  .object({
    ExpenseID: z.string().min(1),
    ExpenseDate: z.string().min(1),
    ExpenseAmount: z.number().nonnegative(),
    ExpenseDescription: z.string().min(1),
    ExpenseType: z.string().min(1),
    pyGUID: z.string().min(1).optional()
  })
  .passthrough()

const pegaExpenseDocumentSchema = z
  .object({
    pyAttachmentLink: z.string().min(1).optional(),
    pyAttachName: z.string().min(1).optional(),
    pyFileName: z.string().min(1).optional(),
    pyFileExtension: z.string().min(1).optional()
  })
  .passthrough()

const pegaExpenseRecordsSchema = z.preprocess(
  (value) => (value == null ? [] : value),
  z.array(pegaExpenseRecordSchema)
)

const pegaExpenseDocumentsSchema = z.preprocess(
  (value) => (value == null ? [] : value),
  z.array(pegaExpenseDocumentSchema)
)

const pegaCaseSchema = z
  .object({
    pyID: z.string().min(1),
    pyLabel: z.string().min(1).optional(),
    pxCurrentStageLabel: z.string().min(1).optional(),
    pyStatusWork: z.string().min(1).optional(),
    ExpenseAmount: z.number().nonnegative().optional(),
    ExpenseType: z.string().min(1).optional(),
    BusinessPurpose: z.string().min(1).optional(),
    DuplicateExpensesMessageForEmail: z.string().nullable().optional(),
    EmailResponseBody: z.string().nullable().optional(),
    pyAIAgentResponse: z.string().nullable().optional(),
    ExpenseReportName: z.string().min(1).optional(),
    pxCreateOpName: z.string().min(1).optional(),
    pyOrigUserID: z.string().min(1).optional(),
    pxCreateOperator: z.string().min(1).optional(),
    pzEmailList: z.array(z.string().min(1)).optional(),
    ExpenseRecords: pegaExpenseRecordsSchema,
    ExpenseDocuments: pegaExpenseDocumentsSchema.optional().default([])
  })
  .passthrough()

export type PegaCase = z.infer<typeof pegaCaseSchema>

export class PegaCaseServiceError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'PegaCaseServiceError'
    this.statusCode = statusCode
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function humanizeEmailLocalPart(localPart: string): string {
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ')
}

function extractAuditPromptFromEmailBody(emailResponseBody: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(emailResponseBody ?? '')

  if (!normalized) {
    return null
  }

  const match = normalized.match(/I am writing regarding an expense request\.[\s\S]*?(?=\n\nRegards,\nAudit Agent|$)/i)
  return match ? normalizeWhitespace(match[0]) : null
}

function readStringField(source: Record<string, unknown> | undefined, key: string): string | null {
  const value = source?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function inferCurrency(pegaCase: PegaCase): string {
  const hintText = [pegaCase.DuplicateExpensesMessageForEmail, pegaCase.EmailResponseBody, pegaCase.ExpenseType]
    .filter(Boolean)
    .join(' ')

  if (/₹|\bINR\b/i.test(hintText)) {
    return 'INR'
  }

  if (/£|\bGBP\b/i.test(hintText)) {
    return 'GBP'
  }

  if (/€|\bEUR\b/i.test(hintText)) {
    return 'EUR'
  }

  return 'USD'
}

function extractMerchant(description: string): string {
  const trimmedDescription = description.trim()
  const cleanedDescription = trimmedDescription.replace(
    /\s+(stay|flight|ticket|taxi|cab|ride|meal|breakfast|dinner|lunch|room service)\b.*$/i,
    ''
  )

  return cleanedDescription || trimmedDescription.split(/\s+/).slice(0, 3).join(' ')
}

function buildFallbackCaseContext(pegaCase: PegaCase): string {
  const firstExpense = pegaCase.ExpenseRecords[0]
  const secondExpense = pegaCase.ExpenseRecords[1]

  if (!firstExpense) {
    const documentCount = pegaCase.ExpenseDocuments.length
    const documentText =
      documentCount === 1 ? '1 uploaded expense document' : `${documentCount || 'no'} uploaded expense documents`

    return `Pega case ${pegaCase.pyID} is currently at ${pegaCase.pxCurrentStageLabel ?? pegaCase.pyStatusWork ?? 'expense review'} with ${documentText}. Please confirm whether the submitted document is a duplicate, a separate valid expense, or whether a corrected upload is needed.`
  }

  const amount = firstExpense?.ExpenseAmount ?? pegaCase.ExpenseAmount ?? 0
  const currency = inferCurrency(pegaCase)
  const formattedAmount = currency === 'USD' ? `$${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`
  const firstDescription = firstExpense?.ExpenseDescription ?? 'the first flagged expense'
  const secondDescription = secondExpense?.ExpenseDescription ?? 'the second flagged expense'

  return `Pega flagged the expense case ${pegaCase.pyID} for possible duplicate review. The highlighted records include ${firstDescription} and ${secondDescription}, both for ${formattedAmount}. Please confirm whether these were submitted by mistake or represent separate valid expenses.`
}

function resolveCustomerEmail(pegaCase: PegaCase): string {
  const candidate = pegaCase.pzEmailList?.find(Boolean) ?? pegaCase.pyOrigUserID ?? pegaCase.pxCreateOperator

  if (candidate && /@/.test(candidate)) {
    return candidate
  }

  return `case-${pegaCase.pyID.toLowerCase()}@bluevoir.local`
}

function resolveCustomerName(pegaCase: PegaCase, email: string): string {
  if (pegaCase.pxCreateOpName) {
    return pegaCase.pxCreateOpName
  }

  return humanizeEmailLocalPart(email.split('@')[0] ?? pegaCase.pyID)
}

export function extractPegaCaseContextText(input: unknown): string {
  const pegaCase = pegaCaseSchema.parse(input)
  const directContext = normalizeWhitespace(pegaCase.DuplicateExpensesMessageForEmail ?? '')

  if (directContext) {
    return directContext
  }

  const emailPrompt = extractAuditPromptFromEmailBody(pegaCase.EmailResponseBody)

  if (emailPrompt) {
    return emailPrompt
  }

  return buildFallbackCaseContext(pegaCase)
}

export function resolveCaseIdCandidates(caseId: string): string[] {
  const trimmedCaseId = caseId.trim()
  const candidates: string[] = []

  function addCandidate(candidate: string): void {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate)
    }
  }

  if (/^\d+$/.test(trimmedCaseId)) {
    if (trimmedCaseId.length <= 2) {
      addCandidate(`E-90${trimmedCaseId.padStart(2, '0')}`)
    }

    addCandidate(`E-${trimmedCaseId}`)
  }

  addCandidate(trimmedCaseId)

  return candidates
}

function mapPegaExpenseRecords(pegaCase: PegaCase, currency: string) {
  if (pegaCase.ExpenseRecords.length > 0) {
    return pegaCase.ExpenseRecords.map((record, index) => {
      const document = pegaCase.ExpenseDocuments[index]

      return {
        expenseRecordId: record.ExpenseID,
        documentId:
          document?.pyAttachmentLink ?? readStringField(document, 'pzInsKey') ?? document?.pyAttachName ?? record.ExpenseID,
        fileName:
          document?.pyAttachName ?? document?.pyFileName ?? `${record.ExpenseID}.${document?.pyFileExtension ?? 'pdf'}`,
        expenseDate: record.ExpenseDate,
        amount: record.ExpenseAmount,
        currency,
        merchant: extractMerchant(record.ExpenseDescription),
        documentType: record.ExpenseType
      }
    })
  }

  const fallbackDocuments = pegaCase.ExpenseDocuments.length > 0 ? pegaCase.ExpenseDocuments : [undefined]

  return fallbackDocuments.map((document, index) => {
    const fallbackId = `CASE-${pegaCase.pyID}-DOCUMENT-${index + 1}`
    const documentId =
      document?.pyAttachmentLink ?? readStringField(document, 'pzInsKey') ?? document?.pyAttachName ?? fallbackId
    const fileName =
      document?.pyAttachName ??
      (document?.pyFileName
        ? `${document.pyFileName}.${document.pyFileExtension ?? 'pdf'}`
        : `expense-document-${index + 1}.pdf`)

    return {
      expenseRecordId: fallbackId,
      documentId,
      fileName,
      expenseDate: readStringField(pegaCase, 'pxCreateDateTime') ?? new Date().toISOString(),
      amount: pegaCase.ExpenseAmount ?? 0,
      currency,
      merchant: pegaCase.ExpenseReportName ?? pegaCase.pyLabel ?? 'Uploaded expense document',
      documentType: pegaCase.ExpenseType ?? pegaCase.pyLabel ?? 'Expense Document'
    }
  })
}

export function mapPegaCaseToVoiceSessionRequest(input: {
  pegaCase: unknown
  requestedCaseId: string
  callbackUrl: string
  now?: string
  expiresInHours?: number
  defaultCustomerMobile?: string
}): CreateVoiceSessionRequest {
  const pegaCase = pegaCaseSchema.parse(input.pegaCase)

  if (pegaCase.pyID !== input.requestedCaseId) {
    throw new PegaCaseServiceError(502, `Pega case mismatch: requested ${input.requestedCaseId} but received ${pegaCase.pyID}.`)
  }

  const now = input.now ? new Date(input.now) : new Date()
  const expiresInHours = input.expiresInHours ?? 72
  const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString()
  const customerEmail = resolveCustomerEmail(pegaCase)
  const customerName = resolveCustomerName(pegaCase, customerEmail)
  const currency = inferCurrency(pegaCase)
  const caseContextText = extractPegaCaseContextText(pegaCase)

  return createVoiceSessionRequestSchema.parse({
    sourceSystem: 'Pega',
    caseId: pegaCase.pyID,
    caseReference: pegaCase.pyID,
    assignmentId: `ASSIGN-${pegaCase.pyID}`,
    caseType: pegaCase.pyLabel ?? 'Expense Processing',
    currentStage: pegaCase.pxCurrentStageLabel ?? pegaCase.pyLabel ?? 'Expense Review',
    currentStep: pegaCase.pyStatusWork ?? 'Pending clarification',
    conversationPurpose: 'DUPLICATE_EXPENSE_DOCUMENT_CLARIFICATION',
    caseContextText,
    customer: {
      customerId: customerEmail,
      fullName: customerName,
      email: customerEmail,
      mobile: input.defaultCustomerMobile ?? '+910000003210'
    },
    duplicateFindings: [
      {
        duplicateGroupId: `DUP-GRP-${pegaCase.pyID}`,
        reason: caseContextText,
        confidence: 0.9,
        expenseRecords: mapPegaExpenseRecords(pegaCase, currency)
      }
    ],
    callback: {
      url: input.callbackUrl,
      authType: 'OAUTH2_CLIENT_CREDENTIALS'
    },
    expiresAt,
    metadata: {
      createdByOperator: pegaCase.pxCreateOpName ?? 'Pega',
      tenant: 'Bluevoir',
      locale: 'en-IN'
    }
  })
}

async function fetchPegaAccessToken(): Promise<string> {
  const env = getServerEnv()

  if (!env.pegaClientId || !env.pegaClientSecret || !env.pegaTokenEndpoint) {
    throw new PegaCaseServiceError(500, 'Pega OAuth configuration is incomplete.')
  }

  const tokenResponse = await fetchWithTimeout(
    env.pegaTokenEndpoint,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.pegaClientId,
        client_secret: env.pegaClientSecret
      })
    },
    15_000
  )

  if (!tokenResponse.ok) {
    throw new PegaCaseServiceError(502, `Pega OAuth request failed with status ${tokenResponse.status}.`)
  }

  const tokenJson = (await tokenResponse.json().catch(() => null)) as { access_token?: string } | null

  if (!tokenJson?.access_token) {
    throw new PegaCaseServiceError(502, 'Pega OAuth response did not include an access token.')
  }

  return tokenJson.access_token
}

async function fetchPegaCase(caseId: string, accessToken: string): Promise<unknown> {
  const env = getServerEnv()

  if (!env.pegaExpenseDataViewUrl) {
    throw new PegaCaseServiceError(500, 'Pega expense data-view URL is not configured.')
  }

  const caseUrl = new URL(env.pegaExpenseDataViewUrl)
  caseUrl.searchParams.set('dataViewParameters', JSON.stringify({ pyID: caseId }))

  const caseResponse = await fetchWithTimeout(
    caseUrl,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    },
    15_000
  )

  if (caseResponse.status === 404) {
    throw new PegaCaseServiceError(404, `Pega case ${caseId} was not found.`)
  }

  if (!caseResponse.ok) {
    throw new PegaCaseServiceError(502, `Pega case lookup failed with status ${caseResponse.status}.`)
  }

  return caseResponse.json().catch(() => {
    throw new PegaCaseServiceError(502, 'Pega case response was not valid JSON.')
  })
}

export async function createVoiceSessionRequestFromPegaCase(input: {
  caseId: string
  now?: string
}): Promise<CreateVoiceSessionRequest> {
  const env = getServerEnv()
  const accessToken = await fetchPegaAccessToken()
  const caseIdCandidates = resolveCaseIdCandidates(input.caseId)
  let lastError: unknown = null

  for (const caseIdCandidate of caseIdCandidates) {
    try {
      const pegaCase = await fetchPegaCase(caseIdCandidate, accessToken)

      return mapPegaCaseToVoiceSessionRequest({
        pegaCase,
        requestedCaseId: caseIdCandidate,
        callbackUrl: env.pamaiPegaCallbackUrl,
        now: input.now,
        defaultCustomerMobile: env.pamaiDefaultCustomerMobile
      })
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new PegaCaseServiceError(404, `Pega case ${input.caseId} was not found.`)
}
