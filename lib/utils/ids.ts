import { randomBytes } from 'node:crypto'

function padSegment(value: number): string {
  return value.toString().padStart(2, '0')
}

export function createCaseId(date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = padSegment(date.getUTCMonth() + 1)
  const day = padSegment(date.getUTCDate())
  const hours = padSegment(date.getUTCHours())
  const minutes = padSegment(date.getUTCMinutes())
  const seconds = padSegment(date.getUTCSeconds())
  const randomSegment = randomBytes(4).toString('hex')

  return `CASE-${year}${month}${day}-${hours}${minutes}${seconds}-${randomSegment}`
}

export function createVoiceSessionId(date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = padSegment(date.getUTCMonth() + 1)
  const day = padSegment(date.getUTCDate())
  const hours = padSegment(date.getUTCHours())
  const minutes = padSegment(date.getUTCMinutes())
  const seconds = padSegment(date.getUTCSeconds())
  const randomSegment = randomBytes(4).toString('hex')

  return `PAMAI-SESSION-${year}${month}${day}-${hours}${minutes}${seconds}-${randomSegment}`
}