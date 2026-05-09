'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react'

import { ConversationTranscript } from '@/components/ConversationTranscript'
import { SessionSnapshot } from '@/components/SessionSnapshot'
import { VoiceOrb } from '@/components/VoiceOrb'
import type { PegaCallbackAttempt, VoiceSessionCompletion, VoiceSessionContext } from '@/lib/schemas/voiceSession'
import { getVoiceCaptureDecision } from '@/lib/ui/voiceCapture'
import { getPamaiOrbPresentation, isVoiceSessionFinalized, type PamaiOrbState } from '@/lib/ui/pamaiOrbPresentation'

interface PamaiVoiceConsoleProps {
  sessionId: string
}

interface VoiceOption {
  voiceId: string
  name: string
  description: string
  labels: Record<string, string>
}

interface AudioPayload {
  audioBase64: string
  mimeType: string
}

interface SessionPayload {
  session: VoiceSessionContext
  assistantText: string
  completion?: VoiceSessionCompletion | null
  callbackStatus?: PegaCallbackAttempt | null
  voices?: VoiceOption[]
  audio?: AudioPayload
  transcript?: string
  error?: string
}

const idleLevel = 0.12

interface VoiceCaptureTracker {
  startedAtMs: number
  heardSpeech: boolean
  silenceStartedAtMs: number | null
}

function getMicMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') {
    return undefined
  }

  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return 'audio/webm;codecs=opus'
  }

  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return 'audio/mp4'
  }

  return undefined
}

function getTokenHeaders(token: string): HeadersInit {
  return {
    'x-session-token': token
  }
}

function readTokenFromHash(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  const params = new URLSearchParams(hash)

  return params.get('token') ?? ''
}

export function PamaiVoiceConsole({ sessionId }: PamaiVoiceConsoleProps) {
  const [token, setToken] = useState<string>('')
  const [sessionData, setSessionData] = useState<VoiceSessionContext | null>(null)
  const [completion, setCompletion] = useState<VoiceSessionCompletion | null>(null)
  const [callbackStatus, setCallbackStatus] = useState<PegaCallbackAttempt | null>(null)
  const [voices, setVoices] = useState<VoiceOption[]>([])
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('')
  const [uiState, setUiState] = useState<PamaiOrbState>('booting')
  const [consoleOpen, setConsoleOpen] = useState<boolean>(false)
  const [audioLevel, setAudioLevel] = useState<number>(idleLevel)
  const [textInput, setTextInput] = useState<string>('')
  const [statusText, setStatusText] = useState<string>('Validating the secure session...')
  const [latestVoiceTranscript, setLatestVoiceTranscript] = useState<string>('')
  const [errorText, setErrorText] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const deferredTranscript = useDeferredValue(sessionData?.transcript ?? [])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const playbackRef = useRef<HTMLAudioElement | null>(null)
  const captureTrackerRef = useRef<VoiceCaptureTracker | null>(null)

  const sessionReady = Boolean(sessionData)
  const isRecording = uiState === 'listening'
  const sessionIsFinalized = isVoiceSessionFinalized(sessionData, completion)
  const canTriggerVoice =
    sessionReady && !isSubmitting && !sessionIsFinalized && uiState !== 'booting' && uiState !== 'thinking' && uiState !== 'speaking'
  const orbPresentation = getPamaiOrbPresentation({
    session: sessionData,
    completion,
    callbackStatus,
    runtimeState: uiState,
    audioLevel,
    isRecording,
    statusText,
    errorText
  })

  function resetAudioMeter(): void {
    setAudioLevel(idleLevel)
  }

  function cleanupMicrophoneResources(): void {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    analyserRef.current = null

    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    mediaRecorderRef.current = null
    mediaChunksRef.current = []
    captureTrackerRef.current = null
    resetAudioMeter()
  }

  function stopRecording(reason = 'manual'): void {
    const recorder = mediaRecorderRef.current

    if (!recorder) {
      return
    }

    setStatusText(reason === 'auto' ? 'Got it. Structuring the clarification...' : 'Finalizing audio capture...')

    if (recorder.state !== 'inactive') {
      recorder.stop()
    }
  }

  function sampleMicrophone(stream: MediaStream): void {
    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    const source = audioContext.createMediaStreamSource(stream)
    source.connect(analyser)

    audioContextRef.current = audioContext
    analyserRef.current = analyser

    const samples = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      if (!analyserRef.current) {
        return
      }

      analyserRef.current.getByteFrequencyData(samples)
      const average = samples.reduce((sum, value) => sum + value, 0) / samples.length
      const nextAudioLevel = Math.min(1, Math.max(0.12, average / 180))
      setAudioLevel(nextAudioLevel)

      if (captureTrackerRef.current && mediaRecorderRef.current?.state === 'recording') {
        const decision = getVoiceCaptureDecision({
          audioLevel: nextAudioLevel,
          nowMs: performance.now(),
          startedAtMs: captureTrackerRef.current.startedAtMs,
          heardSpeech: captureTrackerRef.current.heardSpeech,
          silenceStartedAtMs: captureTrackerRef.current.silenceStartedAtMs
        })

        captureTrackerRef.current = {
          startedAtMs: captureTrackerRef.current.startedAtMs,
          heardSpeech: decision.heardSpeech,
          silenceStartedAtMs: decision.silenceStartedAtMs
        }

        if (decision.shouldStop) {
          stopRecording('auto')
          return
        }
      }

      animationFrameRef.current = requestAnimationFrame(tick)
    }

    tick()
  }

  async function playAssistantAudio(audio?: AudioPayload): Promise<void> {
    if (!audio) {
      setUiState('idle')
      resetAudioMeter()
      return
    }

    const playback = new Audio(`data:${audio.mimeType};base64,${audio.audioBase64}`)
    playbackRef.current?.pause()
    playbackRef.current = playback
    setUiState('speaking')
    setAudioLevel(0.56)

    playback.onended = () => {
      setUiState('idle')
      resetAudioMeter()
    }

    playback.onerror = () => {
      setUiState('idle')
      resetAudioMeter()
    }

    try {
      await playback.play()
    } catch {
      setUiState('idle')
      resetAudioMeter()
    }
  }

  async function applySessionPayload(payload: SessionPayload): Promise<void> {
    startTransition(() => {
      setSessionData(payload.session)
      setCompletion(payload.completion ?? null)
      setCallbackStatus(payload.callbackStatus ?? null)
      setStatusText(payload.assistantText)
      setErrorText('')

      if (payload.voices && payload.voices.length > 0) {
        setVoices(payload.voices)
        if (!selectedVoiceId) {
          setSelectedVoiceId(payload.voices[0]?.voiceId ?? '')
        }
      }

      if (payload.transcript) {
        setLatestVoiceTranscript(payload.transcript)
      }
    })

    await playAssistantAudio(payload.audio)
  }

  async function startSession(preferredVoiceId?: string): Promise<void> {
    if (!token) {
      setUiState('error')
      setErrorText('The secure session token is missing from the link.')
      setStatusText('Open the session from the signed Pam AI link or regenerate a demo session.')
      return
    }

    setIsSubmitting(true)
    setUiState('booting')
    setStatusText('Loading the secure Pam AI session...')
    setLatestVoiceTranscript('')
    setErrorText('')

    try {
      const response = await fetch(`/api/v1/voice-sessions/${sessionId}/start`, {
        method: 'POST',
        headers: {
          ...getTokenHeaders(token),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          voiceId: preferredVoiceId ?? (selectedVoiceId || null)
        })
      })
      const payload = (await response.json()) as SessionPayload

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not load the secure voice session.')
      }

      await applySessionPayload(payload)
    } catch (error) {
      setUiState('error')
      setErrorText(error instanceof Error ? error.message : 'Could not load the secure session.')
      setStatusText('Secure session startup failed. Check the token and provider configuration.')
      resetAudioMeter()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitTextTurn(): Promise<void> {
    if (!sessionData || !textInput.trim() || !token) {
      return
    }

    const text = textInput.trim()
    setTextInput('')
    setIsSubmitting(true)
    setUiState('thinking')
    setStatusText('Normalizing the clarification and preparing the next Pam AI prompt...')
    setLatestVoiceTranscript('')
    setErrorText('')

    try {
      const response = await fetch(`/api/v1/voice-sessions/${sessionId}/turn/text`, {
        method: 'POST',
        headers: {
          ...getTokenHeaders(token),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          voiceId: selectedVoiceId || null
        })
      })
      const payload = (await response.json()) as SessionPayload

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not process the text turn.')
      }

      await applySessionPayload(payload)
    } catch (error) {
      setUiState('error')
      setErrorText(error instanceof Error ? error.message : 'Could not process the text turn.')
      setStatusText('The text fallback path failed. Retry the turn or regenerate the secure session.')
      resetAudioMeter()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitVoiceTurn(audioBlob: Blob): Promise<void> {
    if (!sessionData || !token) {
      return
    }

    setIsSubmitting(true)
    setUiState('thinking')
    setStatusText('Transcribing the voice turn and preparing the next clarification step...')
    setErrorText('')

    try {
      const formData = new FormData()
      const extension = audioBlob.type.includes('mp4') ? 'm4a' : 'webm'
      formData.append('audio', new File([audioBlob], `turn.${extension}`, { type: audioBlob.type || 'audio/webm' }))
      formData.append('voiceId', selectedVoiceId || '')

      const response = await fetch(`/api/v1/voice-sessions/${sessionId}/turn/voice`, {
        method: 'POST',
        headers: getTokenHeaders(token),
        body: formData
      })
      const payload = (await response.json()) as SessionPayload

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not process the voice turn.')
      }

      await applySessionPayload(payload)
    } catch (error) {
      setUiState('error')
      setErrorText(error instanceof Error ? error.message : 'Could not process the voice turn.')
      setStatusText('Voice capture failed. Use the text fallback or regenerate the secure link.')
      resetAudioMeter()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function beginRecording(): Promise<void> {
    if (!sessionReady || isSubmitting || sessionIsFinalized) {
      return
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setUiState('error')
      setErrorText('This browser does not support microphone capture. Use the text fallback input.')
      return
    }

    setErrorText('')
    setStatusText('Opening the microphone...')
    setUiState('listening')
    mediaChunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = getMicMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.onstart = () => {
        captureTrackerRef.current = {
          startedAtMs: performance.now(),
          heardSpeech: false,
          silenceStartedAtMs: null
        }
        sampleMicrophone(stream)
        setStatusText('Listening now. State whether the documents are duplicate, separate valid expenses, or need reupload.')
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current = [...mediaChunksRef.current, event.data]
        }
      }

      recorder.onerror = () => {
        cleanupMicrophoneResources()
        setUiState('error')
        setErrorText('Microphone capture failed during recording.')
      }

      recorder.onstop = async () => {
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        cleanupMicrophoneResources()

        if (blob.size === 0) {
          setUiState('idle')
          return
        }

        await submitVoiceTurn(blob)
      }

      recorder.start(250)
    } catch (error) {
      cleanupMicrophoneResources()
      setUiState('error')
      setErrorText(error instanceof Error ? error.message : 'Could not access the microphone.')
    }
  }

  function handleTextSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void submitTextTurn()
  }

  function handleVoiceSelection(event: ChangeEvent<HTMLSelectElement>): void {
    setSelectedVoiceId(event.target.value)
  }

  function handleOrbInteraction(): void {
    if (isRecording) {
      stopRecording()
      return
    }

    if (canTriggerVoice) {
      void beginRecording()
    }
  }

  useEffect(() => {
    const nextToken = readTokenFromHash()

    if (!nextToken) {
      setUiState('error')
      setErrorText('The secure session token is missing from the link.')
      setStatusText('Open the session from a signed Pam AI URL or regenerate a demo session from the launchpad.')
      return () => {
        cleanupMicrophoneResources()
        playbackRef.current?.pause()
      }
    }

    setToken(nextToken)

    return () => {
      cleanupMicrophoneResources()
      playbackRef.current?.pause()
    }
  }, [])

  useEffect(() => {
    if (!token) {
      return
    }

    void startSession()
  }, [token])

  return (
    <main className={`command-stage${consoleOpen ? ' command-stage--console-open' : ''}`}>
      <div className="command-stage__hud">
        <div className="hud-chip">
          <span>Pam AI</span>
          <span>Pega duplicate-expense clarification</span>
        </div>
        <button className="hud-button" type="button" onClick={() => setConsoleOpen((current) => !current)}>
          {consoleOpen ? 'Hide operator console' : 'Open operator console'}
        </button>
      </div>

      <section className="orb-landing">
        <div className="orb-landing__meta">
          <span className="orb-landing__eyebrow">Secure voice session</span>
          <span className="orb-landing__case">
            {sessionData?.caseReference ? `Case ${sessionData.caseReference}` : 'Validating secure link'}
          </span>
        </div>

        <button
          className={`orb-landing__trigger${canTriggerVoice || isRecording ? '' : ' orb-landing__trigger--disabled'}`}
          type="button"
          onClick={handleOrbInteraction}
          disabled={!canTriggerVoice && !isRecording}
          aria-label={isRecording ? 'Stop voice capture' : 'Start voice capture'}
          aria-pressed={isRecording}
        >
          <VoiceOrb
            state={orbPresentation.state}
            audioLevel={audioLevel}
            status={orbPresentation.status}
            title={orbPresentation.title}
            description={orbPresentation.description}
            detailLines={orbPresentation.detailLines}
          />
        </button>

        <div className="orb-landing__hint-block">
          <p className="orb-landing__hint">{orbPresentation.hint}</p>
          {latestVoiceTranscript ? <p className="orb-landing__transcript">Heard: {latestVoiceTranscript}</p> : null}
          {errorText ? <p className="error-text">{errorText}</p> : null}
        </div>
      </section>

      <AnimatePresence>
        {consoleOpen ? (
          <motion.aside
            className="console-sheet"
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 48 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <div className="console-sheet__header">
              <div>
                <h2 className="console-sheet__title">Operator Console</h2>
                <p className="console-sheet__subtitle">
                  Voice controls, text fallback, session telemetry, transcript review, and callback status live here.
                </p>
              </div>
              <button className="hud-button hud-button--ghost" type="button" onClick={() => setConsoleOpen(false)}>
                Close
              </button>
            </div>

            <div className="console-sheet__body">
              <section className="panel control-card console-card">
                <h2>Direct Control</h2>
                <p className="section-copy">
                  The landing stays orb-first. This console exposes the operational surface only when you ask for it.
                </p>
                <div className="console-card__stats">
                  <div className="stat-card">
                    <span>Case reference</span>
                    <strong>{sessionData?.caseReference ?? 'Pending session'}</strong>
                  </div>
                  <div className="stat-card">
                    <span>Session status</span>
                    <strong>{sessionData?.sessionStatus ?? 'BOOTING'}</strong>
                  </div>
                  <div className="stat-card">
                    <span>Callback</span>
                    <strong>{callbackStatus?.callbackStatus ?? 'PENDING'}</strong>
                  </div>
                </div>

                <div className="form-grid">
                  <label className="label">
                    OpenAI voice
                    <select className="select-input" value={selectedVoiceId} onChange={handleVoiceSelection}>
                      {voices.length === 0 ? <option value="">Loading voices...</option> : null}
                      {voices.map((voice) => (
                        <option key={voice.voiceId} value={voice.voiceId}>
                          {voice.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="action-row">
                    <button
                      className="button button--secondary button--wide"
                      type="button"
                      onClick={() => void startSession(selectedVoiceId)}
                      disabled={isSubmitting}
                    >
                      Replay assistant prompt
                    </button>
                    <button
                      className={`button ${isRecording ? 'button--danger' : 'button--primary'} button--wide`}
                      type="button"
                      onClick={isRecording ? () => stopRecording() : () => void beginRecording()}
                      disabled={!canTriggerVoice && !isRecording}
                    >
                      {isRecording ? 'Stop voice capture' : 'Start voice capture'}
                    </button>
                  </div>

                  <form className="form-grid" onSubmit={handleTextSubmit}>
                    <label className="label">
                      Direct clarification fallback
                      <input
                        className="text-input"
                        value={textInput}
                        onChange={(event) => setTextInput(event.target.value)}
                        placeholder="Type the user clarification here"
                        disabled={!sessionReady || isSubmitting || sessionIsFinalized}
                      />
                    </label>
                    <div className="action-row">
                      <button
                        className="button button--secondary button--wide"
                        type="submit"
                        disabled={!sessionReady || isSubmitting || sessionIsFinalized || !textInput.trim()}
                      >
                        Send text turn
                      </button>
                    </div>
                  </form>

                  <div className="action-row">
                    <button className="button button--secondary button--wide" type="button" onClick={() => window.location.assign('/')}>
                      Return to launchpad
                    </button>
                  </div>
                </div>
              </section>

              <div className="console-sheet__grid">
                <SessionSnapshot session={sessionData} completion={completion} callbackStatus={callbackStatus} />
                <ConversationTranscript transcript={deferredTranscript} latestVoiceTranscript={latestVoiceTranscript} />
              </div>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </main>
  )
}
