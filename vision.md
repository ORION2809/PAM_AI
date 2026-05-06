# PAMAI Vision

## Product goal

PAMAI is a secure voice-session assistant for Pega-managed duplicate-expense clarification.

Pega remains the system of record. PAMAI does not approve or reject expenses. It verifies the user, captures the clarification, structures the result, and returns that result to Pega through a callback.

## Core flow

1. Pega creates a session through `POST /api/v1/voice-sessions`.
2. PAMAI returns a signed secure session URL.
3. The user opens the session and completes identity verification using the last four mobile digits.
4. PAMAI explains the duplicate finding and captures the user clarification.
5. PAMAI asks for final confirmation.
6. PAMAI stores the transcript, structured completion result, and callback attempt.
7. PAMAI sends the completion payload back to Pega.

## Architecture principles

- The backend state machine owns workflow progression.
- The secure session token must stay out of query parameters.
- SQLite and audit JSON are for demo persistence and inspection; Pega is still the system of record.
- The UI is a thin voice console over a deterministic backend flow.

## Active storage

- SQLite: `data/pamai.sqlite`
- Audit exports: `data/pamai-sessions/ready`, `data/pamai-sessions/completed`, `data/pamai-sessions/callback-failed`

## Demo success condition

The session reaches `COMPLETED`, produces `SEPARATE_VALID_EXPENSES` for the demo clarification path, and records a `DELIVERED` callback attempt.