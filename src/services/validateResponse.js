import { ITEM_TYPES } from "./schema.js";

/**
 * @typedef {{ success: true, data: { items: import("./schema.js").StudyItem[], dropped: number } }} ValidationSuccess
 * @typedef {{ success: false, reason: string, raw: string }} ValidationFailure
 * @typedef {ValidationSuccess | ValidationFailure} ValidationResult
 */

export const REASON_CODES = {
  INVALID_JSON: "INVALID_JSON",
  INVALID_SHAPE: "INVALID_SHAPE",
  EMPTY_ITEMS: "EMPTY_ITEMS",
  ALL_ITEMS_INVALID: "ALL_ITEMS_INVALID",
  PROVIDER_ERROR: "PROVIDER_ERROR",
};

function isString(val) {
  return typeof val === "string" && val.length > 0;
}

function isValidFlashcard(item) {
  return (
    item.type === "flashcard" &&
    isString(item.id) &&
    isString(item.front) &&
    isString(item.back)
  );
}

function isValidQuiz(item) {
  return (
    item.type === "quiz" &&
    isString(item.id) &&
    isString(item.question) &&
    Array.isArray(item.options) &&
    item.options.length === 4 &&
    item.options.every((v) => typeof v === "string") &&
    typeof item.correctIndex === "number" &&
    Number.isInteger(item.correctIndex) &&
    item.correctIndex >= 0 &&
    item.correctIndex < 4 &&
    isString(item.explanation)
  );
}

function isValidItem(item) {
  if (!item || typeof item !== "object") return false;
  if (!ITEM_TYPES.includes(item.type)) return false;
  if (item.type === "flashcard") return isValidFlashcard(item);
  if (item.type === "quiz") return isValidQuiz(item);
  return false;
}

/**
 * Recover a JSON value from a possibly-noisy model response.
 *
 * Order matters: try a strict parse first so that a stray `{...}` fragment in
 * surrounding prose can never shadow an otherwise-valid payload. The regex
 * fallbacks then handle fenced blocks, a leading/trailing object, or a bare
 * items array. AI providers are not perfectly uniform in their output
 * formatting, so this stays deliberately defensive.
 *
 * @param {string} raw
 * @returns {unknown} the parsed value, or null if nothing could be recovered
 */
function extractJSON(raw) {
  try { return JSON.parse(raw); } catch { /* fall through */ }

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    try { return JSON.parse(inner); } catch { /* fall through */ }
  }

  const braceMatch = raw.match(/\{[\s\S]*?\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch { /* fall through */ }
  }

  const bracketMatch = raw.match(/\[[\s\S]*?\]/);
  if (bracketMatch) {
    try { return JSON.parse(bracketMatch[0]); } catch { /* fall through */ }
  }

  return null;
}

/**
 * Validate a raw AI response string against the StudyItem schema.
 *
 * Policy: salvage valid items from a partially-valid array. If 3 of 4
 * items are valid, return those 3 and report 1 dropped. This is
 * appropriate for a study tool where partial content is better than none —
 * the student still gets usable flashcards/quizzes from a mostly-correct
 * response. Reject only when zero items survive validation.
 *
 * @param {string} raw — raw JSON string from the provider
 * @returns {ValidationResult}
 */
export function validateResponse(raw) {
  if (!isString(raw)) {
    return { success: false, reason: REASON_CODES.INVALID_JSON, raw: String(raw) };
  }

  const parsed = extractJSON(raw);

  if (parsed === null) {
    return { success: false, reason: REASON_CODES.INVALID_JSON, raw };
  }

  let items;
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
    items = parsed.items;
  } else {
    return { success: false, reason: REASON_CODES.INVALID_SHAPE, raw };
  }

  if (items.length === 0) {
    return { success: false, reason: REASON_CODES.EMPTY_ITEMS, raw };
  }

  const validItems = items.filter(isValidItem);
  const dropped = items.length - validItems.length;

  if (validItems.length === 0) {
    return { success: false, reason: REASON_CODES.ALL_ITEMS_INVALID, raw };
  }

  return { success: true, data: { items: validItems, dropped } };
}
