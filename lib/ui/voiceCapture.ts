const speechThreshold = 0.22
const silenceThreshold = 0.16
const minCaptureMs = 900
const silenceAfterSpeechMs = 1_350
const noSpeechTimeoutMs = 8_000
const maxCaptureMs = 15_000

export interface VoiceCaptureDecisionInput {
  audioLevel: number
  nowMs: number
  startedAtMs: number
  heardSpeech: boolean
  silenceStartedAtMs: number | null
}

export interface VoiceCaptureDecision {
  heardSpeech: boolean
  silenceStartedAtMs: number | null
  shouldStop: boolean
  reason: 'silence_after_speech' | 'no_speech_timeout' | 'max_capture_timeout' | null
}

export function getVoiceCaptureDecision(input: VoiceCaptureDecisionInput): VoiceCaptureDecision {
  const elapsedMs = input.nowMs - input.startedAtMs

  if (elapsedMs >= maxCaptureMs) {
    return {
      heardSpeech: input.heardSpeech,
      silenceStartedAtMs: input.silenceStartedAtMs,
      shouldStop: true,
      reason: 'max_capture_timeout'
    }
  }

  if (input.audioLevel >= speechThreshold) {
    return {
      heardSpeech: true,
      silenceStartedAtMs: null,
      shouldStop: false,
      reason: null
    }
  }

  if (!input.heardSpeech) {
    return {
      heardSpeech: false,
      silenceStartedAtMs: null,
      shouldStop: elapsedMs >= noSpeechTimeoutMs,
      reason: elapsedMs >= noSpeechTimeoutMs ? 'no_speech_timeout' : null
    }
  }

  if (elapsedMs < minCaptureMs || input.audioLevel > silenceThreshold) {
    return {
      heardSpeech: true,
      silenceStartedAtMs: null,
      shouldStop: false,
      reason: null
    }
  }

  const silenceStartedAtMs = input.silenceStartedAtMs ?? input.nowMs
  const silentForMs = input.nowMs - silenceStartedAtMs

  return {
    heardSpeech: true,
    silenceStartedAtMs,
    shouldStop: silentForMs >= silenceAfterSpeechMs,
    reason: silentForMs >= silenceAfterSpeechMs ? 'silence_after_speech' : null
  }
}
