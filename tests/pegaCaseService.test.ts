import { describe, expect, it } from 'vitest'

import { createVoiceSessionRequestSchema } from '@/lib/schemas/voiceSession'
import {
  extractPegaCaseContextText,
  mapPegaCaseToVoiceSessionRequest,
  resolveCaseIdCandidates
} from '@/lib/services/pegaCaseService'

const basePegaCase = {
  pyID: 'E-7036',
  pyLabel: 'Expense Processing',
  pxCurrentStageLabel: 'Approval Rejection',
  pyStatusWork: 'Resolved-Rejected',
  ExpenseAmount: 2057.2,
  ExpenseType: 'Travel - Ground Transportation',
  BusinessPurpose: 'Client Meeting',
  DuplicateExpensesMessageForEmail:
    'I am writing regarding an expense request. I noticed duplicate entries in the hotel stay documents. Could you please confirm if this was submitted by mistake?',
  EmailResponseBody: 'Hi PAM,\n\nThat was my mistake.',
  ExpenseReportName: 'May 2026 Business Expenses',
  pxCreateOpName: 'Manohar Lakkam',
  pyOrigUserID: 'Manohar.Lakkam@bluevoir.com',
  pzEmailList: ['Manohar.Lakkam@bluevoir.com'],
  ExpenseRecords: [
    {
      ExpenseID: 'document_1',
      ExpenseDate: '2023-10-14',
      ExpenseAmount: 972.76,
      ExpenseDescription: 'Windsor Court Hotel stay 3 nights London',
      ExpenseType: 'Hotel Stay',
      pyGUID: 'guid-1'
    },
    {
      ExpenseID: 'document_2',
      ExpenseDate: '2023-10-14',
      ExpenseAmount: 972.76,
      ExpenseDescription: 'Belgravia Hotel stay 3 nights London',
      ExpenseType: 'Hotel Stay',
      pyGUID: 'guid-2'
    }
  ],
  ExpenseDocuments: [
    {
      pyAttachmentLink: 'ATTACH-1',
      pyAttachName: 'hotel2.pdf',
      pyFileName: 'hotel2',
      pyFileExtension: 'pdf'
    },
    {
      pyAttachmentLink: 'ATTACH-2',
      pyAttachName: 'hotel1.pdf',
      pyFileName: 'hotel1',
      pyFileExtension: 'pdf'
    }
  ]
}

describe('pegaCaseService', () => {
  it('prefers DuplicateExpensesMessageForEmail for PAMAI case context', () => {
    expect(extractPegaCaseContextText(basePegaCase)).toContain('duplicate entries in the hotel stay documents')
  })

  it('falls back to the original audit prompt embedded in EmailResponseBody', () => {
    const context = extractPegaCaseContextText({
      ...basePegaCase,
      DuplicateExpensesMessageForEmail: null,
      EmailResponseBody:
        'Hi PAM,\n\nThat was my mistake.\n\nFrom: bluevoirstpexpenses@gmail.com\n\nI am writing regarding an expense request. I noticed duplicate entries in the hotel stay documents. Could you please confirm if this was submitted by mistake?\n\nRegards,\nAudit Agent'
    })

    expect(context).toContain('I am writing regarding an expense request.')
    expect(context).toContain('Could you please confirm if this was submitted by mistake?')
  })

  it('maps a Pega case into a valid PAMAI voice session request', () => {
    const mapped = mapPegaCaseToVoiceSessionRequest({
      pegaCase: basePegaCase,
      requestedCaseId: 'E-7036',
      callbackUrl: 'https://pega.company.com/prweb/api/pamai/v1/duplicate-response',
      now: '2026-05-08T12:00:00.000Z',
      expiresInHours: 72,
      defaultCustomerMobile: '+910000003210'
    })

    expect(() => createVoiceSessionRequestSchema.parse(mapped)).not.toThrow()
    expect(mapped.caseId).toBe('E-7036')
    expect(mapped.caseReference).toBe('E-7036')
    expect(mapped.customer.fullName).toBe('Manohar Lakkam')
    expect(mapped.customer.email).toBe('Manohar.Lakkam@bluevoir.com')
    expect(mapped.customer.mobile).toBe('+910000003210')
    expect(mapped.caseContextText).toContain('duplicate entries in the hotel stay documents')
    expect(mapped.duplicateFindings).toHaveLength(1)
    expect(mapped.duplicateFindings[0]?.expenseRecords).toHaveLength(2)
    expect(mapped.duplicateFindings[0]?.expenseRecords[0]).toMatchObject({
      expenseRecordId: 'document_1',
      documentId: 'ATTACH-1',
      fileName: 'hotel2.pdf',
      merchant: 'Windsor Court Hotel',
      currency: 'USD'
    })
  })

  it('resolves short numeric demo ids to the full Pega case id candidate first', () => {
    expect(resolveCaseIdCandidates('44')).toEqual(['E-9044', 'E-44', '44'])
    expect(resolveCaseIdCandidates('7036')).toEqual(['E-7036', '7036'])
    expect(resolveCaseIdCandidates('E-9044')).toEqual(['E-9044'])
  })

  it('maps a Pega case with only uploaded documents into a valid voice session request', () => {
    const mapped = mapPegaCaseToVoiceSessionRequest({
      pegaCase: {
        pyID: 'E-9044',
        pyLabel: 'Expense Processing',
        pxCurrentStageLabel: 'Duplicate Document Identified',
        pyStatusWork: 'Pending - Customer Response',
        ExpenseAmount: 0,
        pxCreateOpName: 'Avinash',
        pyOrigUserID: 'Avinash',
        pzEmailList: ['bandiavinash686@gmail.com'],
        ExpenseRecords: null,
        ExpenseDocuments: [
          {
            pyAttachmentLink: 'ATTACH-9044',
            pyAttachName: 'uploaded-expense.pdf',
            pyFileName: 'uploaded-expense',
            pyFileExtension: 'pdf'
          }
        ]
      },
      requestedCaseId: 'E-9044',
      callbackUrl: 'https://pega.company.com/prweb/api/pamai/v1/duplicate-response',
      now: '2026-05-08T12:00:00.000Z',
      expiresInHours: 72,
      defaultCustomerMobile: '+910000003210'
    })

    expect(() => createVoiceSessionRequestSchema.parse(mapped)).not.toThrow()
    expect(mapped.caseId).toBe('E-9044')
    expect(mapped.customer.fullName).toBe('Avinash')
    expect(mapped.caseContextText).toContain('Pega case E-9044')
    expect(mapped.duplicateFindings[0]?.expenseRecords[0]).toMatchObject({
      expenseRecordId: 'CASE-E-9044-DOCUMENT-1',
      documentId: 'ATTACH-9044',
      fileName: 'uploaded-expense.pdf',
      documentType: 'Expense Processing'
    })
  })
})
