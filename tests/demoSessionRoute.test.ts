import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetServerEnvCache } from '@/lib/env'

import { POST as createDemoSessionRoute } from '@/app/api/demo/session/route'
import { GET as getVoiceSessionRoute } from '@/app/api/v1/voice-sessions/[sessionId]/route'

const globalStore = globalThis as typeof globalThis & {
  __voiceCsrRateLimitStore?: Map<string, { count: number; resetAt: number }>
}

function readTokenFromConversationUrl(conversationUrl: string): string {
  const url = new URL(conversationUrl)
  return decodeURIComponent(url.hash.replace('#token=', ''))
}

const pegaCase = {
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

describe('demo session route', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    globalStore.__voiceCsrRateLimitStore?.clear()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()

    process.env.PEGA_CLIENT_ID = 'test-client'
    process.env.PEGA_CLIENT_SECRET = 'test-secret'
    process.env.PEGA_TOKEN_ENDPOINT = 'https://bluevoir-251.pegademo.com/prweb/PRRestService/oauth2/v1/token'
    process.env.PEGA_EXPENSE_DATA_VIEW_URL = 'https://bluevoir-251.pegademo.com/prweb/api/application/v2/data_views/D_ExpenseProcessing'
    process.env.PAMAI_PEGA_CALLBACK_URL =
      'https://bluevoir-251.pegademo.com/prweb/api/VoiceAICaseCreation/V1/ResumeFlowfromVoiceAI'
    process.env.PAMAI_DEFAULT_CUSTOMER_MOBILE = '+910000003210'
    resetServerEnvCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetServerEnvCache()
  })

  it('creates a live Pega-backed session for the requested case id', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'pega-access-token', token_type: 'bearer', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(pegaCase), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )

    const response = await createDemoSessionRoute(
      new NextRequest('http://localhost/api/demo/session?caseId=E-7036', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '10.3.0.1'
        }
      })
    )

    expect(response.status).toBe(201)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('E-7036')

    const body = (await response.json()) as {
      sessionId: string
      caseId: string
      caseReference: string
      conversationUrl: string
    }

    expect(body.caseId).toBe('E-7036')
    expect(body.caseReference).toBe('E-7036')
    expect(body.conversationUrl).toMatch(/^http:\/\/localhost\/voice\/session\//)

    const token = readTokenFromConversationUrl(body.conversationUrl)

    const sessionResponse = await getVoiceSessionRoute(
      new NextRequest(`http://localhost/api/v1/voice-sessions/${body.sessionId}?token=${encodeURIComponent(token)}`),
      {
        params: Promise.resolve({ sessionId: body.sessionId })
      }
    )

    expect(sessionResponse.status).toBe(200)

    const sessionBody = (await sessionResponse.json()) as {
      session: {
        caseId: string
        caseReference: string
      }
    }

    expect(sessionBody.session.caseId).toBe('E-7036')
    expect(sessionBody.session.caseReference).toBe('E-7036')
  })

  it('creates a session when the URL uses the short numeric case id from the email link', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'pega-access-token', token_type: 'bearer', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...pegaCase, pyID: 'E-9044' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )

    const response = await createDemoSessionRoute(
      new NextRequest('http://localhost/api/demo/session?caseId=44', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '10.3.0.6'
        }
      })
    )

    expect(response.status).toBe(201)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('E-9044')

    const body = (await response.json()) as {
      caseId: string
      caseReference: string
    }

    expect(body.caseId).toBe('E-9044')
    expect(body.caseReference).toBe('E-9044')
  })

  it('returns 400 when the case id in the URL is invalid', async () => {
    const response = await createDemoSessionRoute(
      new NextRequest('http://localhost/api/demo/session?caseId=E-7036!!!', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '10.3.0.2'
        }
      })
    )

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 404 when Pega does not have the requested case', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'pega-access-token', token_type: 'bearer', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        })
      )

    const response = await createDemoSessionRoute(
      new NextRequest('http://localhost/api/demo/session?caseId=E-999999', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '10.3.0.3'
        }
      })
    )

    expect(response.status).toBe(404)

    const body = (await response.json()) as { error: string }

    expect(body.error).toContain('E-999999')
  })

  it('returns 502 when Pega OAuth fails', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_client' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    )

    const response = await createDemoSessionRoute(
      new NextRequest('http://localhost/api/demo/session?caseId=E-7036', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '10.3.0.4'
        }
      })
    )

    expect(response.status).toBe(502)

    const body = (await response.json()) as { error: string }

    expect(body.error).toContain('OAuth')
  })

  it('returns 502 with a sanitized error when Pega case data is invalid', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'pega-access-token', token_type: 'bearer', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pyID: 7036,
            ExpenseRecords: []
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      )

    const response = await createDemoSessionRoute(
      new NextRequest('http://localhost/api/demo/session?caseId=E-7036', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '10.3.0.5'
        }
      })
    )

    expect(response.status).toBe(502)

    const body = (await response.json()) as { error: string }

    expect(body.error).toBe('Pega returned invalid case data.')
  })
})
