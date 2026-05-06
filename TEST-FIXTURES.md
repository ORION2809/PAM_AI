# Test Fixtures

The active domain model is PAMAI voice sessions, not telecom complaint cases.

## Preferred fixture shapes

### Voice session context

Use a compact session object with:

- `sessionId`
- `sessionStatus`
- `sessionState`
- masked customer fields
- one duplicate finding
- session metadata

### Completion payload

Include:

- `userDecision.decisionType`
- `userDecision.userExplanation`
- `duplicateGroupsReviewed`
- `agentSummary.recommendedNextAction`
- `technicalMetadata.idempotencyKey`

### Callback attempt

Include:

- `callbackStatus`
- `httpStatusCode`
- `attemptedAt`
- `retryCount`

## Current source of truth

The strongest fixture examples already live in:

- `tests/voiceSessionRepository.test.ts`
- `tests/voiceSessionFlow.test.ts`
- `tests/orbPresentation.test.ts`

If fixture reuse grows, extract shared builders from those tests instead of reviving the retired telecom case fixtures.