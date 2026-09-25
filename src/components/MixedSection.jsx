import { useState, useCallback } from "react";
import FlashcardSection from "./FlashcardSection.jsx";
import QuizSection from "./QuizSection.jsx";

/**
 * @param {Object} props
 * @param {import("../services/schema.js").StudyItem[]} props.items
 * @param {() => void} props.onReset
 */
export default function MixedSection({ items, onReset }) {
  const [phase, setPhase] = useState(
    /** @type {"flashcards" | "quiz" | "done"} */ ("flashcards")
  );
  const [quizComplete, setQuizComplete] = useState(false);

  const flashcardItems = items.filter((i) => i.type === "flashcard");
  const quizItems = items.filter((i) => i.type === "quiz");

  const handleFlashcardComplete = useCallback(() => setPhase("quiz"), []);
  const handleQuizComplete = useCallback(() => setQuizComplete(true), []);

  return (
    <div className="mixed-section">
      {phase === "flashcards" && flashcardItems.length > 0 && (
        <FlashcardSection
          items={flashcardItems}
          onComplete={handleFlashcardComplete}
        />
      )}

      {phase === "flashcards" && flashcardItems.length === 0 && (
        <div className="mixed-section__empty">
          <p>No flashcards in this set.</p>
          {quizItems.length > 0 && (
            <button
              type="button"
              className="mixed-section__proceed-btn"
              onClick={() => setPhase("quiz")}
            >
              Skip to quiz
            </button>
          )}
        </div>
      )}

      {phase === "quiz" && (
        <>
          <div className="mixed-section__divider">
            <hr className="mixed-section__rule" />
            <span className="mixed-section__heading">Quiz</span>
            <hr className="mixed-section__rule" />
          </div>
          {quizItems.length > 0 ? (
            <QuizSection
              items={quizItems}
              onComplete={handleQuizComplete}
            />
          ) : (
            <p className="mixed-section__empty">No quiz questions in this set.</p>
          )}
        </>
      )}

      {quizComplete && (
        <div className="mixed-section__done">
          <p className="mixed-section__done-text">Study set complete!</p>
          <button
            type="button"
            className="mixed-section__proceed-btn"
            onClick={onReset}
          >
            Generate new set
          </button>
        </div>
      )}
    </div>
  );
}
