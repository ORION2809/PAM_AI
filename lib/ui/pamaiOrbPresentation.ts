import type { PegaCallbackAttempt, VoiceSessionCompletion, VoiceSessionContext } from '@/lib/schemas/voiceSession'

export type PamaiOrbState =
  | 'booting'
  | 'idle'
  | 'listening'
  | 'user-speaking'
  | 'thinking'
  | 'speaking'
  | 'confirmation'
  | 'resolved'
  | 'escalated'
  | 'error'

export function isVoiceSessionFinalized(
  session: VoiceSessionContext | null,
  completion: VoiceSessionCompletion | null
): boolean {
  return Boolean(completion) || session?.sessionStatus === 'COMPLETED' || session?.sessionStatus === 'SESSION_EXPIRED'
}

function getLatestStatus(statusText: string, fallback: string): string {
  return statusText.trim() || fallback
}

export function getPamaiOrbPresentation(input: {
  session: VoiceSessionContext | null
  completion: VoiceSessionCompletion | null
  callbackStatus: PegaCallbackAttempt | null
  runtimeState: PamaiOrbState
  audioLevel: number
  isRecording: boolean
  statusText: string
  errorText: string
}): {
  state: PamaiOrbState
  status: string
  title: string
  description: string
  detailLines: string[]
  hint: string
} {
  if (input.runtimeState === 'error' || input.callbackStatus?.callbackStatus === 'FAILED') {
    return {
      state: 'error',
      status: 'CALLBACK ALERT',
      title: 'The secure session needs attention',
      description: input.errorText || input.statusText || 'The session reached a result, but the callback path still needs review.',
      detailLines: ['CHECK TOKEN VALIDITY...', 'VERIFY CALLBACK TARGET...'],
      hint: 'Use the operator console to inspect the callback status and transcript.'
    }
  }

  if (input.runtimeState === 'booting') {
    return {
      state: 'booting',
      status: 'LOADING SESSION',
      title: 'Validating the secure PAMAI link',
      description: 'Checking token integrity, loading duplicate findings, and preparing the voice channel.',
      detailLines: ['VERIFYING SESSION TOKEN...', 'LOADING DUPLICATE CONTEXT...'],
      hint: 'The orb will activate as soon as the secure session is ready.'
    }
  }

  if (input.runtimeState === 'speaking') {
    return {
      state: 'speaking',
      status: 'AGENT SPEAKING',
      title: input.session ? `PAMAI speaking to ${input.session.customer.fullName}` : 'Delivering the session guidance',
      description: input.statusText,
      detailLines: [],
      hint: 'The current assistant response is being played through ElevenLabs TTS.'
    }
  }

  if (input.runtimeState === 'thinking') {
    return {
      state: 'thinking',
      status: 'STRUCTURING RESPONSE',
      title: 'Interpreting the clarification safely',
      description:
        input.completion?.agentSummary.summary ||
        input.session?.duplicateFindings[0]?.reason ||
        'PAMAI is deciding how to classify the user response without making policy decisions.',
      detailLines: ['MATCHING USER DECISION...', 'PREPARING PEGA HANDOFF...'],
      hint: 'The backend state machine owns the flow while the response is normalized.'
    }
  }

  if (input.isRecording) {
    return {
      state: input.audioLevel > 0.22 ? 'user-speaking' : 'listening',
      status: input.audioLevel > 0.22 ? 'USER SPEAKING' : 'LISTENING',
      title: input.audioLevel > 0.22 ? 'Capturing the live clarification' : 'Waiting for the next spoken turn',
      description: getLatestStatus(input.statusText, 'PAMAI is listening for the user response.'),
      detailLines: [],
      hint: 'Stop speaking and the turn will submit automatically. You can also tap again to finish.'
    }
  }

  if (input.completion || input.session?.sessionStatus === 'COMPLETED') {
    return {
      state: 'resolved',
      status: 'SUBMITTED',
      title: 'Clarification package prepared',
      description:
        input.statusText || input.completion?.agentSummary.summary || 'The structured result has been recorded for Pega.',
      detailLines: input.callbackStatus?.callbackStatus ? [`CALLBACK ${input.callbackStatus.callbackStatus}`] : [],
      hint: 'Open the console to review the transcript, final decision, and callback status.'
    }
  }

  if (input.session?.sessionState === 'CONFIRM_FINAL_ANSWER') {
    return {
      state: 'confirmation',
      status: 'FINAL CONFIRMATION',
      title: 'Waiting for submission approval',
      description: getLatestStatus(input.statusText, 'PAMAI is waiting for the final yes or no before sending the clarification.'),
      detailLines: [],
      hint: 'Answer yes to submit the clarification or no to restate it.'
    }
  }

  return {
    state: 'idle',
    status: 'STANDING BY',
    title: input.session ? `Secure session for ${input.session.customer.fullName}` : 'Awaiting secure session',
    description: getLatestStatus(
      input.statusText,
      input.session?.duplicateFindings[0]?.reason || 'Tap the orb to begin the next PAMAI voice turn.'
    ),
    detailLines: input.session?.caseReference ? [`CASE ${input.session.caseReference}`] : [],
    hint: 'Tap the orb to capture the next voice turn or open the console for the text fallback.'
  }
}