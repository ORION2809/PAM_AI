'use client'

import { startTransition, useEffect, useRef, useState } from 'react'

interface LaunchSessionPayload {
  sessionId: string
  requestedCaseId: string
  caseId: string
  caseReference: string
  conversationUrl: string
  expiresAt: string
}

interface PamaiLaunchpadProps {
  initialCaseId: string | null
}

export function PamaiLaunchpad({ initialCaseId }: PamaiLaunchpadProps) {
  const currentCaseId = initialCaseId?.trim() ?? ''
  const hasCaseId = currentCaseId.length > 0
  const [isCreating, setIsCreating] = useState<boolean>(false)
  const [errorText, setErrorText] = useState<string>('')
  const [launchPayload, setLaunchPayload] = useState<LaunchSessionPayload | null>(null)
  const requestSequenceRef = useRef<number>(0)
  const activeLaunchPayload = launchPayload?.caseId === currentCaseId ? launchPayload : null

  useEffect(() => {
    requestSequenceRef.current += 1
    setIsCreating(false)
    setErrorText('')
    setLaunchPayload(null)
  }, [currentCaseId])

  async function createPegaSession(): Promise<void> {
    if (!hasCaseId) {
      setErrorText('Add a case id to the URL before creating a secure voice session.')
      return
    }

    const requestId = requestSequenceRef.current + 1
    const requestedCaseId = currentCaseId

    requestSequenceRef.current = requestId
    setIsCreating(true)
    setErrorText('')
    setLaunchPayload(null)

    try {
      const response = await fetch(`/api/demo/session?caseId=${encodeURIComponent(requestedCaseId)}`, {
        method: 'POST'
      })
      const payload = (await response.json()) as Omit<LaunchSessionPayload, 'requestedCaseId'> & { error?: string }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not create the Pega-backed session.')
      }

      if (requestSequenceRef.current !== requestId) {
        return
      }

      startTransition(() => {
        setLaunchPayload({
          ...payload,
          requestedCaseId
        })
      })
      window.location.assign(payload.conversationUrl)
    } catch (error) {
      if (requestSequenceRef.current !== requestId) {
        return
      }

      setErrorText(error instanceof Error ? error.message : 'Could not create the Pega-backed session.')
    } finally {
      if (requestSequenceRef.current === requestId) {
        setIsCreating(false)
      }
    }
  }

  return (
    <main className="dashboard-shell">
      <div className="dashboard-frame launch-shell">
        <div className="topbar launch-topbar">
          <div className="topbar-copy">
            <span className="eyebrow">Pam AI x Pega</span>
            <h1 className="title">Duplicate Expense Clarification</h1>
            <p className="subtitle">
              This launchpad fetches the requested Pega case on the server, creates a secure Pam AI voice session, and
              opens the signed conversation link exactly the way the email flow would.
            </p>
          </div>
          <div className="provider-badge">
            <span>Voice UI</span>
            <strong>OpenAI voice + structured callback</strong>
          </div>
        </div>

        <div className="launch-grid">
          <section className="panel hero-panel launch-card">
            <div className="status-band">
              <small>Live Pega case</small>
              <strong>Launches the case id from the URL, for example `/case/E-9044` or `?caseId=E-9044`.</strong>
            </div>
            <div className="quick-stats">
              <div className="stat-card">
                <span>URL case</span>
                <strong>{hasCaseId ? currentCaseId : 'Required'}</strong>
              </div>
              <div className="stat-card">
                <span>Context source</span>
                <strong>Data view + email context</strong>
              </div>
              <div className="stat-card">
                <span>Access</span>
                <strong>verified email link</strong>
              </div>
            </div>
            <div className="launch-list-card">
              <h2>Session flow</h2>
              <ul className="launch-list">
                <li>The launch route exchanges OAuth2 client credentials with Pega on the server.</li>
                <li>Pam AI fetches the requested case id and builds secure session context from the data view.</li>
                <li>The emailed secure link opens directly into the duplicate-expense clarification.</li>
                <li>Pam AI stores the transcript, emits the structured result, and records callback delivery.</li>
              </ul>
            </div>
          </section>

          <section className="panel control-card launch-card">
            <h2>Open Pega Session</h2>
            <p className="section-copy">
              Use a production email link such as `/case/E-9044` or append `?caseId=E-9044`, then launch to create a
              signed URL under the `v1/voice-sessions` backend and redirect into the secure voice session page.
            </p>
            <div className="launch-actions">
              <button
                className="button button--primary button--wide"
                type="button"
                onClick={() => void createPegaSession()}
                disabled={isCreating || !hasCaseId}
              >
                {isCreating ? 'Creating secure session...' : hasCaseId ? `Create session for ${currentCaseId}` : 'Case id required'}
              </button>
            </div>
            {activeLaunchPayload ? (
              <div className="launch-result">
                <span>Latest session</span>
                <strong>{activeLaunchPayload.sessionId}</strong>
                <p>Resolved Pega case {activeLaunchPayload.caseReference}</p>
                <p>Expires at {new Date(activeLaunchPayload.expiresAt).toLocaleString()}</p>
              </div>
            ) : null}
            {errorText ? <p className="error-text">{errorText}</p> : null}
            {!hasCaseId ? (
              <p className="helper-text">
                This launchpad intentionally waits for a case id so the email link cannot accidentally open stale
                customer data.
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  )
}
