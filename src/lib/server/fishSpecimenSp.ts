import type { FishId } from "@/adventure/data/v2/fish";
import {
  extractFishRegistration,
  fishCodexSpBonus,
  type FishCodex,
} from "@/adventure/v2/fishingCodex";

export type FishSpecimenSpProjection = {
  fishSpBefore: number;
  fishSpAfter: number;
  totalSpBefore: number;
  totalSpAfter: number;
  spLoss: number;
  equippedSpUsed: number;
  overBudget: boolean;
};

export function fishSpecimenExtractionProjection(input: {
  codex: FishCodex;
  fishId: FishId;
  totalSpBefore: number;
  equippedSpUsed: number;
}): FishSpecimenSpProjection {
  const fishSpBefore = fishCodexSpBonus(input.codex);
  const afterCodex = extractFishRegistration(input.codex, input.fishId).codex;
  const fishSpAfter = fishCodexSpBonus(afterCodex);
  const spLoss = Math.max(0, fishSpBefore - fishSpAfter);
  const totalSpAfter = Math.max(0, input.totalSpBefore - spLoss);
  return {
    fishSpBefore,
    fishSpAfter,
    totalSpBefore: input.totalSpBefore,
    totalSpAfter,
    spLoss,
    equippedSpUsed: input.equippedSpUsed,
    overBudget: input.equippedSpUsed > totalSpAfter,
  };
}
