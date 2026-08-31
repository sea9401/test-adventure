"use client";

import { createContext, useContext } from "react";
import type { GameStateValue } from "./GameStateProvider";

export type GameWorldState = Pick<
  GameStateValue,
  | "currentOutpost"
  | "setCurrentOutpost"
  | "discoveredIds"
  | "setDiscoveredIds"
  | "occupations"
  | "treasuries"
  | "refreshOccupations"
  | "refreshGuildId"
  | "refreshGameState"
  | "gameStateLoaded"
  | "frontierDepth"
  | "setFrontierDepth"
  | "enterOutpost"
  | "travelTo"
  | "tilePos"
  | "setTilePos"
  | "travelToTile"
  | "tileSettlements"
  | "foundTile"
  | "promoteTile"
  | "demolishTile"
  | "tileActionError"
  | "clearTileActionError"
>;

export const GameWorldContext = createContext<GameWorldState | null>(null);

export function useGameWorldState(): GameWorldState {
  const value = useContext(GameWorldContext);
  if (!value) {
    throw new Error("useGameWorldState must be used inside <GameStateProvider>");
  }
  return value;
}
