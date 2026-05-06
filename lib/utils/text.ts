const spokenDigitMap = new Map<string, string>([
  ['zero', '0'],
  ['oh', '0'],
  ['o', '0'],
  ['one', '1'],
  ['two', '2'],
  ['three', '3'],
  ['four', '4'],
  ['five', '5'],
  ['six', '6'],
  ['seven', '7'],
  ['eight', '8'],
  ['nine', '9']
])

const repeatWordMap = new Map<string, number>([
  ['double', 2],
  ['triple', 3]
])

function resolveDigitToken(token: string): string | null {
  if (/^\d+$/.test(token)) {
    return token
  }

  return spokenDigitMap.get(token) ?? null
}

export function normalizeMobileNumber(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const digits: string[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const repeatCount = repeatWordMap.get(token)

    if (repeatCount) {
      const repeatedDigit = resolveDigitToken(tokens[index + 1] ?? '')

      if (repeatedDigit && repeatedDigit.length === 1) {
        digits.push(repeatedDigit.repeat(repeatCount))
        index += 1
        continue
      }
    }

    const resolvedDigit = resolveDigitToken(token)

    if (resolvedDigit) {
      digits.push(resolvedDigit)
    }
  }

  return digits.join('').slice(-10)
}

export function parseResolutionAnswer(input: string): boolean | null {
  const normalizedText = input.trim().toLowerCase()

  if (!normalizedText) {
    return null
  }

  if (/(^|\b)(yes|yeah|yep|resolved|fixed|working now|done)(\b|$)/.test(normalizedText)) {
    return true
  }

  if (/(^|\b)(no|not yet|still not|unresolved|not working|issue persists)(\b|$)/.test(normalizedText)) {
    return false
  }

  return null
}

export function buildNumberedSteps(steps: string[]): string {
  return steps.map((step, index) => `${index + 1}. ${step}`).join('\n')
}
