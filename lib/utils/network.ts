import type { NextRequest } from 'next/server'

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20_000
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs)
  })
}

function getFirstForwardedValue(value: string | null): string | null {
  if (!value) {
    return null
  }

  const firstValue = value.split(',')[0]?.trim()
  return firstValue ? firstValue : null
}

export function getPublicRequestOrigin(request: NextRequest, appBaseUrl: string): string {
  const forwardedHost = getFirstForwardedValue(request.headers.get('x-forwarded-host'))

  if (!forwardedHost) {
    return request.nextUrl.origin
  }

  const configuredBaseUrl = new URL(appBaseUrl)
  const normalizedForwardedHost = forwardedHost.toLowerCase()
  const normalizedConfiguredHost = configuredBaseUrl.host.toLowerCase()

  if (normalizedForwardedHost !== normalizedConfiguredHost) {
    return configuredBaseUrl.origin
  }

  const forwardedProtocol = getFirstForwardedValue(request.headers.get('x-forwarded-proto'))
  const normalizedForwardedProtocol = forwardedProtocol?.toLowerCase()
  const protocol =
    normalizedForwardedProtocol === 'http' || normalizedForwardedProtocol === 'https'
      ? normalizedForwardedProtocol
      : configuredBaseUrl.protocol.replace(/:$/, '')

  return `${protocol}://${forwardedHost}`
}