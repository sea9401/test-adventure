"use client";

import { createContext, useContext } from "react";
import type { GameStateValue } from "./GameStateProvider";

export type GameIdentityState = Pick<
  GameStateValue,
  | "viewerUserId"
  | "viewerGuildId"
  | "viewerName"
  | "accountName"
  | "viewerGender"
  | "viewerLevel"
  | "viewerLevelCap"
  | "viewerJobTier"
  | "viewerClass"
  | "viewerExp"
  | "viewerExpToNext"
  | "playerSubtitle"
  | "viewerProficiency"
  | "setViewerProficiency"
>;

export const GameIdentityContext = createContext<GameIdentityState | null>(
  null,
);

export function useGameIdentityState(): GameIdentityState {
  const value = useContext(GameIdentityContext);
  if (!value) {
    throw new Error("useGameIdentityState must be used inside <GameStateProvider>");
  }
  return value;
}
