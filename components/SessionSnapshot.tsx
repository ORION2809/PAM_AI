import type { PegaCallbackAttempt, VoiceSessionCompletion, VoiceSessionContext } from '@/lib/schemas/voiceSession'

interface SessionSnapshotProps {
  session: VoiceSessionContext | null
  completion: VoiceSessionCompletion | null
  callbackStatus: PegaCallbackAttempt | null
}

function getTone(session: VoiceSessionContext | null, callbackStatus: PegaCallbackAttempt | null): 'success' | 'warning' | 'danger' {
  if (!session) {
    return 'warning'
  }

  if (callbackStatus?.callbackStatus === 'FAILED') {
    return 'danger'
  }

  if (session.sessionStatus === 'COMPLETED') {
    return 'success'
  }

  return 'warning'
}

export function SessionSnapshot({ session, completion, callbackStatus }: SessionSnapshotProps) {
  const tone = getTone(session, callbackStatus)
  const primaryFinding = session?.duplicateFindings[0]

  return (
    <section className="panel case-panel">
      <h2>Session Snapshot</h2>
      <p className="section-copy">
        Pega stays the system of record. This panel reflects only the secure PAMAI session context, transcript state,
        and callback outcome.
      </p>
      <div className="case-grid">
        <div className="pill-row">
          <span className={`pill pill--${tone}`}>Status: {session?.sessionStatus ?? 'BOOTING'}</span>
          <span className="pill">State: {session?.sessionState ?? 'SESSION_LOADING'}</span>
        </div>
        <article className="info-card">
          <span>Case</span>
          <strong>{session?.caseReference ?? 'Awaiting secure session'}</strong>
          <p>{session?.caseId ?? 'No case bound yet'}</p>
          <p>Assignment {session?.assignmentId ?? 'Pending'}</p>
        </article>
        <article className="info-card">
          <span>User</span>
          {session ? (
            <>
              <strong>{session.customer.fullName}</strong>
              <p>{session.customer.emailMasked}</p>
              <p>Mobile ending {session.customer.mobileLastFour}</p>
            </>
          ) : (
            <p>Secure user context not loaded yet.</p>
          )}
        </article>
        <article className="info-card">
          <span>Duplicate Finding</span>
          {primaryFinding ? (
            <>
              <strong>{primaryFinding.expenseRecords[0]?.merchant ?? 'Expense record'}</strong>
              <p>{primaryFinding.reason}</p>
              <p>
                {primaryFinding.expenseRecords.length} documents · confidence {(primaryFinding.confidence * 100).toFixed(0)}%
              </p>
            </>
          ) : (
            <p>No duplicate group has been loaded yet.</p>
          )}
        </article>
        <article className="info-card">
          <span>Current Routing</span>
          <strong>{session?.currentStage ?? 'Pending stage'}</strong>
          <p>{session?.currentStep ?? 'Pending step'}</p>
        </article>
        <article className="info-card">
          <span>Decision</span>
          {completion ? (
            <>
              <strong>{completion.userDecision.decisionType}</strong>
              <p>{completion.userDecision.userExplanation}</p>
            </>
          ) : (
            <p>The final clarification will appear here once the user confirms the outcome.</p>
          )}
        </article>
        <article className="info-card">
          <span>Pega Callback</span>
          <strong>{callbackStatus?.callbackStatus ?? 'PENDING'}</strong>
          <p>{callbackStatus?.httpStatusCode ? `HTTP ${callbackStatus.httpStatusCode}` : 'No callback attempt yet.'}</p>
          {completion ? <p>{completion.agentSummary.recommendedNextAction}</p> : null}
        </article>
      </div>
    </section>
  )
}