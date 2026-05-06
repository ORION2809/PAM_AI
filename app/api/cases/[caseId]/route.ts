import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> }
): Promise<NextResponse> {
  const { caseId } = await context.params

  if (!/^[A-Za-z0-9_-]+$/.test(caseId)) {
    return NextResponse.json({ error: 'Invalid case identifier.' }, { status: 400 })
  }

  return NextResponse.json(
    {
      error: 'Legacy telecom case retrieval is retired.',
      migration: {
        message: 'Use the PAMAI voice-session APIs instead.',
        createSessionEndpoint: '/api/v1/voice-sessions',
        demoLaunchEndpoint: '/api/demo/session'
      }
    },
    { status: 410 }
  )
}