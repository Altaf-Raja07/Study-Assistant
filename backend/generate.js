import { ITEM_TYPES } from "../src/services/schema.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 30_000;

/**
 * Groq model id. Overridable via env so you can swap models without a code change.
 *
 * `openai/gpt-oss-120b` supports `response_format: { type: "json_object" }`, so
 * structured output is requested natively rather than merely prompted for.
 * Groq's free tier needs no credit card and allows 1,000 requests/day.
 *
 * NOTE: the previously-specified `llama-3.3-70b-versatile` no longer exists —
 * Groq returns 404 `model_not_found`, and its catalog currently carries no
 * Llama model at all. Verify availability at console.groq.com before changing
 * this; the account's other general-purpose options are `qwen/qwen3.8-27b` and
 * `openai/gpt-oss-20b` (the rest are safety classifiers and Whisper STT).
 */
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/** Active model — env override wins, otherwise the default above. */
const GROQ_MODEL = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;

const SYSTEM_PROMPT = `You are a study-material generator. Given user-provided notes or text, generate interactive study items.

Return ONLY a JSON object with this exact shape — no markdown fences, no prose, no explanation:
{
  "items": [
    {
      "id": "string",
      "type": "flashcard",
      "front": "string",
      "back": "string"
    },
    {
      "id": "string",
      "type": "quiz",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "string"
    }
  ]
}

Rules:
- Each item has "type": ${JSON.stringify(ITEM_TYPES)}.
- Flashcards: concise front (concept/question) and back (answer/explanation).
- Quiz: exactly 4 options, correctIndex 0-3, short explanation.
- Generate 5-15 items depending on input length.
- Use the same language as the input.
- IDs: use sequential strings like "1", "2", "3".`;

const MODE_INSTRUCTIONS = {
  flashcards: "Generate only flashcard items (type: \"flashcard\").",
  quiz: "Generate only quiz items (type: \"quiz\").",
  mixed: "Generate exactly 5 flashcard items AND 5 quiz items — both types must be present. Never produce only one type.",
};

/**
 * Translate a non-OK Groq response into the proxy's error contract.
 *
 * Verified against the live API — Groq returns standard OpenAI-style errors:
 *   { "error": { "message": string, "type": string, "code": string } }
 * Note `code` is a STRING slug (e.g. "invalid_api_key", "rate_limit_exceeded"),
 * not a numeric status, and there is no `metadata` object. We classify on that
 * slug, falling back to a message regex when `code` is absent.
 *
 * `upstreamStatus` is preserved so the frontend's `detectErrorCode()` keeps
 * mapping 429 -> RATE_LIMITED.
 *
 * @param {Response} response — the non-OK fetch Response (body not yet read)
 * @returns {{ error: string, upstreamStatus: number, upstreamDetail?: string, upstreamCode?: string }}
 */
async function mapUpstreamError(response) {
  const { status } = response;

  let detail;
  let code = "";
  try {
    const parsed = await response.json();
    detail = parsed?.error?.message || "";
    code = typeof parsed?.error?.code === "string" ? parsed.error.code : "";
  } catch {
    detail = await response.text().catch(() => "");
  }

  console.error(`[groq] ${status}${code ? ` (${code})` : ""}: ${detail}`);

  const base = {
    upstreamStatus: status,
    upstreamDetail: detail || undefined,
    upstreamCode: code || undefined,
  };

  // 401/403 — missing, malformed, or revoked API key.
  if (status === 401 || status === 403 || code === "invalid_api_key") {
    return { ...base, error: "Server misconfiguration: Groq rejected the API key." };
  }

  // 429 — free-tier daily cap (1,000/day) or per-minute rate limit.
  if (status === 429 || code === "rate_limit_exceeded") {
    return { ...base, error: "Upstream error (429): rate limited." };
  }

  // 400 for an unknown/decommissioned model id — a config error, not user error.
  if (
    code === "model_not_found" ||
    (status === 400 && /model_not_found|unknown model|invalid model/i.test(detail))
  ) {
    return {
      ...base,
      error: `Server misconfiguration: unknown Groq model "${GROQ_MODEL}". Set GROQ_MODEL to a valid model id.`,
    };
  }

  return { ...base, error: `Upstream error (${status}).` };
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export default async function generateHandler(req, res) {
  const { text, mode } = req.body;

  if (!text || typeof text !== "string" || !text.trim() || text.length > 4000) {
    return res.status(400).json({ error: "Text input is required and must not exceed 4000 characters." });
  }

  if (!mode || !MODE_INSTRUCTIONS[mode]) {
    return res.status(400).json({ error: "Mode must be flashcards, quiz, or mixed." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server misconfiguration: missing API key." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\n" + MODE_INSTRUCTIONS[mode] },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        max_tokens: 8192,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json(await mapUpstreamError(response));
    }

    const data = await response.json();
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;

    if (!content) {
      // Groq reports refusals / truncation via finish_reason rather than
      // an HTTP error, so surface the reason instead of a bare "empty response".
      if (choice?.finish_reason && choice.finish_reason !== "stop") {
        console.error(`[groq] no content, finish_reason=${choice.finish_reason}`);
        return res.status(502).json({
          error: `Provider returned no usable content (finish_reason: ${choice.finish_reason}).`,
          upstreamStatus: 502,
        });
      }
      return res.status(502).json({ error: "Empty response from provider." });
    }

    return res.json({ raw: content });
  } catch (err) {
    clearTimeout(timeout);

    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Provider request timed out." });
    }

    console.error("[generate]", err);
    return res.status(500).json({ error: "Internal server error." });
  }
}
