# Study Assistant — Feature & Build Plan
### AI-Powered Flashcards, Quiz & Mixed Mode (React + LLM API)

---

## 1. Assignment Requirements (Source Summary)

From the Frontend Internship Assignment brief:

- Build a small **React app** (hooks, functional components) that takes **free-form text input**, sends it to a **real LLM API**, and turns the result into an **interactive tool** — not a chatbot.
- The model must return **structured data (JSON)** that the app parses and renders as interactive, stateful UI.
- Must **handle bad AI output**: malformed JSON, wrong shape, empty, slow, or failed responses. No crashes. Show error/retry. Never let a **stale response overwrite a newer one**.
- Must have **loading, error, and empty states**.
- Must **work on mobile**.
- Must ship a **README**: setup, AI-usage note, known limitations, time spent.
- **API key must never be exposed in the browser** — route through a backend/serverless proxy.
- Evaluation weighting: React & architecture (25%), AI integration & data handling (25%), Handling bad AI output (20%), UI/UX & product sense (15%), Communication & understanding (15%).
- Submission: public GitHub repo, small meaningful commits, README, short screen recording, `npm install && npm start` must work.
- Interview stage: demo the app, explain code, review an AI-generated snippet, fix an injected bug, add a small feature live.

---

## 2. Project Selection

**Chosen option: Study Assistant**, with three user-selectable modes:

| Mode | Description |
|---|---|
| **Flashcards** | AI generates flip-cards (front/back). User self-grades each card ("Got it" / "Review again"). |
| **Quiz** | AI generates multiple-choice questions with a correct answer + explanation. Deterministic scoring. Wrong answers feed a **retest pool**. |
| **Mixed** | AI returns both flashcard items and quiz items in one response. Presented as **two sequential sections** (all flashcards, then the quiz) — not interleaved. Flashcard "review again" and quiz "retest" are kept as **two independent pools**, not merged. |

---

## 3. Tech Stack

### Frontend
- **React** (functional components + hooks) — bootstrapped with **Vite**
- **JavaScript** (TypeScript optional, not required by the assignment)
- Plain **CSS** with CSS variables (for theming / dark mode), or a lightweight utility approach — no heavy UI framework needed
- `useReducer` for the two tracking pools (flashcard review state, quiz answer/retest state); local `useState` for simple UI flags (loading, mode selection, input text)

### Backend / API Proxy
- A minimal **Node.js serverless function** (Vercel Function or Netlify Function) — or a tiny **Express server** if running locally-only — whose only job is to:
  - Hold the AI provider API key server-side
  - Accept the user's free-form text + selected mode
  - Call the LLM provider
  - Return the raw model response to the frontend for parsing/validation

### AI Provider
- **Primary: Groq API** — OpenAI-compatible endpoint (`https://api.groq.com/openai/v1`), called with a plain `fetch` (no SDK required, since it's OpenAI-schema compatible)
  - Note: migrated from Cerebras on 2026-09-26 after the Cerebras key hit its usage limit, then again from OpenRouter once that account's free-tier daily quota was exhausted. Default model is `openai/gpt-oss-120b` (overridable via `GROQ_MODEL`). Groq's free tier needs no credit card and allows 1,000 requests/day with no purchase required.
- **Secondary / fallback: Google Gemini API** (`gemini-2.x-flash` or similar free-tier model via `@google/generative-ai`) — used as a fallback provider if Groq is rate-limited or unavailable, and as a natural talking point for "how would you make this provider-agnostic."
- Both providers support a JSON/structured-output mode — the proxy should request strict JSON and the frontend should still independently validate it (never trust the provider's mode as your only safety net).

### Tooling
- **Git + GitHub** for version control and submission
- **Vercel** or **Netlify** for deployment (frontend + serverless function together)
- Browser **DevTools network throttling** for manually testing slow/failed states
- Optional: a lightweight schema validator library (e.g. `zod`) for validating the AI's JSON response shape — or a small hand-rolled validator if you'd rather avoid the dependency and explain your own logic live in the interview

### State Management
- No external state library needed — `useReducer` + React Context (if the tree gets deep) is sufficient and easier to explain than Redux for a project this size

---

## 4. High-Level Architecture (Non-Code Overview)

```
User Input + Mode Select
        │
        ▼
Frontend "AI Service" module  ──calls──▶  Backend Proxy (holds API key)
        │                                        │
        │                                        ▼
        │                              LLM Provider (Groq / Gemini)
        │                                        │
        ▼◀───────────── raw JSON response ───────┘
Schema Validator (checks shape, types, discriminated `type` field)
        │
   ┌────┴────┐
   ▼         ▼
 Valid     Invalid/Malformed
   │             │
   ▼             ▼
State Reducer   Error State + Retry
(flashcards /
 quiz pools)
   │
   ▼
Mode-based Renderer
 (Flashcard component / Quiz component / Mixed = both sections)
```

Key design principle: **the AI response is treated as untrusted input** at every step — validated before it ever touches render state, with race-condition protection (via request tokens or `AbortController`) so an in-flight request can never overwrite a newer one.

---

## 5. Comprehensive Feature List (Sequenced Build Order)

> Priority tags: **[Must]** = required by the assignment · **[Nice]** = strengthens the submission · **[Stretch]** = optional, only after core is solid.

### Phase 0 — Project Foundation
- [ ] **[Must]** Scaffold React app with Vite
- [ ] **[Must]** Set up folder structure: `components/`, `hooks/`, `services/`, backend proxy folder
- [ ] **[Must]** Fix `package.json` scripts so `npm start` works end to end — Vite defaults to `npm run dev`, but the assignment explicitly requires `npm start`. If the backend is a separate Express server (not a Vercel/Netlify function), `npm start` needs to boot both frontend and backend together (e.g. via `concurrently`) — decide this now, not at submission time.
- [ ] **[Must]** Set up `.env.example` documenting required env vars (never commit real keys)
- [ ] **[Must]** Initialize Git repo with a clean first commit
- [ ] **[Must]** Create `AGENTS.md` and `DECISIONS.md` at the repo root — this feature plan is the source of truth for both; port the locked decisions (mode structure, sectioned mixed mode, separate retest pools, schema shape) into them before starting agent-assisted sessions
- [ ] **[Nice]** Set up basic linting/formatting (ESLint/Prettier) for consistency

### Phase 1 — Input & Mode Selection UI
- [ ] **[Must]** Define the visual identity here, not later — this screen sets the color palette, type scale, and layout tokens (in `theme.css`) that every subsequent screen must reuse. Treat it as the design-system phase, not throwaway UI. (See the design-plan process in the prompting playbook before implementing.)
- [ ] **[Must]** Free-form text input (textarea) for notes/topic
- [ ] **[Must]** Mode selector: Flashcards / Quiz / Mixed (radio group or segmented control)
- [ ] **[Must]** Client-side validation: block empty submission, guard against excessively long input
- [ ] **[Nice]** Character counter / soft length guidance for the input
- [ ] **[Nice]** Disable/hide the generate button while a request is already in flight

### Phase 2 — Backend Proxy & AI Integration
- [ ] **[Must]** Serverless function (or small Express server) that receives `{ text, mode }` from frontend
- [ ] **[Must]** Server-side call to Groq API using the server-held API key
- [ ] **[Must]** Prompt design: strict instructions for JSON-only output matching your schema, tailored per mode (flashcards / quiz / mixed)
- [ ] **[Must]** Request structured/JSON output mode from the provider (not just prompting "please return JSON")
- [ ] **[Nice]** Fallback logic: if Groq call fails/times out, retry via Gemini
- [ ] **[Nice]** Basic request timeout on the proxy so the frontend isn't left hanging indefinitely
- [ ] **[Stretch]** Basic rate/size limiting on the proxy endpoint

### Phase 3 — Schema Design & Response Validation
- [ ] **[Must]** Define one discriminated-union schema: array of items tagged `type: "flashcard" | "quiz"`
  - Flashcard item: `{ id, type: "flashcard", front, back }`
  - Quiz item: `{ id, type: "quiz", question, options[4], correctIndex, explanation }`
- [ ] **[Must]** Frontend validator that checks: valid JSON, correct top-level shape, correct field types, non-empty array, valid `type` discriminants
- [ ] **[Must]** Handle model wrapping JSON in markdown fences or extra prose — extract JSON safely before parsing
- [ ] **[Must]** Handle partially valid responses — decide and document your policy (reject whole response vs. salvage valid items)
- [ ] **[Nice]** Centralize validation logic in one reusable module so both Quiz and Flashcard paths use the same validator

### Phase 4 — Core State Management
- [ ] **[Must]** State machine / reducer for request lifecycle: `idle → loading → success → error`
- [ ] **[Must]** Request-token or `AbortController` guard to prevent a stale response from overwriting a newer one
- [ ] **[Must]** Separate reducer/state slice for **flashcard review progress** (per-card status: unseen / known / review-again)
- [ ] **[Must]** Separate reducer/state slice for **quiz progress** (per-question status: unanswered / correct / incorrect, plus a retest queue)
- [ ] **[Nice]** Derive summary stats (e.g., "8/10 correct", "3 cards to review") from state rather than tracking them separately

### Phase 5 — Flashcard Mode UI
- [ ] **[Must]** Card component with flip interaction (front ↔ back)
- [ ] **[Must]** Self-grade controls after flip: "Got it" / "Review again"
- [ ] **[Must]** Navigation between cards (next/previous or swipe-equivalent on mobile)
- [ ] **[Must]** "Review again" pass: after finishing the deck, cycle back through only the cards marked for review
- [ ] **[Nice]** Progress indicator ("Card 4 of 12")
- [ ] **[Nice]** Flip animation
- [ ] **[Nice]** Shuffle option for the review-again pass

### Phase 6 — Quiz Mode UI
- [ ] **[Must]** Question component rendering 4 options as selectable choices
- [ ] **[Must]** Immediate or end-of-quiz feedback (your choice — document which and why)
- [ ] **[Must]** Show the explanation field after an answer is locked in
- [ ] **[Must]** Score summary screen at the end
- [ ] **[Must]** Retest flow: a second, shorter round containing only previously wrong answers
- [ ] **[Nice]** Progress indicator ("Question 3 of 8")
- [ ] **[Nice]** Visual distinction (color/icon) for correct vs incorrect selections

### Phase 7 — Mixed Mode UI
- [ ] **[Must]** Section 1: full Flashcard flow (reuses Phase 5 components)
- [ ] **[Must]** Section 2: full Quiz flow (reuses Phase 6 components), presented after Section 1 completes
- [ ] **[Must]** Clear visual transition/heading between the two sections
- [ ] **[Must]** Independent tracking: flashcard review pool and quiz retest pool never mix
- [ ] **[Nice]** Combined summary screen at the very end (flashcards reviewed + quiz score together)

### Phase 8 — Error Handling, Loading & Empty States (High-Weight Category)
- [ ] **[Must]** Loading state — visible feedback while waiting on the AI response
- [ ] **[Must]** Error state — distinct UI (not a crash, not a blank screen) for: network failure, malformed JSON, wrong shape, empty array, timeout
- [ ] **[Must]** Retry action available directly from the error state
- [ ] **[Must]** Empty state — clear UI when there's genuinely nothing to show yet (before first generation)
- [ ] **[Must]** No unhandled promise rejections or uncaught exceptions anywhere in the AI-call path
- [ ] **[Nice]** Differentiated error messages depending on failure type, rather than one generic message
- [ ] **[Nice]** Manual test pass: simulate a slow network (DevTools throttling), a forced 500, and a deliberately truncated/garbage response — confirm each is handled gracefully
- [ ] **[Stretch]** Exponential backoff or a visible retry counter

### Phase 9 — Responsive Design & Accessibility
- [ ] **[Must]** Fully usable layout at mobile widths (test at a real narrow viewport, not just resizing desktop)
- [ ] **[Must]** Touch-friendly tap targets for flip/select/next actions
- [ ] **[Nice]** Keyboard navigation (tab order, enter/space to flip or select, arrow keys to navigate cards/questions)
- [ ] **[Nice]** ARIA roles/labels on interactive elements; visible focus states
- [ ] **[Nice]** Sufficient color contrast, especially for correct/incorrect indicators (not color-only signaling)

### Phase 10 — Stretch / Polish
- [ ] **[Stretch]** Dark mode via CSS variables
- [ ] **[Stretch]** Streaming response rendering (progressive reveal as the model generates)
- [ ] **[Stretch]** Refinement loop — follow-up prompts that edit the existing set ("make these harder," "add 5 more on X") instead of full regeneration
- [ ] **[Stretch]** Save/reload session (localStorage, or via the backend)
- [ ] **[Stretch]** Subtle transition animations between cards/questions/sections
- [ ] **[Stretch]** Deploy live (Vercel/Netlify) and link it in the README

### Phase 11 — Documentation & Submission
- [ ] **[Must]** README: setup instructions (`npm install && npm start` works out of the box)
- [ ] **[Must]** README: usage walkthrough of the full flow
- [ ] **[Must]** README: honest, specific AI-usage note (what you used AI for, not a vague blanket statement)
- [ ] **[Must]** README: known limitations, stated directly
- [ ] **[Must]** README: time spent
- [ ] **[Must]** `.env.example` present; no real keys committed anywhere in history
- [ ] **[Must]** Short screen recording demonstrating the happy path **and** at least one deliberate failure case (bad input, forced error) being handled gracefully
- [ ] **[Nice]** Incremental, well-labeled commit history reflecting the phases above (not one giant commit)
- [ ] **[Nice]** Live deployed link in the README

---

## 6. Pre-Interview Self-Check

Before submitting, be able to explain out loud, without notes:
- Why the schema is shaped the way it is, and what happens when the model violates it
- How the stale-response race condition is prevented
- The full lifecycle of a flashcard and a quiz item through your two separate state reducers
- What your AI SDK/fetch call is actually doing under the hood (not just "the SDK handles it")
- One deliberate architectural tradeoff you made and why (e.g., multiple-choice-only quiz, sectioned vs. interleaved mixed mode)
