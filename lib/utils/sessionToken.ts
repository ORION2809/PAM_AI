import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const tokenVersion = 'v1'

interface SessionTokenPayload {
  sessionId: string
  expiresAt: string
}

function encodePayload(payload: SessionTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodePayload(payload: string): SessionTokenPayload {
  const decoded = Buffer.from(payload, 'base64url').toString('utf8')
  return JSON.parse(decoded) as SessionTokenPayload
}

function createSignature(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url')
}

function assertIsoTimestamp(value: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error('Invalid session token payload.')
  }
}

export function createSignedSessionToken(input: {
  sessionId: string
  expiresAt: string
  secret: string
}): string {
  assertIsoTimestamp(input.expiresAt)
  const payload = encodePayload({
    sessionId: input.sessionId,
    expiresAt: input.expiresAt
  })
  const body = `${tokenVersion}.${payload}`
  const signature = createSignature(body, input.secret)

  return `${body}.${signature}`
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verifySignedSessionToken(input: {
  token: string
  sessionId: string
  secret: string
  now?: string
}): SessionTokenPayload {
  const parts = input.token.split('.')

  if (parts.length !== 3 || parts[0] !== tokenVersion) {
    throw new Error('Invalid session token.')
  }

  const [version, payload, signature] = parts
  const body = `${version}.${payload}`
  const expectedSignature = createSignature(body, input.secret)
  const providedSignatureBuffer = Buffer.from(signature)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  if (
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error('Invalid session token.')
  }

  const decodedPayload = decodePayload(payload)
  assertIsoTimestamp(decodedPayload.expiresAt)

  if (decodedPayload.sessionId !== input.sessionId) {
    throw new Error('Invalid session token.')
  }

  const now = input.now ?? new Date().toISOString()
  assertIsoTimestamp(now)

  if (Date.parse(now) > Date.parse(decodedPayload.expiresAt)) {
    throw new Error('Session token has expired.')
  }

  return decodedPayload
}