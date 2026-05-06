import { describe, expect, it } from 'vitest'

import { getVoiceCaptureDecision } from '@/lib/ui/voiceCapture'

describe('getVoiceCaptureDecision', () => {
  it('keeps recording while speech is active', () => {
    const decision = getVoiceCaptureDecision({
      audioLevel: 0.35,
      nowMs: 2_000,
      startedAtMs: 1_000,
      heardSpeech: false,
      silenceStartedAtMs: null
    })

    expect(decision.heardSpeech).toBe(true)
    expect(decision.silenceStartedAtMs).toBeNull()
    expect(decision.shouldStop).toBe(false)
  })

  it('stops after speech is followed by enough silence', () => {
    const decision = getVoiceCaptureDecision({
      audioLevel: 0.12,
      nowMs: 4_600,
      startedAtMs: 1_000,
      heardSpeech: true,
      silenceStartedAtMs: 3_000
    })

    expect(decision.shouldStop).toBe(true)
    expect(decision.reason).toBe('silence_after_speech')
  })

  it('does not stop before the minimum capture window completes', () => {
    const decision = getVoiceCaptureDecision({
      audioLevel: 0.12,
      nowMs: 1_500,
      startedAtMs: 1_000,
      heardSpeech: true,
      silenceStartedAtMs: 1_100
    })

    expect(decision.shouldStop).toBe(false)
  })
})
