"use client";

import { createContext, useContext } from "react";
import type { GameStateValue } from "./GameStateProvider";

export type GameResourceState = Pick<
  GameStateValue,
  | "stamina"
  | "staminaMax"
  | "adventureSupportActive"
  | "adventureSupportTier"
  | "adventureSupportActiveUntil"
  | "adventureSupportPremiumUntil"
  | "staminaRegenBonusPct"
  | "setStamina"
  | "staminaPotions"
  | "hpCharges"
  | "mpCharges"
  | "hp"
  | "setHp"
  | "gold"
  | "bankedGold"
  | "spendableGold"
  | "setGold"
  | "setBankedGold"
  | "coreLoopOn"
  | "huntStaminaMode"
  | "atRiskGold"
  | "setAtRiskGold"
  | "mp"
  | "setMp"
  | "playerCombat"
  | "applyResourcePatch"
>;

export const GameResourceContext = createContext<GameResourceState | null>(
  null,
);

export function useGameResourceState(): GameResourceState {
  const value = useContext(GameResourceContext);
  if (!value) {
    throw new Error("useGameResourceState must be used inside <GameStateProvider>");
  }
  return value;
}
