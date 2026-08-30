import {
  RARE_MAP_KINDS,
  RARE_MAP_KIND_IDS,
  type RareMapKindId,
} from "./rareMaps";
import { latestUnlockedHuntStageDepth } from "./dungeon";
import { floorPowerGate } from "./dungeonLadder";

export const ENHANCE_EMBER_MATERIAL_ID = "v2_enhance_ember";
export const TORN_MAP_FRAGMENT_MATERIAL_ID = "v2_torn_map_fragment";

// 승리당 독립 글로벌 드롭 확률(%). 희귀 지도 배율은 적용하지 않는다.
export const ENHANCE_EMBER_DROP_PCT = 0.6;
export const TORN_MAP_FRAGMENT_DROP_PCT = 0.35;

export const ENHANCE_EMBER_BLUE_COST = 8;
export const ENHANCE_EMBER_RED_COST = 24;
export const TORN_MAP_FRAGMENT_COMBINE_COST = 10;

export const SCAVENGED_CRAFT_MATERIALS = {
  [ENHANCE_EMBER_MATERIAL_ID]: {
    id: ENHANCE_EMBER_MATERIAL_ID,
    name: "강화의 불씨",
    description:
      "마물의 무구에서 떨어져 나온 작은 불씨. 8개는 푸른 강화석, 24개는 붉은 강화석으로 조합한다.",
  },
  [TORN_MAP_FRAGMENT_MATERIAL_ID]: {
    id: TORN_MAP_FRAGMENT_MATERIAL_ID,
    name: "찢어진 지도 조각",
    description:
      "희미한 길과 표식이 남은 지도 조각. 10개를 모으면 정복한 사냥 단계 중 선택한 깊이의 무작위 희귀 지도로 복원한다.",
  },
} as const;

export type ScavengedCraftRecipeId =
  | "blue_enhance_stone"
  | "red_enhance_stone"
  | "rare_map";

export function isScavengedCraftRecipeId(
  value: unknown,
): value is ScavengedCraftRecipeId {
  return (
    value === "blue_enhance_stone" ||
    value === "red_enhance_stone" ||
    value === "rare_map"
  );
}

export function rollEnhanceEmberDrop(
  rng: () => number,
  chanceMult: number = 1,
): number {
  const mult = Math.max(0, Number(chanceMult) || 0);
  return rng() * 100 < Math.min(100, ENHANCE_EMBER_DROP_PCT * mult) ? 1 : 0;
}

export function rollTornMapFragmentDrop(
  rng: () => number,
  chanceMult: number = 1,
): number {
  const mult = Math.max(0, Number(chanceMult) || 0);
  return rng() * 100 < Math.min(100, TORN_MAP_FRAGMENT_DROP_PCT * mult) ? 1 : 0;
}

/** 희귀 지도 복원에서 고를 수 있는 정복 완료 대표 단계(2·4·6…). */
export function craftedRareMapDepthOptions(frontierDepth: number): number[] {
  const maxDepth = latestUnlockedHuntStageDepth(frontierDepth);
  return Array.from({ length: Math.floor(maxDepth / 2) }, (_, index) =>
    Math.max(2, (index + 1) * 2),
  );
}

/** 현재 전투력이 권장 전투력을 넘는 가장 깊은 정복 단계를 조합 기본값으로 쓴다. */
export function defaultCraftedRareMapDepth(
  frontierDepth: number,
  playerPower: number | null | undefined,
): number {
  const options = craftedRareMapDepthOptions(frontierDepth);
  if (playerPower == null || !Number.isFinite(playerPower)) {
    return options.at(-1) ?? 2;
  }
  return (
    options.findLast((depth) => playerPower >= floorPowerGate(depth)) ??
    options[0] ??
    2
  );
}

// 조합 지도는 기존 자연 드롭의 종류별 희귀도 비율을 유지한다. dropPct=0인 테스트
// 전용 항목은 제외하며, 호출당 반드시 한 종류를 반환한다.
const CRAFTABLE_RARE_MAP_KIND_IDS = RARE_MAP_KIND_IDS.filter(
  (id) => RARE_MAP_KINDS[id].dropPct > 0,
);
const CRAFTABLE_RARE_MAP_TOTAL_WEIGHT = CRAFTABLE_RARE_MAP_KIND_IDS.reduce(
  (sum, id) => sum + RARE_MAP_KINDS[id].dropPct,
  0,
);

export function rollCraftedRareMapKind(
  rng: () => number = Math.random,
): RareMapKindId {
  let target = Math.max(0, Math.min(0.999999999999, rng())) *
    CRAFTABLE_RARE_MAP_TOTAL_WEIGHT;
  for (const id of CRAFTABLE_RARE_MAP_KIND_IDS) {
    target -= RARE_MAP_KINDS[id].dropPct;
    if (target < 0) return id;
  }
  return CRAFTABLE_RARE_MAP_KIND_IDS.at(-1) ?? "worn_map";
}
