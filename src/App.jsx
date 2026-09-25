import { useState, useRef, useEffect } from "react";
import TextInput from "./components/TextInput.jsx";
import ModeSelector from "./components/ModeSelector.jsx";
import FlashcardSection from "./components/FlashcardSection.jsx";
import QuizSection from "./components/QuizSection.jsx";
import MixedSection from "./components/MixedSection.jsx";
import { MODE_IDS } from "./constants.js";
import { useRequestLifecycle } from "./hooks/useRequestLifecycle.js";
import { generateStudySet } from "./services/generate.js";
import { validateResponse } from "./services/validateResponse.js";
import { detectErrorCode, getErrorMessage } from "./services/errorCodes.js";
import "./App.css";

export default function App() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState(MODE_IDS[0]);
  const { state, fetchStart, fetchSuccess, fetchError, reset } =
    useRequestLifecycle();
  const abortRef = useRef(/** @type {AbortController | null} */ (null));

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const isLoading = state.status === "loading";
  const [retryAttempt, setRetryAttempt] = useState(/** @type {number | null} */ (null));

  const handleGenerate = async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = fetchStart();
    setRetryAttempt(null);

    try {
      const raw = await generateStudySet({
        text,
        mode,
        signal: controller.signal,
        onRetry: (attempt) => {
          if (!controller.signal.aborted) setRetryAttempt(attempt);
        },
      });

      const result = validateResponse(raw);

      if (result.success) {
        fetchSuccess(result.data.items, requestId);
      } else {
        fetchError(
          result.raw.slice(0, 300),
          requestId,
          result.reason
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;

      const message = err instanceof Error ? err.message : String(err);
      const upstreamStatus = err.upstreamStatus;
      const code = detectErrorCode(message, upstreamStatus);
      fetchError(message, requestId, code);
    }
  };

  return (
    <main className="app-shell">
      <header className="app-shell__header">
        <h1 className="app-shell__title">Study Assistant</h1>
        <p className="app-shell__subtitle">
          Turn your notes into study material
        </p>
      </header>

      <TextInput value={text} onChange={setText} disabled={isLoading} />

      <ModeSelector selected={mode} onSelect={setMode} disabled={isLoading} />

      <button
        type="button"
        className={`generate-btn${isLoading ? " generate-btn--loading" : ""}`}
        disabled={!text.trim() || isLoading}
        onClick={handleGenerate}
        aria-label="Generate study set"
      >
        {isLoading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Generating...
          </>
        ) : (
          <>
            Generate Study Set
            <svg
              className="generate-btn__icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>

      {isLoading && (
        <div className="result-card result-card--loading" role="status">
          <p className="result-card__text">
            {retryAttempt
              ? `Connection issue — retrying (${retryAttempt}/3)…`
              : "Generating your study set…"}
          </p>
        </div>
      )}

      {state.status === "error" && (() => {
        const msg = getErrorMessage(state.errorCode);
        return (
          <div className="result-card result-card--error" role="alert">
            <p className="result-card__title">{msg.title}</p>
            <p className="result-card__text">{msg.description}</p>
            {state.error && (
              <details className="result-card__details">
                <summary className="result-card__details-summary">
                  Technical details
                </summary>
                <pre className="result-card__error-detail">{state.error}</pre>
              </details>
            )}
            <div className="result-card__actions">
              <button
                type="button"
                className="result-card__action"
                onClick={handleGenerate}
                disabled={!text.trim()}
              >
                {msg.retryLabel}
              </button>
              <button
                type="button"
                className="result-card__action result-card__action--secondary"
                onClick={() => {
                  reset();
                  setText("");
                }}
              >
                Start over
              </button>
            </div>
          </div>
        );
      })()}

      {state.status === "success" && state.data && (
        <>
          {mode === "flashcards" ? (
            <FlashcardSection
              items={state.data.filter((i) => i.type === "flashcard")}
            />
          ) : mode === "quiz" ? (
            <QuizSection
              items={state.data.filter((i) => i.type === "quiz")}
            />
          ) : (
            <MixedSection
              items={state.data}
              onReset={() => {
                reset();
                setText("");
              }}
            />
          )}
        </>
      )}
    </main>
  );
}
