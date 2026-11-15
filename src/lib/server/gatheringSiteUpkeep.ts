// 채집지 정비 서버 헬퍼 — 정비 요청과 현황 조회가 같은 방식으로 보유 재료와 명장 정비 조건을 읽는다.

import { mergeDrops } from "@/adventure/data/v2/dungeonDrops";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import {
  GATHERING_SITES,
  type GatheringSiteUpkeepContext,
  type GatheringSiteUpkeepState,
  type GatheringSiteUpkeepView,
} from "@/adventure/v2/gatheringSiteUpkeep";
import {
  LIFE_MAJOR_PRODUCT_ID,
  lifeMajorCanCraft,
  parseLifeMajorState,
} from "@/adventure/v2/lifeMajor";

/** 정비에 쓰는 재료: 원자재 12종, 채광 부산물 3종, 명장 합금·목재. */
const UPKEEP_MATERIAL_IDS: readonly string[] = [
  ...GATHERING_SITES.map((site) => site.materialId),
  MINING_MATERIAL_ID.stone,
  MINING_MATERIAL_ID.coal,
  MINING_MATERIAL_ID.roughGem,
  LIFE_MAJOR_PRODUCT_ID.mining,
  LIFE_MAJOR_PRODUCT_ID.woodcutting,
];

/** character.v2 의 materials 와 전공 세이브로 정비 판정에 쓰는 값을 만든다. */
export function gatheringSiteUpkeepContext(
  materialsRaw: unknown,
  lifeMajorRaw: unknown,
): GatheringSiteUpkeepContext {
  const lifeMajor = parseLifeMajorState(lifeMajorRaw);
  return {
    materials: mergeDrops(materialsRaw, {}),
    masterUnlocked: {
      mining: lifeMajorCanCraft(lifeMajor, "mining"),
      woodcutting: lifeMajorCanCraft(lifeMajor, "woodcutting"),
    },
  };
}

export function gatheringSiteUpkeepView(
  stages: GatheringSiteUpkeepState,
  context: GatheringSiteUpkeepContext,
): GatheringSiteUpkeepView {
  const materials: Record<string, number> = {};
  for (const id of UPKEEP_MATERIAL_IDS) {
    const amount = context.materials[id] ?? 0;
    if (amount > 0) materials[id] = amount;
  }
  return { stages, materials, masterUnlocked: context.masterUnlocked };
}
