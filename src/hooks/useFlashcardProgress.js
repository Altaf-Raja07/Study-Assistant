import { useReducer, useCallback, useMemo } from "react";

/**
 * @typedef {"unseen" | "known" | "review-again"} FlashcardStatus
 *
 * @typedef {Object} FlashcardState
 * @property {Map<string, { status: FlashcardStatus, item: import("../services/schema.js").FlashcardItem }>} items
 * @property {Set<string>} reviewPool — IDs of cards flagged for review
 * @property {boolean} isReviewPass — true when current round is a review pass
 */

const ACTIONS = {
  LOAD: "LOAD",
  MARK_KNOWN: "MARK_KNOWN",
  MARK_REVIEW_AGAIN: "MARK_REVIEW_AGAIN",
  START_REVIEW: "START_REVIEW",
  RESET: "RESET",
};

function buildInitialMap(flashcardItems) {
  const map = new Map();
  for (const item of flashcardItems) {
    map.set(item.id, { status: "unseen", item });
  }
  return map;
}

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.LOAD: {
      const flashcardItems = action.payload.filter(
        (i) => i.type === "flashcard"
      );
      return {
        items: buildInitialMap(flashcardItems),
        reviewPool: new Set(),
        isReviewPass: false,
      };
    }

    case ACTIONS.MARK_KNOWN: {
      const { id } = action.payload;
      const entry = state.items.get(id);
      if (!entry) return state;

      const newItems = new Map(state.items);
      newItems.set(id, { ...entry, status: "known" });

      const newPool = new Set(state.reviewPool);
      newPool.delete(id);

      return { ...state, items: newItems, reviewPool: newPool };
    }

    case ACTIONS.MARK_REVIEW_AGAIN: {
      const { id } = action.payload;
      const entry = state.items.get(id);
      if (!entry) return state;

      const newItems = new Map(state.items);
      newItems.set(id, { ...entry, status: "review-again" });

      const newPool = new Set(state.reviewPool);
      newPool.add(id);

      return { ...state, items: newItems, reviewPool: newPool };
    }

    case ACTIONS.START_REVIEW: {
      if (state.reviewPool.size === 0) return state;

      const newItems = new Map();
      for (const id of state.reviewPool) {
        const entry = state.items.get(id);
        if (entry) {
          newItems.set(id, { ...entry, status: "unseen" });
        }
      }

      return { items: newItems, reviewPool: new Set(), isReviewPass: true };
    }

    case ACTIONS.RESET: {
      const flashcardItems = action.payload.filter((i) => i.type === "flashcard");
      return {
        items: buildInitialMap(flashcardItems),
        reviewPool: new Set(),
        isReviewPass: false,
      };
    }

    default:
      return state;
  }
}

/** @returns {FlashcardState} */
function createInitialState() {
  return {
    items: new Map(),
    reviewPool: new Set(),
    isReviewPass: false,
  };
}

/**
 * Hook for tracking per-card flashcard progress with review-again support.
 *
 * @param {import("../services/schema.js").StudyItem[]} studyItems — full item array
 */
export function useFlashcardProgress(studyItems) {
  const [state, dispatch] = useReducer(reducer, null, createInitialState);

  const load = useCallback(() => {
    dispatch({ type: ACTIONS.LOAD, payload: studyItems });
  }, [studyItems]);

  const markKnown = useCallback(
    /** @param {{ id: string }} payload */
    (payload) => {
      dispatch({ type: ACTIONS.MARK_KNOWN, payload });
    },
    []
  );

  const markReviewAgain = useCallback(
    /** @param {{ id: string }} payload */
    (payload) => {
      dispatch({ type: ACTIONS.MARK_REVIEW_AGAIN, payload });
    },
    []
  );

  const startReview = useCallback(() => {
    dispatch({ type: ACTIONS.START_REVIEW });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: ACTIONS.RESET, payload: studyItems });
  }, [studyItems]);

  const knownCount = useMemo(
    () => [...state.items.values()].filter((e) => e.status === "known").length,
    [state.items]
  );
  const reviewAgainCount = useMemo(
    () => [...state.items.values()].filter((e) => e.status === "review-again").length,
    [state.items]
  );
  const totalCount = state.items.size;
  const canReview = state.reviewPool.size > 0;

  return {
    state,
    load,
    markKnown,
    markReviewAgain,
    startReview,
    reset,
    knownCount,
    reviewAgainCount,
    totalCount,
    canReview,
  };
}
