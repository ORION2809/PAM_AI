import { describe, expect, it } from 'vitest'

import { createSignedSessionToken, verifySignedSessionToken } from '@/lib/utils/sessionToken'

describe('sessionToken', () => {
  const secret = 'demo-session-secret'
  const expiresAt = '2026-05-08T18:30:00.000Z'

  it('creates a signed token that can be verified for the same session', () => {
    const token = createSignedSessionToken({
      sessionId: 'PAMAI-SESSION-9f8a12',
      expiresAt,
      secret
    })

    const verified = verifySignedSessionToken({
      token,
      sessionId: 'PAMAI-SESSION-9f8a12',
      secret,
      now: '2026-05-06T10:00:00.000Z'
    })

    expect(verified.sessionId).toBe('PAMAI-SESSION-9f8a12')
    expect(verified.expiresAt).toBe(expiresAt)
  })

  it('rejects a tampered token', () => {
    const token = createSignedSessionToken({
      sessionId: 'PAMAI-SESSION-9f8a12',
      expiresAt,
      secret
    })

    expect(() =>
      verifySignedSessionToken({
        token: `${token}tampered`,
        sessionId: 'PAMAI-SESSION-9f8a12',
        secret,
        now: '2026-05-06T10:00:00.000Z'
      })
    ).toThrow(/invalid session token/i)
  })

  it('rejects an expired token', () => {
    const token = createSignedSessionToken({
      sessionId: 'PAMAI-SESSION-9f8a12',
      expiresAt,
      secret
    })

    expect(() =>
      verifySignedSessionToken({
        token,
        sessionId: 'PAMAI-SESSION-9f8a12',
        secret,
        now: '2026-05-09T10:00:00.000Z'
      })
    ).toThrow(/expired/i)
  })
})