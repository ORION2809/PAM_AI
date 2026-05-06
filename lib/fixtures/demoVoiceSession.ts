import type { CreateVoiceSessionRequest } from '@/lib/schemas/voiceSession'

export function createDemoVoiceSessionRequest(): CreateVoiceSessionRequest {
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
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    metadata: {
      createdByOperator: 'System',
      tenant: 'ExpensePOC',
      locale: 'en-IN'
    }
  }
}