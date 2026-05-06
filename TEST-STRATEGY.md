# Test Strategy

This repository now ships a PAMAI secure-session demo for duplicate-expense clarification. The test strategy should focus on the runtime that exists today.

## Priority matrix

| Priority | Surface | Test type | Why it matters |
|----------|---------|-----------|----------------|
| P0 | Session token signing | Unit | Prevents unauthorized access to a secure session |
| P0 | Voice session repository | Integration | Protects session, transcript, and callback persistence |
| P0 | Voice session flow | Unit | Owns the clarification workflow and completion decision |
| P1 | Session routes | Integration | Protects the public contract to the UI and Pega |
| P1 | Callback delivery | Integration | Protects final handoff behavior |
| P1 | Orb presentation | Unit | Keeps UI state aligned with backend state |
| P2 | Voice capture helpers | Unit | Protects the microphone interaction layer |
| P2 | Legacy retirement paths | Integration | Prevents the old telecom runtime from resurfacing |

## Minimum high-value suite

1. `tests/sessionToken.test.ts`
2. `tests/voiceSessionRepository.test.ts`
3. `tests/voiceSessionFlow.test.ts`
4. `tests/voiceSessionRoutes.test.ts`
5. `tests/orbPresentation.test.ts`
6. `tests/legacyRoutes.test.ts`
7. `tests/voiceCapture.test.ts`
8. `tests/textUtils.test.ts`

## Recommended next tests

Add failure-path or expansion coverage for:

- `POST /api/v1/voice-sessions/{sessionId}/turn/voice`
- invalid-token scenarios on the v1 routes
- expired-session scenarios on the v1 routes
- callback retry or failure handling

## Validation loop

```bash
npm test
npm run typecheck
npm run build
```

When behavior changes, update the narrowest relevant test first, get it green, and only then widen validation.