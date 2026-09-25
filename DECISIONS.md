# Decisions Log

Format: what was decided, why, and what alternative was rejected.
Append new entries as the project progresses — this feeds the README's
"known limitations" section later.

---

### Project selection
Chose Study Assistant over Fridge-to-Recipe and Trip Planner. Reason:
best ratio of genuine interactive complexity (retest/review-again loop)
to implementation risk — avoids drag-and-drop/nested-state complexity
that Trip Planner would require, while being richer than Fridge-to-Recipe.

### Mixed mode presentation
Sectioned (all flashcards, then the full quiz) rather than interleaved.
Reason: flashcards and quiz items use different interaction models
(flip + self-grade vs. select + deterministic correctness) that don't
compose cleanly in a single interleaved stream. Sectioned is simpler to
implement, easier to explain, and still demonstrates multi-block
rendering from one AI response.

### Retest / review pools
Flashcard "review again" and quiz "retest" are kept as two independent
pools, not merged. Reason: self-reported confidence (flashcards) and
objective correctness (quiz) are different signals — merging them would
require inventing an equivalence that's hard to defend.

### Quiz answer format
Multiple-choice only, no free-text grading. Reason: keeps correctness
deterministic and the schema simple; avoids fuzzy string-matching
complexity that would expand the validation/failure surface area
significantly for limited benefit.

### AI provider
Groq as primary provider (OpenAI-compatible endpoint, very fast inference,
no credit card required for the free tier), Google Gemini as fallback.
Model: `openai/gpt-oss-120b` — overridable via the `GROQ_MODEL` env var
so the model can be swapped without a code change, and it supports
`response_format: { type: "json_object" }` natively, so structured output is
requested rather than merely prompted for.

Groq's free tier needs no credit card and allows 1,000 requests/day with no
purchase required — which matters, because the previous providers both became
unusable mid-project (see history below).

Provider errors are standard OpenAI-style
(`{ error: { message, type, code } }`) where `code` is a *string* slug
(`"invalid_api_key"`, `"rate_limit_exceeded"`, `"model_not_found"`) rather
than a numeric status, and there is no `metadata` object. `mapUpstreamError()`
classifies on that slug. `validateResponse.js` remains the parsing safety net:
direct `JSON.parse` first, then fenced blocks, then a `{...}` / `[...]` regex,
then salvaging valid items out of a partially invalid array.

> **Changed 2026-09-26:** originally Cerebras (`gpt-oss-120b`), then OpenRouter
> (`openrouter/free`) after the Cerebras key hit its usage limit. Migrated to
> Groq when testing showed the account's OpenRouter free-tier daily quota
> (50/day) was already exhausted. The calling code never changed beyond the
> connection layer — same plain `fetch`, same OpenAI-compatible JSON shape.
> Worth noting: the OpenRouter 429s were a *quota* exhaustion, not a credit
> gate — OpenRouter offers "wait for the daily reset" as a remedy and only
> *raises* 50 → 1,000/day if you add credits. That misread cost a detour.
> A second lesson: `llama-3.3-70b-versatile` was specified for Groq but has been
> removed from their catalog (404 `model_not_found`) — no Llama model remains.
> Model ids must be verified against `GET /v1/models` for the actual account
> rather than assumed from docs.

### API key handling
Never exposed client-side. All provider calls go through a backend
proxy that holds the key server-side.

### State management
`useReducer` + plain hooks, no external state library. Reason: scope of
this app doesn't justify Redux/Zustand, and hooks-only is easier to
explain and defend live in an interview.

### Response validator salvage policy
Salvage valid items from partially-valid arrays rather than rejecting
the whole response. Reason: for a study tool, partial content is better
than none — the student still gets usable flashcards/quizzes from a
mostly-correct AI response. Reject only when zero items survive validation.

### Stale-response guard
Monotonically increasing `requestId` token stored in a ref (single
source of truth). Each response carries its token; reducer compares
against current `state.requestId` and discards if mismatched. Reason:
prevents a slow, stale response from overwriting fresher data when
the user fires multiple requests quickly.

### FlashcardSection design
CSS 3D flip (`rotateY(180deg)`) with `backface-visibility: hidden`.
Two-face card inside a perspective container. "Got it" / "Review again"
pill buttons with progress dots. Keyboard: Space/Enter to flip,
arrow keys to navigate. `prefers-reduced-motion` skips JS setTimeout
animation and CSS transitions degrade instantly.

### QuizSection design
Select-then-lock mechanic: user picks an option, then clicks "Lock in".
Once locked, selection is permanent — options become disabled. Correct
answer highlighted with checkmark icon + "Correct!" text. Incorrect
shows cross icon + "Incorrect". Explanation reveals only after locking.
No color-only distinction: paired with SVG icons and text labels per
accessibility requirement.

### Accessibility: no color-only distinction
Both FlashcardSection and QuizSection use icons + text labels alongside
color for correct/incorrect/known/review-again states. Reason: color
blind users cannot distinguish states from color alone. Pattern:
checkmark icon + "Correct!" label, cross icon + "Incorrect" label,
"Got it" / "Review again" text buttons.

### Backend hosting approach
Express server (`backend/server.js`), not a Vercel/Netlify serverless
function. Reason: `npm start` must work locally with no platform CLI
dependency (serverless functions need `vercel dev`/`netlify dev` to
simulate locally); deployment is optional per the assignment, so
nothing is lost; a plain Express server is fully self-owned code,
easier to defend live in the interview than a platform-specific
function handler. `npm start` boots both the Vite dev server and the
Express backend together via `concurrently`.

### Provider calling method
No AI SDK — plain `fetch` calls to Groq's and Gemini's
OpenAI-compatible REST endpoints from the backend proxy. Reason: avoids
an unexamined dependency, keeps the calling code identical across both
providers, and is trivially explainable at the wire level (satisfies
the assignment's "be ready to explain what the SDK does" requirement by
having no SDK to explain).

### Environment variable loading
Node's built-in `--env-file=.env` flag (Node 20.6+), not the `dotenv`
package. Reason: avoids adding a dependency for something the runtime
already does natively; project targets Node 20+ regardless.

### Input character limit
Free-form input capped at 4,000 characters. Reason: worked backward
from the 8,192-token output cap shared
across system prompt + input + output) — 4,000 characters (~1,000
tokens) leaves comfortable headroom for prompt overhead and generated
output, while matching the assignment's "notes or a topic" framing
rather than full-document processing. Enforced with a visible counter
and a blocking (not silently truncating) validation message.

### Rate-limit awareness
Groq's free tier is rate-limited to 1,000 requests/day (no credit card, no
purchase required), with a tighter per-minute cap on top. The response
validator treats a 429/rate-limited response as its own distinct
failure case (separate from malformed-JSON or empty-response cases),
with a specific user-facing message ("Too many requests — wait a moment
and try again") rather than a generic error. The Generate button is
disabled while a request is in flight to reduce the chance of
accidentally exhausting the per-minute limit during normal use.

---

<!-- Add new entries below as you build -->