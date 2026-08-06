import type { ProductionKind } from "./settlement";

// 정착지 재료 = 통나무(crop)·철광석(ore). 개인 인벤에 누적되어 → 기부(길드/솔로 풀
// crop/ore 적립·PR-2b) / 거래소 판매 / 조합식(PR-5)에 쓰인다. 통나무는 벌목장
// 미니게임을 주 수급처로 둔다. 철광석도 채광 도입 후 사냥 드랍을 잠갔다.
export const SETTLEMENT_MATERIAL_ID = {
  timber: "v2_timber",
  ironOre: "v2_iron_ore",
} as const;

export const SETTLEMENT_MATERIALS = {
  [SETTLEMENT_MATERIAL_ID.timber]: {
    id: SETTLEMENT_MATERIAL_ID.timber,
    name: "소나무 원목",
    description:
      "솔바람 소나무숲에서 얻는 기초 목재. 정착지(길드·개인) 발전에 기부하거나 거래소에 내다 팔 수 있다.",
  },
  [SETTLEMENT_MATERIAL_ID.ironOre]: {
    id: SETTLEMENT_MATERIAL_ID.ironOre,
    name: "철광석",
    description:
      "채석장에서 캐낸 철광석. 정착지(길드·개인) 발전에 기부하거나 거래소에 내다 팔 수 있다.",
  },
} as const;

// 드랍 종류 → 정착지 재화 키(기부 적립 매핑·PR-2b 가 사용). 통나무→crop / 철광석→ore.
export const SETTLEMENT_MATERIAL_TO_KIND: Record<string, ProductionKind> = {
  [SETTLEMENT_MATERIAL_ID.timber]: "crop",
  [SETTLEMENT_MATERIAL_ID.ironOre]: "ore",
};

// 사냥 드랍 다이얼. 2026-07: 통나무는 벌목장으로 주 수급처를 옮기며 0으로 잠근다.
// 철광석도 채광 미니게임으로 주 수급처를 옮기며 0으로 잠근다. huntDrops 는 기존
// Math.random 호출 순서 보존을 위해 rollSettlementMaterialDrops 자체는 계속 호출한다.
export const SETTLEMENT_MATERIAL_DROP_PCT: Record<string, number> = {
  [SETTLEMENT_MATERIAL_ID.timber]: 0,
  [SETTLEMENT_MATERIAL_ID.ironOre]: 0,
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
