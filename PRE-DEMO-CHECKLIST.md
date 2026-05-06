# Pre-Demo Checklist

Run this before every PAMAI demo.

## Automated validation

```bash
npm test
npm run typecheck
npm run build
```

Pass criteria:

- All tests pass.
- Typecheck passes.
- Production build succeeds.

## Live smoke test

1. Start the app with `npm start`.
2. Open `/`.
3. Click `Create demo session`.
4. Confirm the browser lands on `/voice/session/{sessionId}#token=...`.
5. Answer `3210` for identity verification.
6. Explain that the documents represent separate valid expenses.
7. Confirm with `yes`.
8. Verify the operator view shows:

- Session status `COMPLETED`
- Decision `SEPARATE_VALID_EXPENSES`
- Callback status `DELIVERED`
- Recommended next action `PROCEED_TO_MANAGER_APPROVAL`

## Storage checks

Verify these exist after the smoke test:

- `data/pamai.sqlite`
- `data/pamai-sessions/ready`
- `data/pamai-sessions/completed`

Optional spot check:

- `GET /api/health` reports `data/pamai.sqlite` and `data/pamai-sessions`.

## Legacy retirement checks

Confirm these endpoints return `410`:

- `POST /api/session/start`
- `POST /api/turn/text`
- `POST /api/turn/voice`
- `GET /api/cases/{caseId}`