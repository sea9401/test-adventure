import type { ProductionKind } from "./settlement";

// 정착지 재료 = 통나무(crop)·철광석(ore). 길드 생산슬롯 대신 사냥 드랍으로 수급(개편 PR-2).
//   개인 인벤에 떨어져 → 기부(길드/솔로 풀 crop/ore 적립·PR-2b) / 거래소 판매 / 조합식(PR-5).
//   강화석과 같은 "독립 드랍"(전 깊이 공통·V2_MATERIALS_ENABLED 무관). NPC 환금 없음(거래소 전용).
export const SETTLEMENT_MATERIAL_ID = {
  timber: "v2_timber",
  ironOre: "v2_iron_ore",
} as const;

export const SETTLEMENT_MATERIALS = {
  [SETTLEMENT_MATERIAL_ID.timber]: {
    id: SETTLEMENT_MATERIAL_ID.timber,
    name: "통나무",
    description:
      "사냥터에서 베어 모은 통나무. 정착지(길드·개인) 발전에 기부하거나, 거래소에 내다 팔 수 있다.",
  },
  [SETTLEMENT_MATERIAL_ID.ironOre]: {
    id: SETTLEMENT_MATERIAL_ID.ironOre,
    name: "철광석",
    description:
      "사냥터에서 캐낸 철광석. 정착지(길드·개인) 발전에 기부하거나, 거래소에 내다 팔 수 있다.",
  },
} as const;

// 드랍 종류 → 정착지 재화 키(기부 적립 매핑·PR-2b 가 사용). 통나무→crop / 철광석→ore.
export const SETTLEMENT_MATERIAL_TO_KIND: Record<string, ProductionKind> = {
  [SETTLEMENT_MATERIAL_ID.timber]: "crop",
  [SETTLEMENT_MATERIAL_ID.ironOre]: "ore",
};

// 🔧 다이얼 — 사냥 1판(승리)당 독립 드랍 확률(0~1 분수). 희소(자급자족은 한참 걸리게 →
//   거래소 수요 유도). qty=1 고정이라 확률 = 판당 기대 개수. 라이브 튜닝 한 줄.
//   현 수치: 통나무 5%(≈village→city 통나무 400개=8천승)·철광석 3%(≈250개=8.3천승).
export const SETTLEMENT_MATERIAL_DROP_PCT: Record<string, number> = {
  [SETTLEMENT_MATERIAL_ID.timber]: 0.05,
  [SETTLEMENT_MATERIAL_ID.ironOre]: 0.03,
};

// 독립 드랍 굴림(순수). rng()∈[0,1). 강화석/재련석 롤 패턴 미러. 레어맵 배수 미적용.
//   종류별 독립 굴림(각 1 draw 소비), 통과 시 1개.
export function rollSettlementMaterialDrops(
  rng: () => number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (rng() < SETTLEMENT_MATERIAL_DROP_PCT[SETTLEMENT_MATERIAL_ID.timber]) {
    out[SETTLEMENT_MATERIAL_ID.timber] = 1;
  }
  if (rng() < SETTLEMENT_MATERIAL_DROP_PCT[SETTLEMENT_MATERIAL_ID.ironOre]) {
    out[SETTLEMENT_MATERIAL_ID.ironOre] = 1;
  }
  return out;
}
