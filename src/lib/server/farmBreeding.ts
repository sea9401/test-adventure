// 품종 개량 서버 헬퍼 — 개량 요청과 농장 조회가 같은 방식으로 명장 품종 조건을 읽는다.

import type { FarmBreedingContext } from "@/adventure/v2/farmBreeding";
import {
  LIFE_MAJOR_PRODUCT_ID,
  lifeMajorCanCraft,
  parseLifeMajorState,
} from "@/adventure/v2/lifeMajor";

export const FARM_BREEDING_MASTER_CROP_ID = LIFE_MAJOR_PRODUCT_ID.farming;

export function farmBreedingContextFromSaves(
  characterRaw: unknown,
  lifeMajorRaw: unknown,
): FarmBreedingContext {
  const materials =
    characterRaw && typeof characterRaw === "object"
      ? (characterRaw as { materials?: unknown }).materials
      : null;
  const held =
    materials && typeof materials === "object"
      ? Number((materials as Record<string, unknown>)[FARM_BREEDING_MASTER_CROP_ID])
      : 0;
  return {
    masterUnlocked: lifeMajorCanCraft(parseLifeMajorState(lifeMajorRaw), "farming"),
    masterCropHeld: Number.isFinite(held) && held > 0 ? Math.floor(held) : 0,
  };
}
