# PAMAI TDD Summary

The test strategy now protects the active PAMAI runtime rather than the retired telecom complaint workflow.

## Current high-value coverage

- `tests/sessionToken.test.ts` validates signed secure-link tokens.
- `tests/voiceSessionRepository.test.ts` validates SQLite persistence and audit export.
- `tests/voiceSessionFlow.test.ts` validates identity check, clarification, and completion decisions.
- `tests/voiceSessionRoutes.test.ts` validates the active create, get, start, text-turn, and callback-status routes.
- `tests/orbPresentation.test.ts` validates the live PAMAI orb states.
- `tests/legacyRoutes.test.ts` validates that the retired telecom endpoints stay on explicit `410` migration responses.
- `tests/voiceCapture.test.ts` and `tests/textUtils.test.ts` cover shared client utilities.

## Validation commands

```bash
npm test
npm run typecheck
npm run build
```

## Recommended next additions

1. Add failure-path coverage for the `/api/v1/voice-sessions` routes.
2. Add callback-delivery retry scenarios if the callback service evolves.
3. Add direct coverage for the `/api/v1/voice-sessions/{sessionId}/turn/voice` upload path.

## Demo verification path

1. Open `/`.
2. Create a demo session.
3. Confirm the secure URL uses a `#token=...` fragment.
4. Answer `3210`.
5. Clarify that the flagged expenses are separate valid expenses.
6. Confirm with `yes`.
7. Verify callback status becomes `DELIVERED`.