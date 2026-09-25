# Study Assistant

AI-powered study tool that turns your notes into interactive flashcards, quizzes, or a mixed study set.

## Demo

A ~1:50 walkthrough of all three modes — flashcard flipping with the review-again pool, quiz lock-in and retest, and the sequential Mixed mode.

<video src="https://github.com/user-attachments/assets/41cfd8df-35eb-41fb-9f18-0d3ef64bf1a8" controls width="100%"></video>

Not showing? GitHub only renders `<video>` in markdown on github.com — [download the MP4 directly](https://github.com/user-attachments/assets/41cfd8df-35eb-41fb-9f18-0d3ef64bf1a8).

## Setup

```bash
npm install
npm start
```

Requires Node.js 20+ (uses `--env-file` for `.env` loading). The app runs at `http://localhost:5173` (frontend) and `http://localhost:3001` (backend proxy).

To test on a phone, connect both devices to the same WiFi and open the **Network** URL shown in the `npm start` output (e.g. `http://192.168.x.x:5173`).

Create a `.env` file based on `.env.example` with your API key:

```
GROQ_API_KEY=your_key_here
```

## Usage

1. Paste your notes or a focused topic (up to 4,000 characters) into the text area
2. Choose a mode: **Flashcards**, **Quiz**, or **Mixed**
3. Click **Generate Study Set**
4. **Flashcards**: tap to flip, then self-grade with "Got it" or "Review again". Use arrow keys to navigate. Progress dots track your progress.
5. **Quiz**: select an answer, click "Lock in" (once locked, it cannot be changed). Explanation reveals after locking. Incorrect answers go into a retest queue.
6. **Mixed**: flashcards first, then a quiz section — sequential, never interleaved.

## How It Works

```
┌─────────────┐     POST /api/generate      ┌──────────────────┐
│   Browser   │ ───────────────────────────▶ │  Express :3001   │
│  (Vite :5173)│                              │  (backend proxy)  │
│              │                              │                   │
│  TextInput   │                              │  Holds API key    │
│  ModeSelector│                              │  Builds prompt    │
│  App.jsx     │                              │  Rate-limit guard │
│              │ ◀─────────────────────────── │                   │
└──────────────┘     { raw: "..." }           └────────┬──────────┘
       │                                               │
       │ validateResponse()                  fetch(GROQ_URL)
       │ • extract JSON from fences          OpenAI-compat endpoint
       │ • validate against schema           response_format: json
       │ • salvage valid items               max_tokens: 8k
       │                                               │
       ▼                                               ▼
┌──────────────────┐                        ┌──────────────────┐
│   StudyItem[]    │                        │    Groq API      │
│  discriminated   │                        │ (gpt-oss-120b)   │
│  union data      │                        │                  │
└────────┬─────────┘                        └──────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│                  App.jsx render switch               │
│                                                     │
│  mode=flashcards ──▶ FlashcardSection               │
│                      • 3D CSS flip cards             │
│                      • review-again pool             │
│                      • arrow-key navigation          │
│                                                     │
│  mode=quiz ────────▶ QuizSection                    │
│                      • select → lock → reveal        │
│                      • retest queue for incorrect    │
│                      • arrow-key radiogroup          │
│                                                     │
│  mode=mixed ───────▶ MixedSection                   │
│                      • FlashcardSection first        │
│                      • divider transition            │
│                      • QuizSection after             │
│                      • independent pools (never merge)│
└─────────────────────────────────────────────────────┘

State: useReducer per feature, useRequestLifecycle with stale-response guard
Error codes: 9 distinct types → user-friendly messages + collapsible debug details
```

## Tech Stack

- React 19 + Vite 8
- Express backend proxy (port 3001) — routes LLM calls, holds API keys server-side
- Plain CSS with CSS custom properties
- Groq API (primary)
- No TypeScript — JSDoc for type annotations

## AI-Usage Note

I used OpenCode as a coding agent throughout development, working
phase-by-phase against a feature plan I scoped upfront (schema design,
mode behavior, state management, provider choice). Each phase had a
spec I wrote before prompting, and I reviewed every diff before
committing — including manually testing failure modes in the response
validator (malformed JSON, wrong shape, empty responses, rate limiting)
and the stale-response race-condition guard. Architectural decisions —
the discriminated-union schema, sectioned Mixed mode with independent
retest/review pools, multiple-choice-only quiz, Express backend over a
serverless function, no AI SDK (plain fetch to OpenAI-compatible
endpoints) — were mine; OpenCode implemented against locked constraints
I maintained in AGENTS.md and DECISIONS.md throughout.

## Known Limitations

- Input capped at 4,000 characters — keeps generation focused and fits
  comfortably within the selected model's context window
- No Gemini fallback yet (Groq only) — transient failures are retried, but if
  Groq stays unavailable, generation fails rather than retrying via a second
  provider
- Groq's free tier allows 1,000 requests/day with no credit card and no purchase
  required, but it also enforces a tighter per-minute cap, so generating
  repeatedly in quick succession can still hit a 429
- Transient upstream failures (HTTP 429 and 5xx) are retried automatically up to
  2 times with exponential backoff + jitter, honoring `Retry-After`; client
  errors (400/401/404/422) and config faults are never retried. Each attempt is
  bounded by a 35s client-side timeout, and the whole request — all attempts
  plus all backoff waits — is capped at 45s, so a request that fails every time
  shows the error card within ~45s rather than compounding across attempts
- No dark mode
- No save/load sessions
- No streaming response rendering
- Quiz is multiple-choice only (no free-text grading) — deliberate,
  to keep correctness deterministic and validation simple
- Stretch features beyond the core three modes were deliberately not
  pursued — prioritized a solid, well-tested core over a broader
  feature set with less polish

## Time Spent

~7.5 hours total

| Phase | Time | What |
|---|---|---|
| Scaffold + schema + env | ~45m | Vite/React setup, folder structure, `schema.js`, `.env`, AGENTS.md |
| Backend proxy + validator | ~1.5h | Express server, Groq handler, `validateResponse.js` with salvage policy |
| State reducers + generate flow | ~1h | `useRequestLifecycle`, `useFlashcardProgress`, `useQuizProgress`, stale-response guard |
| UI across all 3 modes | ~2h | FlashcardSection (3D flip, review-again), QuizSection (lock-in, retest), MixedSection |
| Error/loading/empty states | ~45m | Code-specific error messages, rate-limit handling, empty states across components |
| Responsive + accessibility pass | ~45m | 44px touch targets, focus-visible rings, ARIA labels, quiz arrow-key nav, 375px audit |
| Docs + final QA | ~30m | README, AGENTS.md, DECISIONS.md, manual limitation tests, lint/build |

## License

MIT
