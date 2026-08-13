"use client";

import { useEffect, useReducer } from "react";

export const GAME_BACKGROUND_CROSSFADE_MS = 180;

export type GameSceneBackgroundSource = {
  src: string;
  fallbackSrc?: string;
};

type BackgroundLayer = GameSceneBackgroundSource & {
  requestedSrc: string;
};

export type GameSceneBackgroundState = {
  displayed: BackgroundLayer;
  incoming: BackgroundLayer | null;
  incomingReady: boolean;
};

type GameSceneBackgroundAction =
  | { type: "request"; background: GameSceneBackgroundSource }
  | { type: "loaded"; requestedSrc: string }
  | { type: "failed"; layer: "displayed" | "incoming"; requestedSrc: string }
  | { type: "complete"; requestedSrc: string };

function toLayer(background: GameSceneBackgroundSource): BackgroundLayer {
  return { ...background, requestedSrc: background.src };
}

export function initialGameSceneBackgroundState(
  background: GameSceneBackgroundSource,
): GameSceneBackgroundState {
  return {
    displayed: toLayer(background),
    incoming: null,
    incomingReady: false,
  };
}

export function gameSceneBackgroundReducer(
  state: GameSceneBackgroundState,
  action: GameSceneBackgroundAction,
): GameSceneBackgroundState {
  if (action.type === "request") {
    if (action.background.src === state.incoming?.requestedSrc) {
      return state;
    }
    if (action.background.src === state.displayed.requestedSrc) {
      return state.incoming == null
        ? state
        : { ...state, incoming: null, incomingReady: false };
    }
    return {
      ...state,
      incoming: toLayer(action.background),
      incomingReady: false,
    };
  }

  if (action.type === "loaded") {
    if (state.incoming?.requestedSrc !== action.requestedSrc) return state;
    return { ...state, incomingReady: true };
  }

  if (action.type === "failed") {
    const layer = state[action.layer];
    if (layer == null || layer.requestedSrc !== action.requestedSrc) return state;
    if (layer.fallbackSrc && layer.src !== layer.fallbackSrc) {
      return {
        ...state,
        [action.layer]: {
          ...layer,
          src: layer.fallbackSrc,
          fallbackSrc: undefined,
        },
        ...(action.layer === "incoming" ? { incomingReady: false } : {}),
      };
    }
    return action.layer === "incoming"
      ? { ...state, incoming: null, incomingReady: false }
      : state;
  }

  if (
    !state.incomingReady ||
    state.incoming?.requestedSrc !== action.requestedSrc
  ) {
    return state;
  }
  return {
    displayed: state.incoming,
    incoming: null,
    incomingReady: false,
  };
}

function SceneLayer({
  layer,
  state,
  transitioning = false,
  onLoad,
  onError,
}: {
  layer: BackgroundLayer;
  state: "displayed" | "incoming";
  transitioning?: boolean;
  onLoad?: () => void;
  onError: () => void;
}) {
  return (
    <div
      data-transitioning={transitioning ? "true" : "false"}
      className={`absolute inset-0 ${
        state === "displayed"
          ? "ui-game-background-current"
          : "ui-game-background-incoming"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={layer.src}
        alt=""
        onLoad={onLoad}
        onError={onError}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-zinc-100/80 dark:bg-zinc-950/80" />
    </div>
  );
}

export function GameSceneBackground({
  src,
  fallbackSrc,
}: GameSceneBackgroundSource) {
  const [state, dispatch] = useReducer(
    gameSceneBackgroundReducer,
    { src, fallbackSrc },
    initialGameSceneBackgroundState,
  );

  useEffect(() => {
    dispatch({ type: "request", background: { src, fallbackSrc } });
  }, [fallbackSrc, src]);

  useEffect(() => {
    if (!state.incomingReady || !state.incoming) return;
    const requestedSrc = state.incoming.requestedSrc;
    const timer = window.setTimeout(() => {
      dispatch({ type: "complete", requestedSrc });
    }, GAME_BACKGROUND_CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [state.incoming, state.incomingReady]);

  return (
    <div
      aria-hidden="true"
      className="game-scene-background pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <SceneLayer
        layer={state.displayed}
        state="displayed"
        transitioning={state.incomingReady}
        onError={() =>
          dispatch({
            type: "failed",
            layer: "displayed",
            requestedSrc: state.displayed.requestedSrc,
          })
        }
      />
      {state.incoming && (
        <SceneLayer
          layer={state.incoming}
          state="incoming"
          transitioning={state.incomingReady}
          onLoad={() =>
            dispatch({
              type: "loaded",
              requestedSrc: state.incoming!.requestedSrc,
            })
          }
          onError={() =>
            dispatch({
              type: "failed",
              layer: "incoming",
              requestedSrc: state.incoming!.requestedSrc,
            })
          }
        />
      )}
    </div>
  );
}
