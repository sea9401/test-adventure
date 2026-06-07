// v2 던전 유니크 드랍 — 드랍 전용 유니크(상점·제작 불가)의 초저확률 별도 롤.
// 정규 장비 드랍(dungeonEquipDrops, rollEquipDrop) 위에 얹는 별개 굴림.
//
// 두 갈래:
//   ① 레거시 층 풀(UNIQUE_FLOOR_POOLS, floor 1~8 키): 들판 구간(깊이 1~6)의 유니크 6종.
//      5층은 2종(별을 가르는 단검·현자의 인장). 확률 0.003~0.005.
//   ② 심층 밴드 풀(BAND_UNIQUE_POOLS, 깊이 범위 키): 프론티어 밴드 드랍. 밴드마다 16종
//      (무기 8 + 세트 3종 8), chance 0.01 = 1회 사냥당 총 1%(1종당 ≈0.06%). 현재 마른 협곡(13~18)·얼음 호수
//      (19~24)·심층 동굴(25~30) 3밴드 = 48종. 신규 밴드는 BAND_UNIQUE_POOLS 에 항목 1개 추가.
//
// 유니크 = id당 1개(ownedSet 제외) — 정규 장비와 동일 unique-per-id.

import type { DungeonFloorId } from "./types";
import { V2_EQUIPMENT, isUnique, type V2EquipmentId } from "./v2Equipment";

// 카탈로그의 유니크 id 목록 (rarity:"unique"). 현재 54종(레거시 6 + 밴드 드랍 48).
export const V2_UNIQUE_IDS: V2EquipmentId[] = (
  Object.keys(V2_EQUIPMENT) as V2EquipmentId[]
).filter((id) => isUnique(V2_EQUIPMENT[id]));

// 층별 유니크 풀(레거시) — chance(초저확률) + 후보 id. 정규 드랍과 분리된 별도 굴림.
// 1~5층 채움(들판 구간 유니크 6종), 6~8층은 빈 풀(심층은 BAND_UNIQUE_POOLS 가 담당).
export type UniqueFloorPool = {
  /** 사냥 1회당 유니크 굴림 확률 [0, 1]. 초저확률 예정(0.001~0.005대). */
  chance: number;
  /** 통과 시 후보 유니크 id. 이미 보유한 건 제외하고 균등 pick. */
  ids: V2EquipmentId[];
};

export const UNIQUE_FLOOR_POOLS: Record<DungeonFloorId, UniqueFloorPool> = {
  1: { chance: 0.003, ids: ["v2_uniq_shadow_garb"] },
  2: { chance: 0.003, ids: ["v2_uniq_trickster_boots"] },
  3: { chance: 0.0035, ids: ["v2_uniq_giant_fist"] },
  4: { chance: 0.004, ids: ["v2_uniq_berserker_fang"] },
  5: { chance: 0.005, ids: ["v2_uniq_starcleaver", "v2_uniq_sage_seal"] },
  // 6~8 층은 빈 풀 — 깊은 산(7~12)+ 심층은 BAND_UNIQUE_POOLS(깊이 키)가 담당.
  6: { chance: 0, ids: [] },
  7: { chance: 0, ids: [] },
  8: { chance: 0, ids: [] },
};

// 유니크 드랍 굴림(순수). rng() ∈ [0, 1). rollEquipDrop 패턴 미러:
//   1) 통과 굴림 (pool.chance × chanceMult, 1 cap)
//   2) 보유 제외 후보 균등 pick
// 빈 풀 / chance 0 / 후보 0(전부 보유) → null(빈 풀이면 rng 미소비).
export function rollUniqueDrop(
  floor: DungeonFloorId,
  ownedSet: ReadonlySet<V2EquipmentId>,
  rng: () => number,
  // 통과 굴림 chance 배율(신참 보너스 등). 미지정 1. chance×배율(1 cap).
  chanceMult: number = 1,
): V2EquipmentId | null {
  const pool = UNIQUE_FLOOR_POOLS[floor];
  if (!pool || pool.chance <= 0 || pool.ids.length === 0) return null;
  if (rng() >= Math.min(1, pool.chance * chanceMult)) return null;
  const candidates = pool.ids.filter((id) => !ownedSet.has(id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

// ── 프론티어 깊이 밴드 유니크 (심층 13+) ───────────────────────────────────────
// 층(floor 1~8) 기반 레거시 UNIQUE_FLOOR_POOLS 와 별개로 **깊이 범위**로 키. 심층 프론티어
// 밴드 콘텐츠 전용 유니크 드랍. 마른 협곡(13~18)부터.
//
// pool.chance = 풀 통과(총 드랍률). 통과 시 전 종류 균등 pick → 1종당 chance/len.
//   chance = 1회 사냥당 총 드랍률(현 0.01 = 1%), 1종당 chance/len(16종 → ≈0.06%). **중복 드랍 허용**
//   (2026-06-08): 보유분 포함 전 종류 균등이라 같은 종류도 새 굴림으로 재드랍(god-roll/편차 추격),
//   다 모아도 드랍 계속. ← 드랍률 다이얼(2026-06-08 0.08→0.01: 8%/판이 과해 1%/판으로 하향).
export type BandUniquePool = {
  /** 밴드 시작 깊이(포함). */
  minDepth: number;
  /** 밴드 끝 깊이(포함). */
  maxDepth: number;
  /** 사냥 1회당 풀 통과 확률 [0, 1] = 총 드랍률. 전 종류 균등 분배. */
  chance: number;
  /** 통과 시 후보 id. 전 종류 균등 pick(중복 드랍 허용 — 보유분 포함). */
  ids: V2EquipmentId[];
};

export const BAND_UNIQUE_POOLS: readonly BandUniquePool[] = [
  {
    // 마른 협곡(밴드 A, 깊이 13~18). 무기 8(8 무기타입 1종씩) + 마른땅 갑주 3 + 바위문 수호구 3
    // + 모래바람 장신구 2 = 16종. chance 0.01(총 1%) / 16 균등 → 종류당 ≈0.06%(중복 허용·고정 균등).
    minDepth: 13,
    maxDepth: 18,
    chance: 0.01,
    ids: [
      "v2_canyon_greatsword",
      "v2_canyon_knightblade",
      "v2_canyon_rapier",
      "v2_canyon_gauntlet",
      "v2_canyon_claw",
      "v2_canyon_staff",
      "v2_canyon_bow",
      "v2_canyon_dagger",
      "v2_canyon_set_armor",
      "v2_canyon_set_gloves",
      "v2_canyon_set_boots",
      "v2_canyon_bulwark_armor",
      "v2_canyon_bulwark_gloves",
      "v2_canyon_bulwark_boots",
      "v2_canyon_sand_ring",
      "v2_canyon_sand_necklace",
    ],
  },
  {
    // 얼음 호수(밴드 B, 깊이 19~24). 무기 8 + 서리 갑주 3 + 빙벽 수호구 3 + 한기 장신구 2 = 16종.
    // chance 0.01(총 1%) / 16 균등 → 종류당 ≈0.06%(중복 허용·고정 균등).
    minDepth: 19,
    maxDepth: 24,
    chance: 0.01,
    ids: [
      "v2_lake_greatsword",
      "v2_lake_knightblade",
      "v2_lake_rapier",
      "v2_lake_gauntlet",
      "v2_lake_claw",
      "v2_lake_staff",
      "v2_lake_bow",
      "v2_lake_dagger",
      "v2_lake_frost_armor",
      "v2_lake_frost_gloves",
      "v2_lake_frost_boots",
      "v2_lake_bulwark_armor",
      "v2_lake_bulwark_gloves",
      "v2_lake_bulwark_boots",
      "v2_lake_chill_ring",
      "v2_lake_chill_necklace",
    ],
  },
  {
    // 심층 동굴(밴드 C, 깊이 25~30). 무기 8 + 심연 갑주 3 + 흑요 수호구 3 + 공허 장신구 2 = 16종.
    // chance 0.01(총 1%) / 16 균등 → 종류당 ≈0.06%(중복 허용·고정 균등).
    minDepth: 25,
    maxDepth: 30,
    chance: 0.01,
    ids: [
      "v2_cave_greatsword",
      "v2_cave_knightblade",
      "v2_cave_rapier",
      "v2_cave_gauntlet",
      "v2_cave_claw",
      "v2_cave_staff",
      "v2_cave_bow",
      "v2_cave_dagger",
      "v2_cave_abyss_armor",
      "v2_cave_abyss_gloves",
      "v2_cave_abyss_boots",
      "v2_cave_obsidian_armor",
      "v2_cave_obsidian_gloves",
      "v2_cave_obsidian_boots",
      "v2_cave_void_ring",
      "v2_cave_void_necklace",
    ],
  },
];

// 깊이 → 밴드 유니크 풀(없으면 null). 밴드는 겹치지 않게 정의.
export function bandUniquePoolForDepth(depth: number): BandUniquePool | null {
  for (const p of BAND_UNIQUE_POOLS) {
    if (depth >= p.minDepth && depth <= p.maxDepth) return p;
  }
  return null;
}

// 밴드 유니크 드랍 굴림(순수) — rollEquipDrop 처럼 **중복 드랍 허용**(2026-06-08 사용자 요청).
// 보유분도 후보에 포함 → 같은 종류도 새 굴림으로 재드랍(god-roll/편차 추격), 16종 다 모아도
// 드랍 계속(컬렉션 다 채워도 끝나지 않음). 프론티어 밴드 장비=컬렉션이 아니라 무한 파밍 풀.
// (레거시 rollUniqueDrop[1~8층 시그니처 유니크]은 dedup 유지 — 거긴 진짜 종류당 1개 유니크.)
// 밴드 밖 깊이 → pool null → rng 미소비하고 null(레거시 floor 롤과 ?? 합성해도 rng 안 샘).
export function rollBandUniqueDrop(
  depth: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 중복 드랍 허용 후 미사용(시그니처 유지, rollEquipDrop 대칭)
  ownedSet: ReadonlySet<V2EquipmentId>,
  rng: () => number,
  // 통과 굴림 chance 배율. 미지정 1. chance×배율(1 cap).
  chanceMult: number = 1,
): V2EquipmentId | null {
  const pool = bandUniquePoolForDepth(depth);
  if (!pool || pool.chance <= 0 || pool.ids.length === 0) return null;
  if (rng() >= Math.min(1, pool.chance * chanceMult)) return null;
  // 중복 드랍 허용 — 보유분 제외 안 함(전 종류 균등 pick). ownedSet 미사용.
  return pool.ids[Math.floor(rng() * pool.ids.length)];
}

// 코덱스(모험의 서) 사냥터 도감용 — 깊이 [start, end] 구간에서 떨어질 수 있는 유니크 id 목록.
//   floor 풀(1~8, 레거시 시그니처)과 밴드 풀(깊이 범위)을 합집합. 굴림 안 함(표시 전용).
export function uniqueIdsForDepthRange(
  start: number,
  end: number,
): V2EquipmentId[] {
  const ids = new Set<V2EquipmentId>();
  const lo = Math.max(1, Math.floor(start));
  const hi = Math.floor(end);
  for (let d = lo; d <= Math.min(hi, 8); d++) {
    const pool = UNIQUE_FLOOR_POOLS[d as DungeonFloorId];
    if (pool && pool.chance > 0) for (const id of pool.ids) ids.add(id);
  }
  for (const p of BAND_UNIQUE_POOLS) {
    if (p.chance > 0 && p.maxDepth >= start && p.minDepth <= end)
      for (const id of p.ids) ids.add(id);
  }
  return [...ids];
}
