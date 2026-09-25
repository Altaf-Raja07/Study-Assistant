/** Max total attempts (1 initial + 2 automatic retries). */
const MAX_ATTEMPTS = 3;

/** Exponential backoff base; doubles each retry. */
const BASE_BACKOFF_MS = 500;

/** Random jitter added to each backoff delay, to avoid synchronized retries. */
const JITTER_MS = 250;

/**
 * Client-side request timeout. Buffered 5s above the backend's own
 * `TIMEOUT_MS` (30s in backend/generate.js) so the server's 504 wins the race
 * and produces the more specific error; this is the backstop for the case
 * where the backend never responds at all.
 */
const CLIENT_TIMEOUT_MS = 35_000;

/**
 * Outer ceiling on the whole operation — every attempt plus every backoff wait.
 * Without this, three slow 35s attempts could compound to ~106s of spinner.
 * The per-attempt timeout above still applies within this budget; this only
 * guarantees the overall request cannot run indefinitely.
 */
const TOTAL_BUDGET_MS = 45_000;

/** Upper bound honored for a server-sent `Retry-After`, to avoid multi-minute hangs. */
const MAX_RETRY_AFTER_MS = 10_000;

/**
 * Upstream error codes that indicate a config/auth problem rather than a
 * transient fault. The backend reports every upstream failure as `502`, so
 * without this a misconfigured model or a revoked key would be retried three
 * times for nothing — burning quota on an error that can never self-heal.
 */
const NON_RETRYABLE_UPSTREAM_CODES = new Set(["model_not_found", "invalid_api_key"]);

/**
 * Combine the caller's signal with a client-side timeout into one signal.
 * Either source can abort independently and the other is left untouched.
 *
 * @param {AbortSignal | undefined} callerSignal
 * @param {number} timeoutMs
 * @returns {{ signal: AbortSignal, timedOut: () => boolean, dispose: () => void }}
 */
function withTimeout(callerSignal, timeoutMs) {
  const controller = new AbortController();
  const cleanups = [];
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  cleanups.push(() => clearTimeout(timer));

  if (callerSignal) {
    const onAbort = () => controller.abort();
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", onAbort, { once: true });
      cleanups.push(() => callerSignal.removeEventListener("abort", onAbort));
    }
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => cleanups.forEach((fn) => fn()),
  };
}

/**
 * Cancellable delay between retry attempts. Rejects as soon as `signal` aborts
 * so a pending retry never resolves after the user has moved on.
 *
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Only transient failures are retried. 400/401/404/422 and any other 4xx are
 * client/config errors that will fail identically on a second attempt, so
 * retrying them would just burn the user's quota.
 *
 * @param {number} status
 * @returns {boolean}
 */
function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Decide whether a failed response is worth retrying.
 *
 * Retryable: 429 and 5xx, unless the payload identifies a config/auth fault
 * that will fail identically every time.
 *
 * @param {number} status — HTTP status of the failed response
 * @param {{ upstreamStatus?: number, upstreamCode?: string } | null} body
 * @returns {boolean}
 */
function isRetryable(status, body) {
  if (!isRetryableStatus(status)) return false;
  if (body?.upstreamCode && NON_RETRYABLE_UPSTREAM_CODES.has(body.upstreamCode)) return false;
  if (body?.upstreamStatus === 401 || body?.upstreamStatus === 403) return false;
  return true;
}

/**
 * Resolve the wait before the next attempt: a server-sent `Retry-After` if
 * present (seconds or HTTP-date), otherwise exponential backoff plus jitter.
 *
 * @param {Response | null} res — the failed response, if there was one
 * @param {number} attempt — 1-based index of the attempt that just failed
 * @returns {number} milliseconds to wait
 */
function computeBackoffMs(res, attempt) {
  const header = res?.headers?.get?.("Retry-After");
  if (header) {
    const seconds = Number(header);
    const ms = Number.isFinite(seconds)
      ? seconds * 1000
      : (Date.parse(header) - Date.now() || 0);
    if (ms > 0) return Math.min(ms, MAX_RETRY_AFTER_MS);
  }
  return BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * JITTER_MS;
}

/**
 * Call the backend proxy to generate study items.
 *
 * Transient failures (HTTP 429 and 5xx) are retried up to 2 times with
 * exponential backoff + jitter, honoring `Retry-After`. Client errors are
 * never retried. Each attempt is bounded by a 35s client-side timeout composed
 * with the caller's signal, and the whole operation — all attempts plus all
 * backoff waits — is capped at 45s so the total can never compound.
 *
 * @param {Object} params
 * @param {string} params.text — user notes/excerpt
 * @param {string} params.mode — "flashcards" | "quiz" | "mixed"
 * @param {AbortSignal} [params.signal] — caller's abort signal
 * @param {(attempt: number, max: number) => void} [params.onRetry] — retry notice
 * @returns {Promise<string>} raw JSON string from the provider
 */
export async function generateStudySet({ text, mode, signal, onRetry }) {
  let lastError = null;
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Short-circuit rather than relying on `fetch` to reject an aborted
    // signal, so an already-cancelled request never reaches the network.
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }

    // Never let a single attempt run past the overall budget either.
    const attemptTimeout = Math.min(CLIENT_TIMEOUT_MS, TOTAL_BUDGET_MS - elapsed());
    const guard = withTimeout(signal, attemptTimeout);

    let res;

    try {
      res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode }),
        signal: guard.signal,
      });
    } catch (err) {
      // A caller abort (new request, or unmount) is not a failure to report —
      // re-throw it so the caller can discard the stale attempt silently.
      if (signal?.aborted) throw err;

      // Distinguish our own timeout from a genuine transport failure, so it
      // reports through the normal error path instead of looking like a hang.
      if (guard.timedOut()) {
        const timeoutErr = new Error("Client-side request timed out.");
        timeoutErr.httpStatus = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      // Clear this attempt's timeout before any backoff wait, so the timer
      // never spans the idle period between attempts.
      guard.dispose();
    }

    if (res.ok) {
      const data = await res.json();
      return data.raw;
    }

    const body = await res.json().catch(() => null);
    const httpError = new Error(body?.error || `Request failed (${res.status}).`);
    httpError.httpStatus = res.status;
    httpError.upstreamStatus = body?.upstreamStatus;
    httpError.upstreamCode = body?.upstreamCode;
    lastError = httpError;

    if (attempt === MAX_ATTEMPTS || !isRetryable(res.status, body)) {
      throw httpError;
    }

    // Outer budget: if waiting out the backoff would leave no room for a
    // useful next attempt, surface the error now instead of idling.
    const backoffMs = computeBackoffMs(res, attempt);
    if (elapsed() + backoffMs >= TOTAL_BUDGET_MS) {
      throw httpError;
    }

    await sleep(backoffMs, signal);
    onRetry?.(attempt + 1, MAX_ATTEMPTS);
  }

  throw lastError ?? new Error("Request failed.");
}
