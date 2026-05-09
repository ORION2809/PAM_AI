# Pam AI Voice Console

Pam AI is a full-stack Next.js demo for Pega-driven duplicate-expense clarification. Pega creates a signed email link, Pam AI loads the case-specific duplicate findings, captures the clarification, and sends a structured result back to Pega.

## What It Does

- Accepts a Pega session-creation payload through `POST /api/v1/voice-sessions`.
- Generates a signed secure session URL for the voice conversation.
- Loads duplicate-expense context into a full-screen orb-based voice UI.
- Guides the user through duplicate clarification, explanation capture, and final confirmation from the signed email link.
- Stores the session, transcript, structured result, and callback attempts in SQLite.
- Writes audit JSON files under `data/pamai-sessions` for demo inspection and export.

## Stack

- Frontend: Next.js App Router, React 19, Framer Motion
- Speech: OpenAI speech-to-text and OpenAI text-to-speech
- Reasoning: Deterministic backend state machine with optional OpenAI model metadata
- Session store: SQLite via `better-sqlite3`
- Audit export: JSON files in `data/pamai-sessions`
- Validation: Zod

## Storage

- Local default storage root: `data`
- Main database: `data/pamai.sqlite`
- Audit exports:
  - `data/pamai-sessions/ready`
  - `data/pamai-sessions/completed`
  - `data/pamai-sessions/callback-failed`

If `PAMAI_DATA_DIR` is set, Pam AI stores the SQLite database and audit exports under that directory instead. This is the recommended production path for Render persistent disks.

Legacy telecom endpoints are retired and now return `410` responses that point callers to the PAMAI session APIs.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Provide credentials.

Preferred environment variables:

```bash
OPENAI_API_KEY=...
APP_BASE_URL=http://localhost:3000
PAMAI_SESSION_TOKEN_SECRET=...
PAMAI_DATA_DIR=./data
PAMAI_MOCK_PEGA_CALLBACKS=false
PAMAI_PEGA_CALLBACK_URL=https://bluevoir-251.pegademo.com/prweb/api/VoiceAICaseCreation/V1/ResumeFlowfromVoiceAI
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=nova
```

Current workspace fallbacks:

- `openai.txt`
- `pamai-session-secret.txt` (optional)

If `PAMAI_MOCK_PEGA_CALLBACKS` is not set to `false`, callback URLs ending in `.company.com` are treated as mocked demo targets and marked delivered with HTTP `202`.

## Run

Development:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm run start
```

Validation:

```bash
npm test
npm run typecheck
```

## Render Deploy

This repository includes `render.yaml` for a single Render web service.

Recommended Render configuration:

- Runtime: Node
- Build command: `npm ci && npm run build`
- Start command: `npm run start`
- Health check path: `/api/health`
- Default blueprint plan: `free`

The free deployment keeps the demo workflow working, but storage is ephemeral across restarts and redeploys.

If you later upgrade to a paid Render instance with a disk, use:

- Persistent disk mount: `/var/data`
- `PAMAI_DATA_DIR=/var/data/pamai`

Required Render environment variables:

- `APP_BASE_URL`
- `OPENAI_API_KEY`
- `PAMAI_SESSION_TOKEN_SECRET`
- `PEGA_CLIENT_ID`
- `PEGA_CLIENT_SECRET`
- `PEGA_TOKEN_ENDPOINT`
- `PEGA_EXPENSE_DATA_VIEW_URL`
- `PAMAI_PEGA_CALLBACK_URL`

For the demo workflow, keep:

- `PAMAI_MOCK_PEGA_CALLBACKS=false` when posting completed conversations back to Pega.

Optional OpenAI speech tuning:

- `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe`
- `OPENAI_TRANSCRIPTION_LANGUAGE=en`
- `OPENAI_TTS_MODEL=gpt-4o-mini-tts`
- `OPENAI_TTS_VOICE=nova`
- `OPENAI_TTS_INSTRUCTIONS=Speak as a warm young adult female support assistant.`

## Primary Endpoints

- `POST /api/v1/voice-sessions`
- `GET /api/v1/voice-sessions/{sessionId}`
- `POST /api/v1/voice-sessions/{sessionId}/start`
- `POST /api/v1/voice-sessions/{sessionId}/turn/text`
- `POST /api/v1/voice-sessions/{sessionId}/turn/voice`
- `POST /api/v1/voice-sessions/{sessionId}/complete`
- `GET /api/v1/voice-sessions/{sessionId}/callback-status`

Session access uses the signed token from the secure URL fragment or an authenticated request header, not a query-string token.

## Demo Flow

1. Open `/`.
2. Click `Create demo session`.
3. Pam AI loads the secure session and opens with the case-specific duplicate-expense summary.
4. Clarify that the documents are separate valid expenses.
5. Confirm with `yes`.
6. Verify the session moves to `COMPLETED`, the decision becomes `SEPARATE_VALID_EXPENSES`, and the callback status becomes `DELIVERED`.

## Project Layout

```text
app/
  api/
    demo/
    v1/voice-sessions/
  voice/session/[sessionId]/
  globals.css
  layout.tsx
  page.tsx
components/
  PamaiLaunchpad.tsx
  PamaiVoiceConsole.tsx
  SessionSnapshot.tsx
  ConversationTranscript.tsx
lib/
  env.ts
  fixtures/
  schemas/
  services/
  ui/
  utils/
data/
  pamai.sqlite
  pamai-sessions/
tests/
```

## Important Notes

- The backend owns the session state machine and structured completion format.
- Pam AI does not approve or reject expenses. It only captures and returns the clarification.
- `GET /api/health` now validates PAMAI storage readiness and reports the active storage paths.
- Signed session URLs are required for the secure session page.
- Request limits and payload-size checks are enabled on the demo endpoints.
