// v2 던전 사냥의 placeholder 재료 드랍.
//
// "나중에 정리" 전제 — 라이브 MATERIALS 와 분리된 v2 전용 풀.
// id 는 v2_ 접두어로 충돌 회피. 정식 재료 시스템 들어올 때 통째 교체 예정.

import type { DungeonFloorId } from "./types";

// === 재료 정의 (placeholder) ========================================

export type V2MaterialId =
  | "v2_stone_chip"
  | "v2_herb"
  | "v2_slime_shard"
  | "v2_bone_fragment"
  | "v2_starlit_dust";

export type V2Material = {
  id: V2MaterialId;
  name: string;
  description: string;
};

export const V2_MATERIALS: Record<V2MaterialId, V2Material> = {
  v2_stone_chip: {
    id: "v2_stone_chip",
    name: "돌멩이",
    description: "흔히 굴러다니는 돌 조각. 가공하면 쓸 만하다.",
  },
  v2_herb: {
    id: "v2_herb",
    name: "약초",
    description: "들과 산에서 흔히 자라는 풀. 달여 마신다.",
  },
  v2_slime_shard: {
    id: "v2_slime_shard",
    name: "슬라임 조각",
    description: "물컹한 점액 덩어리. 묘하게 약효가 있다고 한다.",
  },
  v2_bone_fragment: {
    id: "v2_bone_fragment",
    name: "뼛조각",
    description: "오래된 뼈 부스러기. 의식이나 부적에 쓰인다.",
  },
  v2_starlit_dust: {
    id: "v2_starlit_dust",
    name: "별빛 가루",
    description: "별빛에 닿은 곳에서만 모이는 미세한 가루.",
  },
};

// === floor 별 드랍 풀 ===============================================
// chance = 0~1, 굴림 통과 시 [amountMin, amountMax] 사이 정수 개수 획득.
// 한 사냥에서 여러 row 가 동시에 통과할 수 있음 (독립 굴림).

export type DropRule = {
  id: V2MaterialId;
  chance: number;
  amountMin: number;
  amountMax: number;
};

export const FLOOR_DROP_POOLS: Record<DungeonFloorId, DropRule[]> = {
  // 1층 — 변경 입구 (Lv 1~5). 옛 1층 풀 그대로.
  1: [
    { id: "v2_stone_chip", chance: 0.5, amountMin: 1, amountMax: 2 },
    { id: "v2_herb", chance: 0.3, amountMin: 1, amountMax: 1 },
    { id: "v2_slime_shard", chance: 0.1, amountMin: 1, amountMax: 1 },
  ],
  // 2층 — 변경 외곽 (Lv 6~13). slime_shard 비율 ↑.
  2: [
    { id: "v2_stone_chip", chance: 0.5, amountMin: 1, amountMax: 2 },
    { id: "v2_herb", chance: 0.35, amountMin: 1, amountMax: 2 },
    { id: "v2_slime_shard", chance: 0.18, amountMin: 1, amountMax: 1 },
  ],
  // 3층 — 산악 평원 (Lv 18~28). bone_fragment 진입.
  3: [
    { id: "v2_stone_chip", chance: 0.45, amountMin: 1, amountMax: 3 },
    { id: "v2_herb", chance: 0.3, amountMin: 1, amountMax: 2 },
    { id: "v2_slime_shard", chance: 0.18, amountMin: 1, amountMax: 1 },
    { id: "v2_bone_fragment", chance: 0.12, amountMin: 1, amountMax: 1 },
  ],
  // 4층 — 화염 지대 (Lv 34~55). bone_fragment 비중 ↑.
  4: [
    { id: "v2_stone_chip", chance: 0.4, amountMin: 1, amountMax: 3 },
    { id: "v2_herb", chance: 0.3, amountMin: 1, amountMax: 2 },
    { id: "v2_bone_fragment", chance: 0.2, amountMin: 1, amountMax: 2 },
    { id: "v2_starlit_dust", chance: 0.08, amountMin: 1, amountMax: 1 },
  ],
  // 5층 — 별빛 회랑 (Lv 70~100). 옛 2층 풀 그대로 (starlit_dust 본격).
  5: [
    { id: "v2_stone_chip", chance: 0.4, amountMin: 1, amountMax: 3 },
    { id: "v2_herb", chance: 0.3, amountMin: 1, amountMax: 2 },
    { id: "v2_bone_fragment", chance: 0.2, amountMin: 1, amountMax: 1 },
    { id: "v2_starlit_dust", chance: 0.15, amountMin: 1, amountMax: 1 },
  ],
  // 6~8 층(엔드) 은 후속 PR 에서 채움. 빈 풀이라 사냥 보상 X.
  6: [],
  7: [],
  8: [],
};

// === 드랍 굴림 (순수 함수) ===========================================

export type DropResult = Partial<Record<V2MaterialId, number>>;

// rng() ∈ [0, 1). 빈 결과는 {} 반환.
export function rollDrops(
  floor: DungeonFloorId,
  rng: () => number,
): DropResult {
  const pool = FLOOR_DROP_POOLS[floor];
  const out: DropResult = {};
  for (const rule of pool) {
    if (rng() >= rule.chance) continue;
    const span = rule.amountMax - rule.amountMin + 1;
    const amount = rule.amountMin + Math.floor(rng() * span);
    if (amount <= 0) continue;
    out[rule.id] = (out[rule.id] ?? 0) + amount;
  }
  return out;
}

// === 누적 (캐릭 저장 머지) ==========================================

// 기존 materials map + 새 drops 를 합산. 입력 형태가 손상되어 있으면(객체 아님 등)
// 빈 시작으로 간주. id 가 V2MaterialId 가 아닌 항목은 보존(타 시스템 누적분 보호).
export function mergeDrops(
  existing: unknown,
  drops: DropResult,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (existing && typeof existing === "object") {
    for (const [k, v] of Object.entries(existing as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        out[k] = Math.floor(v);
      }
    }
  }
  for (const [id, amount] of Object.entries(drops)) {
    if (!amount || amount <= 0) continue;
    out[id] = (out[id] ?? 0) + amount;
  }
  return out;
}
