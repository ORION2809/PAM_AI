import { describe, expect, it } from 'vitest'

import { normalizeMobileNumber } from '@/lib/utils/text'

describe('normalizeMobileNumber', () => {
  it('extracts a 10-digit number from spoken digit words', () => {
    expect(normalizeMobileNumber('my number is nine eight seven six five four three two one zero')).toBe('9876543210')
  })

  it('keeps the last 10 digits when a country code is spoken first', () => {
    expect(normalizeMobileNumber('plus nine one nine eight seven six five four three two one zero')).toBe('9876543210')
  })
})
