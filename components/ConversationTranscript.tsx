import type { TranscriptEntry } from '@/lib/schemas/voiceSession'

interface ConversationTranscriptProps {
  transcript: TranscriptEntry[]
  latestVoiceTranscript: string
}

function formatTimestamp(value: string): string {
  const date = new Date(value)

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getSpeakerLabel(speaker: TranscriptEntry['speaker']): string {
  if (speaker === 'agent') {
    return 'PAMAI'
  }

  if (speaker === 'user') {
    return 'Employee'
  }

  return 'System'
}

export function ConversationTranscript({ transcript, latestVoiceTranscript }: ConversationTranscriptProps) {
  return (
    <section className="panel transcript-panel">
      <h2>Conversation Log</h2>
      <p className="section-copy">
        The transcript is stored with the session so the demo can prove the clarification path and the outbound callback.
      </p>
      {latestVoiceTranscript ? <p className="helper-text">Latest voice transcript: “{latestVoiceTranscript}”</p> : null}
      <div className="transcript-list">
        {transcript.length === 0 ? (
          <div className="transcript-empty">The transcript will appear here once the session starts.</div>
        ) : (
          transcript.map((entry, index) => (
            <article key={`${entry.timestamp}-${index}`} className={`transcript-entry transcript-entry--${entry.speaker === 'agent' ? 'assistant' : entry.speaker}`}>
              <div className="transcript-meta">
                <span>{getSpeakerLabel(entry.speaker)}</span>
                <span>{formatTimestamp(entry.timestamp)}</span>
              </div>
              <div>{entry.text}</div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}