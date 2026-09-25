export const ERROR_CODES = {
  RATE_LIMITED: "RATE_LIMITED",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  TIMEOUT: "TIMEOUT",
  SERVER_ERROR: "SERVER_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  INVALID_JSON: "INVALID_JSON",
  INVALID_SHAPE: "INVALID_SHAPE",
  EMPTY_ITEMS: "EMPTY_ITEMS",
  ALL_ITEMS_INVALID: "ALL_ITEMS_INVALID",
};

/**
 * @type {Record<string, { title: string, description: string, retryLabel: string }>}
 */
export const ERROR_MESSAGES = {
  [ERROR_CODES.RATE_LIMITED]: {
    title: "Too many requests",
    description:
      "The AI is busy — wait a moment and try again. The free tier has a tight requests-per-minute limit.",
    retryLabel: "Try again",
  },
  [ERROR_CODES.UPSTREAM_ERROR]: {
    title: "AI provider error",
    description: "The AI service returned an unexpected error. This is usually temporary.",
    retryLabel: "Try again",
  },
  [ERROR_CODES.TIMEOUT]: {
    title: "Request timed out",
    description:
      "The AI took too long to respond. Your input may be too large, or the service is under load.",
    retryLabel: "Try again",
  },
  [ERROR_CODES.SERVER_ERROR]: {
    title: "Something went wrong",
    description: "An unexpected error occurred on our end. Please try again.",
    retryLabel: "Try again",
  },
  [ERROR_CODES.NETWORK_ERROR]: {
    title: "Connection failed",
    description:
      "Couldn't reach the server. Check your internet connection and try again.",
    retryLabel: "Try again",
  },
  [ERROR_CODES.INVALID_JSON]: {
    title: "Couldn't understand the response",
    description:
      "The AI returned something we couldn't process. Try again with a slightly different prompt.",
    retryLabel: "Try again",
  },
  [ERROR_CODES.INVALID_SHAPE]: {
    title: "Unexpected response format",
    description:
      "The AI response didn't match the expected structure. Try generating again.",
    retryLabel: "Try again",
  },
  [ERROR_CODES.EMPTY_ITEMS]: {
    title: "No study items generated",
    description:
      "The AI didn't produce any study material from your text. Try adding more content or rephrasing.",
    retryLabel: "Try again",
  },
  [ERROR_CODES.ALL_ITEMS_INVALID]: {
    title: "Couldn't use any items",
    description:
      "Every item in the AI response failed validation. The model may have been confused — try again.",
    retryLabel: "Try again",
  },
};

/**
 * Detect the error code from a raw error string and optional upstream status.
 *
 * @param {string} errorMessage — raw error string from the backend or fetch layer
 * @param {number} [upstreamStatus] — HTTP status from the AI provider (e.g. 429)
 * @returns {string} an ERROR_CODES value
 */
export function detectErrorCode(errorMessage, upstreamStatus) {
  if (upstreamStatus === 429) {
    return ERROR_CODES.RATE_LIMITED;
  }

  if (errorMessage?.includes("429") || errorMessage?.includes("rate limit")) {
    return ERROR_CODES.RATE_LIMITED;
  }

  if (errorMessage?.includes("timed out")) {
    return ERROR_CODES.TIMEOUT;
  }

  if (errorMessage?.includes("Upstream error") || errorMessage?.includes("502")) {
    return ERROR_CODES.UPSTREAM_ERROR;
  }

  if (
    errorMessage?.includes("Internal server error") ||
    errorMessage?.includes("Server misconfiguration")
  ) {
    return ERROR_CODES.SERVER_ERROR;
  }

  if (
    errorMessage?.includes("NetworkError") ||
    errorMessage?.includes("Failed to fetch") ||
    errorMessage?.includes("network")
  ) {
    return ERROR_CODES.NETWORK_ERROR;
  }

  return ERROR_CODES.SERVER_ERROR;
}

/**
 * Get a user-friendly message object for an error code.
 *
 * @param {string} code
 * @returns {{ title: string, description: string, retryLabel: string }}
 */
export function getErrorMessage(code) {
  return (
    ERROR_MESSAGES[code] || {
      title: "Something went wrong",
      description: "An unexpected error occurred. Please try again.",
      retryLabel: "Try again",
    }
  );
}
