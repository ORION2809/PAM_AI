'use client'

import { motion } from 'framer-motion'
import { useMemo } from 'react'

import type { PamaiOrbState } from '@/lib/ui/pamaiOrbPresentation'

export type OrbState = PamaiOrbState

interface VoiceOrbProps {
  state: OrbState
  audioLevel: number
  status: string
  title: string
  description: string
  detailLines?: string[]
}

const sparkPositions = [
  { left: 16, top: 27, size: 2.2 },
  { left: 24, top: 19, size: 1.8 },
  { left: 28, top: 76, size: 2 },
  { left: 38, top: 15, size: 1.7 },
  { left: 43, top: 84, size: 1.8 },
  { left: 56, top: 11, size: 2.2 },
  { left: 67, top: 84, size: 1.9 },
  { left: 73, top: 18, size: 1.7 },
  { left: 82, top: 68, size: 2.1 },
  { left: 87, top: 32, size: 2.4 },
  { left: 88, top: 53, size: 1.7 },
  { left: 54, top: 88, size: 1.8 }
] as const

const satellitePositions = [
  { left: 16, top: 29, size: 11 },
  { left: 82, top: 71, size: 14 },
  { left: 74, top: 22, size: 8 }
] as const

function getPulseLevel(state: OrbState, audioLevel: number): number {
  switch (state) {
    case 'booting':
      return 0.18
    case 'idle':
      return 0.12
    case 'listening':
      return 0.17
    case 'user-speaking':
      return Math.max(audioLevel, 0.26)
    case 'thinking':
      return 0.28
    case 'speaking':
      return 0.34
    case 'confirmation':
      return 0.16
    case 'resolved':
      return 0.18
    case 'escalated':
      return 0.24
    case 'error':
      return 0.22
  }

  return 0.12
}

function createWaveformBars(state: OrbState, audioLevel: number): number[] {
  const pulseLevel = getPulseLevel(state, audioLevel)
  const stateBoost =
    state === 'speaking'
      ? 1.08
      : state === 'thinking'
        ? 0.72
        : state === 'user-speaking'
          ? 0.92
          : state === 'escalated' || state === 'error'
            ? 0.7
            : 0.28

  return Array.from({ length: 12 }, (_, index) => {
    const midpoint = 5.5
    const distance = Math.abs(index - midpoint)
    const falloff = 1 - distance / (midpoint + 1)
    const contour = 0.42 + ((index % 5) + 1) / 9

    return 5 + pulseLevel * 30 * stateBoost * falloff * contour
  })
}

function getOrbitDuration(state: OrbState, offset = 0): number {
  const baseDuration =
    state === 'thinking'
      ? 13
      : state === 'speaking'
        ? 16
        : state === 'user-speaking'
          ? 12
          : state === 'escalated' || state === 'error'
            ? 11
            : 19

  return baseDuration + offset
}

function getSparkAnimation(
  state: OrbState,
  spark: (typeof sparkPositions)[number],
  pulseLevel: number
): {
  x: number[]
  y: number[]
  opacity: number[]
  scale: number[]
} {
  const orbitX = (spark.top - 50) * 0.18
  const orbitY = (50 - spark.left) * 0.18
  const pulseX = (50 - spark.left) * (0.16 + pulseLevel * 0.18)
  const pulseY = (50 - spark.top) * (0.16 + pulseLevel * 0.18)

  switch (state) {
    case 'user-speaking':
      return {
        x: [0, pulseX, 0],
        y: [0, pulseY, 0],
        opacity: [0.16, 0.92, 0.2],
        scale: [0.9, 1.4, 0.94]
      }
    case 'speaking':
      return {
        x: [0, -pulseX * 0.84, 0],
        y: [0, -pulseY * 0.84, 0],
        opacity: [0.2, 0.82, 0.24],
        scale: [0.92, 1.3, 0.96]
      }
    case 'thinking':
      return {
        x: [0, orbitX, 0],
        y: [0, orbitY, 0],
        opacity: [0.08, 0.48, 0.12],
        scale: [0.8, 1.12, 0.84]
      }
    case 'escalated':
    case 'error':
      return {
        x: [0, orbitX * 0.42, -orbitX * 0.24, 0],
        y: [0, orbitY * 0.42, -orbitY * 0.24, 0],
        opacity: [0.1, 0.72, 0.12],
        scale: [0.84, 1.24, 0.88]
      }
    default:
      return {
        x: [0, orbitX * 0.46, 0],
        y: [0, orbitY * 0.46, 0],
        opacity: [0.06, 0.24, 0.08],
        scale: [0.84, 1, 0.84]
      }
  }
}

function getSatelliteAnimation(
  state: OrbState,
  satellite: (typeof satellitePositions)[number],
  pulseLevel: number
): {
  x: number[]
  y: number[]
  scale: number[]
  opacity: number[]
} {
  const driftX = (satellite.left - 50) * (0.03 + pulseLevel * 0.05)
  const driftY = (satellite.top - 50) * (0.03 + pulseLevel * 0.05)
  const surge = state === 'user-speaking' || state === 'speaking' ? 1.2 : 1

  return {
    x: [0, driftX * surge, 0],
    y: [0, driftY * surge, 0],
    scale: [1, 1.08 + pulseLevel * 0.14, 1],
    opacity: [0.64, 0.96, 0.64]
  }
}

export function VoiceOrb({ state, audioLevel, status, title, description, detailLines = [] }: VoiceOrbProps) {
  const pulseLevel = useMemo(() => getPulseLevel(state, audioLevel), [state, audioLevel])
  const waveformHeights = useMemo(() => createWaveformBars(state, audioLevel), [state, audioLevel])
  const visibleSparks = useMemo(
    () =>
      state === 'booting' || state === 'idle' || state === 'confirmation' || state === 'resolved'
        ? sparkPositions.slice(0, 7)
        : sparkPositions,
    [state]
  )
  const visibleSatellites = useMemo(
    () => (state === 'booting' || state === 'idle' ? satellitePositions.slice(0, 2) : satellitePositions),
    [state]
  )

  return (
    <div className={`orb-shell orb-shell--${state}`}>
      <div className="plasma-panel">
        <div className="plasma-panel__header" aria-hidden="true">
          <div className="plasma-panel__tag">
            <span className="plasma-panel__index">02</span>
            <span className="plasma-panel__label">PLASMA FLOW</span>
          </div>
          <div className="plasma-panel__menu">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="plasma-panel__field">
          <div className="plasma-panel__aura" />
          <div className="plasma-panel__grid" />
          <motion.div
            className="plasma-orbit plasma-orbit--a"
            animate={{ rotate: [-4, 3, -4], scale: [1, 1.008 + pulseLevel * 0.02, 1] }}
            transition={{ duration: getOrbitDuration(state, 3), repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
          />
          <motion.div
            className="plasma-orbit plasma-orbit--b"
            animate={{ rotate: [16, 23, 16], scale: [1, 1.01 + pulseLevel * 0.03, 1] }}
            transition={{ duration: getOrbitDuration(state, 0), repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
          />
          <motion.div
            className="plasma-orbit plasma-orbit--c"
            animate={{ rotate: [-22, -30, -22], scale: [1, 1.008 + pulseLevel * 0.02, 1] }}
            transition={{ duration: getOrbitDuration(state, 5), repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
          />
          <motion.div
            className="plasma-orbit plasma-orbit--d"
            animate={{ rotate: [30, 36, 30], scale: [1, 1.01 + pulseLevel * 0.02, 1] }}
            transition={{ duration: getOrbitDuration(state, 2), repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
          />
          <div className="plasma-particles" aria-hidden="true">
            {visibleSparks.map((spark, index) => (
              <motion.span
                key={`${spark.left}-${spark.top}`}
                className="plasma-particle"
                style={{ left: `${spark.left}%`, top: `${spark.top}%`, width: `${spark.size}px`, height: `${spark.size}px` }}
                animate={getSparkAnimation(state, spark, pulseLevel)}
                transition={{
                  duration: 3.2 + index * 0.24,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut'
                }}
              />
            ))}
          </div>
          <div className="plasma-satellites" aria-hidden="true">
            {visibleSatellites.map((satellite, index) => (
              <motion.span
                key={`${satellite.left}-${satellite.top}`}
                className="plasma-satellite"
                style={{
                  left: `${satellite.left}%`,
                  top: `${satellite.top}%`,
                  width: `${satellite.size}px`,
                  height: `${satellite.size}px`
                }}
                animate={getSatelliteAnimation(state, satellite, pulseLevel)}
                transition={{
                  duration: 4.8 + index * 0.6,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut'
                }}
              />
            ))}
          </div>
          <motion.div
            className="plasma-core"
            animate={{
              scale: [1, 1.02 + pulseLevel * 0.08, 1],
              opacity: [0.96, 1, 0.96],
              y: state === 'idle' || state === 'confirmation' ? [-2, 2, -2] : [0, 0, 0]
            }}
            transition={{ duration: 3.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
          >
            <div className="plasma-core__halo" />
            <div className="plasma-core__shell" />
            <div className="plasma-core__membrane plasma-core__membrane--outer" />
            <div className="plasma-core__membrane plasma-core__membrane--inner" />
            <motion.div
              className="plasma-core__swirl plasma-core__swirl--a"
              animate={{ rotate: [0, 360], scale: [1, 1.02 + pulseLevel * 0.03, 1] }}
              transition={{ duration: getOrbitDuration(state, 6), repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
            />
            <motion.div
              className="plasma-core__swirl plasma-core__swirl--b"
              animate={{ rotate: [360, 0], scale: [0.96, 1, 0.96] }}
              transition={{ duration: getOrbitDuration(state, 2), repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
            />
            <motion.div
              className="plasma-core__rings"
              animate={{ scale: [0.96, 1.03 + pulseLevel * 0.04, 0.96], opacity: [0.4, 0.72, 0.4] }}
              transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            />
            <motion.div
              className="plasma-core__sheen"
              animate={{ opacity: [0.28, 0.48, 0.28], y: [-4, 3, -4] }}
              transition={{ duration: 2.8, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            />
            <motion.div
              className="plasma-core__center"
              animate={{ scale: [1, 1.16 + pulseLevel * 0.12, 1], opacity: [0.82, 1, 0.82] }}
              transition={{ duration: 1.9, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            />
          </motion.div>
        </div>
        <div className="plasma-panel__footer" aria-hidden="true">
          <div className="plasma-panel__footer-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="plasma-panel__waveform">
            {waveformHeights.map((height, index) => (
              <motion.i
                key={`footer-${state}-${index}`}
                className="plasma-panel__waveform-bar"
                animate={{ height: [Math.max(2, height * 0.5), height, Math.max(3, height * 0.72)] }}
                transition={{
                  duration: 0.9 + index * 0.05,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut'
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="orb-hud">
        <span className="orb-hud__status">{status}</span>
        <strong className="orb-hud__title">{title}</strong>
        <p className="orb-hud__description">{description}</p>
        {detailLines.length > 0 ? (
          <div className="orb-hud__telemetry">
            {detailLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
