'use client'

import { startTransition, useState } from 'react'

interface DemoSessionPayload {
  sessionId: string
  conversationUrl: string
  expiresAt: string
}

export function PamaiLaunchpad() {
  const [isCreating, setIsCreating] = useState<boolean>(false)
  const [errorText, setErrorText] = useState<string>('')
  const [launchPayload, setLaunchPayload] = useState<DemoSessionPayload | null>(null)

  async function createDemoSession(): Promise<void> {
    setIsCreating(true)
    setErrorText('')

    try {
      const response = await fetch('/api/demo/session', {
        method: 'POST'
      })
      const payload = (await response.json()) as DemoSessionPayload & { error?: string }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not create the demo session.')
      }

      startTransition(() => {
        setLaunchPayload(payload)
      })
      window.location.assign(payload.conversationUrl)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Could not create the demo session.')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <main className="dashboard-shell">
      <div className="dashboard-frame launch-shell">
        <div className="topbar launch-topbar">
          <div className="topbar-copy">
            <span className="eyebrow">PAMAI x Pega</span>
            <h1 className="title">Duplicate Expense Clarification</h1>
            <p className="subtitle">
              This launchpad creates a secure PAMAI voice session from a demo Pega payload, then opens the signed
              conversation link exactly the way the email flow would.
            </p>
          </div>
          <div className="provider-badge">
            <span>Voice UI</span>
            <strong>ElevenLabs + structured callback</strong>
          </div>
        </div>

        <div className="launch-grid">
          <section className="panel hero-panel launch-card">
            <div className="status-band">
              <small>Demo scenario</small>
              <strong>Uber receipt pair flagged as a likely duplicate on the same date and amount.</strong>
            </div>
            <div className="quick-stats">
              <div className="stat-card">
                <span>Pega case</span>
                <strong>EXP-10293</strong>
              </div>
              <div className="stat-card">
                <span>Duplicate groups</span>
                <strong>1 active group</strong>
              </div>
              <div className="stat-card">
                <span>Callback mode</span>
                <strong>Mocked delivery</strong>
              </div>
            </div>
            <div className="launch-list-card">
              <h2>Session flow</h2>
              <ul className="launch-list">
                <li>Pega creates a secure session and email link.</li>
                <li>PAMAI verifies the user with the last four mobile digits.</li>
                <li>The orb explains the duplicate finding and captures the clarification.</li>
                <li>PAMAI stores the transcript, emits the structured result, and records callback delivery.</li>
              </ul>
            </div>
          </section>

          <section className="panel control-card launch-card">
            <h2>Open Demo Session</h2>
            <p className="section-copy">
              Launching the demo will create a signed URL under the new `v1/voice-sessions` backend and redirect you
              into the secure voice session page.
            </p>
            <div className="launch-actions">
              <button className="button button--primary button--wide" type="button" onClick={() => void createDemoSession()} disabled={isCreating}>
                {isCreating ? 'Creating secure session...' : 'Create demo session'}
              </button>
            </div>
            {launchPayload ? (
              <div className="launch-result">
                <span>Latest session</span>
                <strong>{launchPayload.sessionId}</strong>
                <p>Expires at {new Date(launchPayload.expiresAt).toLocaleString()}</p>
              </div>
            ) : null}
            {errorText ? <p className="error-text">{errorText}</p> : null}
          </section>
        </div>
      </div>
    </main>
  )
}