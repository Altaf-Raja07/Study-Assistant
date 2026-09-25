import { useReducer, useCallback, useRef } from "react";

/**
 * @typedef {"idle" | "loading" | "success" | "error"} RequestStatus
 *
 * @typedef {Object} RequestState
 * @property {RequestStatus} status
 * @property {import("../services/schema.js").StudyItem[] | null} data
 * @property {string | null} error
 * @property {string | null} errorCode
 * @property {number} requestId — monotonically increasing token
 */

const ACTIONS = {
  FETCH_START: "FETCH_START",
  FETCH_SUCCESS: "FETCH_SUCCESS",
  FETCH_ERROR: "FETCH_ERROR",
  RESET: "RESET",
};

/** @returns {RequestState} */
function createInitialState() {
  return { status: "idle", data: null, error: null, errorCode: null, requestId: 0 };
}

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.FETCH_START: {
      return {
        status: "loading",
        data: null,
        error: null,
        errorCode: null,
        requestId: action.payload.requestId,
      };
    }

    case ACTIONS.FETCH_SUCCESS: {
      if (action.payload.requestId !== state.requestId) return state;
      return { ...state, status: "success", data: action.payload.data, error: null };
    }

    case ACTIONS.FETCH_ERROR: {
      if (action.payload.requestId !== state.requestId) return state;
      return {
        ...state,
        status: "error",
        error: action.payload.error,
        errorCode: action.payload.errorCode || null,
        data: null,
      };
    }

    case ACTIONS.RESET: {
      return createInitialState();
    }

    default:
      return state;
  }
}

/**
 * Hook for request lifecycle with a stale-response guard.
 *
 * The guard works via a monotonically increasing `requestId` token.
 * Each time `fetchStart` is called, the ref increments and that value
 * is passed into the reducer as the payload. This keeps a single source
 * of truth — the ref — rather than having the ref and reducer each
 * independently compute `requestId + 1` and risk desynchronizing.
 *
 * When the async response arrives, the caller passes the captured token
 * back into `fetchSuccess` / `fetchError`. The reducer compares it to
 * the current `state.requestId` — if they differ, a newer request has
 * superseded this one and the response is silently discarded.
 *
 * @returns {{
 *   state: RequestState,
 *   fetchStart: () => number,
 *   fetchSuccess: (data: import("../services/schema.js").StudyItem[], requestId: number) => void,
 *   fetchError: (error: string, requestId: number, errorCode?: string) => void,
 *   reset: () => void,
 * }}
 */
export function useRequestLifecycle() {
  const [state, dispatch] = useReducer(reducer, null, createInitialState);
  const currentRequestId = useRef(0);

  const fetchStart = useCallback(() => {
    currentRequestId.current += 1;
    dispatch({
      type: ACTIONS.FETCH_START,
      payload: { requestId: currentRequestId.current },
    });
    return currentRequestId.current;
  }, []);

  const fetchSuccess = useCallback(
    /** @param {import("../services/schema.js").StudyItem[]} data */
    (data, requestId) => {
      dispatch({ type: ACTIONS.FETCH_SUCCESS, payload: { data, requestId } });
    },
    []
  );

  const fetchError = useCallback(
    /** @param {string} error */
    (error, requestId, errorCode) => {
      dispatch({
        type: ACTIONS.FETCH_ERROR,
        payload: { error, requestId, errorCode: errorCode || null },
      });
    },
    []
  );

  const reset = useCallback(() => {
    dispatch({ type: ACTIONS.RESET });
    currentRequestId.current = 0;
  }, []);

  return {
    state,
    fetchStart,
    fetchSuccess,
    fetchError,
    reset,
  };
}
