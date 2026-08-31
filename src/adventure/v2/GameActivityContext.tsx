"use client";

import { createContext, useContext } from "react";
import type { GameStateValue } from "./GameStateProvider";

export type GameActivityState = Pick<
  GameStateValue,
  | "combatCooldown"
  | "setCombatCooldown"
  | "offlinePending"
  | "setOfflinePending"
  | "offlineHunt"
  | "setOfflineHunt"
  | "autoGathering"
  | "setAutoGathering"
  | "fishingActive"
  | "setFishingActive"
>;

export const GameActivityContext = createContext<GameActivityState | null>(
  null,
);

export function useGameActivityState(): GameActivityState {
  const value = useContext(GameActivityContext);
  if (!value) {
    throw new Error("useGameActivityState must be used inside <GameStateProvider>");
  }
  return value;
}
