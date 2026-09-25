import { useState, useCallback, useEffect, useRef } from "react";
import { useFlashcardProgress } from "../hooks/useFlashcardProgress.js";

/**
 * @param {Object} props
 * @param {import("../services/schema.js").FlashcardItem[]} props.items
 * @param {() => void} [props.onComplete]
 */
export default function FlashcardSection({ items, onComplete }) {
  const {
    state,
    load,
    markKnown,
    markReviewAgain,
    startReview,
    knownCount,
    totalCount,
    canReview,
  } = useFlashcardProgress(items);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const prefersReducedMotion = useRef(false);
  const advanceTimerRef = useRef(/** @type {number | null} */ (null));
  const loadedRef = useRef(false);
  const wasAllSeenRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current) {
      load();
      loadedRef.current = true;
    }
  }, [load]);

  const entries = [...state.items.values()];
  const currentEntry = entries[currentIndex];
  const unseenLeft = entries.filter((e) => e.status === "unseen").length;
  const allSeen = unseenLeft === 0;

  useEffect(() => {
    if (totalCount > 0 && allSeen && !wasAllSeenRef.current && onComplete) {
      onComplete();
    }
    wasAllSeenRef.current = allSeen;
  }, [allSeen, onComplete, totalCount]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion.current = mql.matches;
    const handler = (e) => {
      prefersReducedMotion.current = e.matches;
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const advance = useCallback(() => {
    setIsExiting(true);
    if (prefersReducedMotion.current) {
      setIsFlipped(false);
      setIsExiting(false);
      setCurrentIndex((prev) => (prev + 1) % entries.length);
      return;
    }
    advanceTimerRef.current = window.setTimeout(() => {
      setIsFlipped(false);
      setIsExiting(false);
      setCurrentIndex((prev) => (prev + 1) % entries.length);
    }, 200);
  }, [entries.length]);

  const goTo = useCallback(
    (delta) => {
      if (isFlipped || isExiting) return;
      setCurrentIndex((prev) => {
        const next = prev + delta;
        if (next < 0 || next >= entries.length) return prev;
        return next;
      });
    },
    [isFlipped, isExiting, entries.length]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(1);
      }
    },
    [goTo]
  );

  const handleFlip = () => {
    if (!isFlipped && currentEntry) {
      setIsFlipped(true);
    }
  };

  const handleKnown = () => {
    if (!currentEntry) return;
    markKnown({ id: currentEntry.item.id });
    advance();
  };

  const handleReviewAgain = () => {
    if (!currentEntry) return;
    markReviewAgain({ id: currentEntry.item.id });
    advance();
  };

  if (!currentEntry) {
    return (
      <div className="flashcard-section">
        <p className="flashcard-section__empty">No flashcards to display.</p>
      </div>
    );
  }

  return (
    <section
      className="flashcard-section"
      onKeyDown={handleKeyDown}
      aria-label="Flashcard study set"
    >
      <div className="flashcard-section__progress">
        <div className="flashcard-section__dots">
          {entries.map((entry, i) => (
            <span
              key={i}
              className={`flashcard-section__dot${
                entry.status !== "unseen" ? " flashcard-section__dot--done" : ""
              }${i === currentIndex ? " flashcard-section__dot--active" : ""}`}
              aria-hidden="true"
            />
          ))}
        </div>
        <span className="flashcard-section__counter">
          {entries.filter((e) => e.status !== "unseen").length} / {entries.length}
        </span>
      </div>

      {!allSeen && (
        <div
          className={`flashcard-section__scene${
            isExiting ? " flashcard-section__scene--exit" : ""
          }`}
        >
          <div
            className={`flashcard-section__card${
              isFlipped ? " is-flipped" : ""
            }`}
            onClick={handleFlip}
            role="button"
            tabIndex={0}
            aria-live="polite"
            aria-label={isFlipped ? "Card flipped — showing answer" : "Tap to reveal answer"}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleFlip();
              }
            }}
          >
            <div className="flashcard-section__face flashcard-section__face--front">
              <p className="flashcard-section__text">
                {currentEntry.item.front}
              </p>
            </div>
            <div className="flashcard-section__face flashcard-section__face--back">
              <p className="flashcard-section__text">
                {currentEntry.item.back}
              </p>
            </div>
          </div>

          {!isFlipped && (
            <p className="flashcard-section__hint">
              Tap to reveal &middot; &larr; &rarr; to navigate
            </p>
          )}

          {isFlipped && (
            <div className="flashcard-section__actions">
              <button
                type="button"
                className="flashcard-section__action flashcard-section__action--known"
                onClick={handleKnown}
              >
                Got it
              </button>
              <button
                type="button"
                className="flashcard-section__action flashcard-section__action--review"
                onClick={handleReviewAgain}
              >
                Review again
              </button>
            </div>
          )}
        </div>
      )}

      {allSeen && (
        <div className="flashcard-section__summary">
          <p className="flashcard-section__summary-text">
            {knownCount} of {totalCount} known
          </p>
          {canReview && (
            <button
              type="button"
              className="flashcard-section__action flashcard-section__action--review"
              onClick={() => {
                startReview();
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
            >
              Review {state.reviewPool.size} flagged
            </button>
          )}
          <p className="flashcard-section__summary-done">
            {canReview
              ? "Or come back later — the flagged cards will be here."
              : "All cards complete."}
          </p>
        </div>
      )}
    </section>
  );
}
