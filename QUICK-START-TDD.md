# Quick Start TDD

Use this sequence when changing the PAMAI codebase.

## 1. Start with the security boundary

Extend `tests/sessionToken.test.ts` first when secure-link behavior changes.

Protect:

- valid token acceptance
- tamper rejection
- expiration rejection

## 2. Lock the storage contract

Extend `tests/voiceSessionRepository.test.ts` when persistence changes.

Protect:

- SQLite session writes
- masked client context reads
- completion writes
- callback-attempt writes
- audit export writes

## 3. Lock the conversation flow

Extend `tests/voiceSessionFlow.test.ts` when conversation behavior changes.

Protect:

- identity verification
- duplicate clarification
- follow-up questioning
- final confirmation
- structured completion payloads

## 4. Then verify the UI mapping

Extend `tests/orbPresentation.test.ts` when orb states or copy change.

Protect:

- booting state
- listening state
- confirmation state
- resolved/error state

## 5. Finish with full validation

```bash
npm test
npm run typecheck
npm run build
```