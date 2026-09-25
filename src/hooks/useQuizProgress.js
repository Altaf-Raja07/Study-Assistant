import { useReducer, useCallback, useMemo } from "react";

/**
 * @typedef {"unanswered" | "correct" | "incorrect"} QuizStatus
 *
 * @typedef {Object} QuizState
 * @property {Map<string, { status: QuizStatus, item: import("../services/schema.js").QuizItem }>} items
 * @property {Set<string>} retestQueue — IDs of incorrect questions
 * @property {boolean} isRetest — true when current round is a retest
 */

const ACTIONS = {
  LOAD: "LOAD",
  ANSWER: "ANSWER",
  START_RETEST: "START_RETEST",
  RESET: "RESET",
};

function buildInitialMap(quizItems) {
  const map = new Map();
  for (const item of quizItems) {
    map.set(item.id, { status: "unanswered", item });
  }
  return map;
}

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.LOAD: {
      const quizItems = action.payload.filter((i) => i.type === "quiz");
      return {
        items: buildInitialMap(quizItems),
        retestQueue: new Set(),
        isRetest: false,
      };
    }

    case ACTIONS.ANSWER: {
      const { id, correct } = action.payload;
      const entry = state.items.get(id);
      if (!entry) return state;

      const newItems = new Map(state.items);
      const newQueue = new Set(state.retestQueue);

      if (correct) {
        newItems.set(id, { ...entry, status: "correct" });
        newQueue.delete(id);
      } else {
        newItems.set(id, { ...entry, status: "incorrect" });
        newQueue.add(id);
      }

      return { ...state, items: newItems, retestQueue: newQueue };
    }

    case ACTIONS.START_RETEST: {
      if (state.retestQueue.size === 0) return state;

      const newItems = new Map();
      for (const id of state.retestQueue) {
        const entry = state.items.get(id);
        if (entry) {
          newItems.set(id, { ...entry, status: "unanswered" });
        }
      }

      return { items: newItems, retestQueue: new Set(), isRetest: true };
    }

    case ACTIONS.RESET: {
      const quizItems = action.payload.filter((i) => i.type === "quiz");
      return {
        items: buildInitialMap(quizItems),
        retestQueue: new Set(),
        isRetest: false,
      };
    }

    default:
      return state;
  }
}

/** @returns {QuizState} */
function createInitialState() {
  return {
    items: new Map(),
    retestQueue: new Set(),
    isRetest: false,
  };
}

/**
 * Hook for tracking per-question quiz progress with retest support.
 *
 * @param {import("../services/schema.js").StudyItem[]} studyItems — full item array
 */
export function useQuizProgress(studyItems) {
  const [state, dispatch] = useReducer(reducer, null, createInitialState);

  const load = useCallback(() => {
    dispatch({ type: ACTIONS.LOAD, payload: studyItems });
  }, [studyItems]);

  const answer = useCallback(
    /** @param {{ id: string, correct: boolean }} payload */
    (payload) => {
      dispatch({ type: ACTIONS.ANSWER, payload });
    },
    []
  );

  const startRetest = useCallback(() => {
    dispatch({ type: ACTIONS.START_RETEST });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: ACTIONS.RESET, payload: studyItems });
  }, [studyItems]);

  const answeredCount = useMemo(
    () => [...state.items.values()].filter((e) => e.status !== "unanswered").length,
    [state.items]
  );
  const correctCount = useMemo(
    () => [...state.items.values()].filter((e) => e.status === "correct").length,
    [state.items]
  );
  const totalCount = state.items.size;
  const canRetest = state.retestQueue.size > 0;

  return {
    state,
    load,
    answer,
    startRetest,
    reset,
    answeredCount,
    correctCount,
    totalCount,
    canRetest,
  };
}
