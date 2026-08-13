"use client";

import { createContext, useContext, type ReactNode } from "react";

type RefreshGameState = () => Promise<void>;

const GameStateRefreshCtx = createContext<RefreshGameState | null>(null);

export function GameStateRefreshProvider({
  refreshGameState,
  children,
}: {
  refreshGameState: RefreshGameState;
  children: ReactNode;
}) {
  return (
    <GameStateRefreshCtx.Provider value={refreshGameState}>
      {children}
    </GameStateRefreshCtx.Provider>
  );
}

export function useRefreshGameState(): RefreshGameState {
  const refreshGameState = useContext(GameStateRefreshCtx);
  if (!refreshGameState) {
    throw new Error(
      "useRefreshGameState must be used inside <GameStateProvider>",
    );
  }
  return refreshGameState;
}
