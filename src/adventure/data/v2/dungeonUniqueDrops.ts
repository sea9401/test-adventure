// v2 던전 유니크 드랍 — 드랍 전용 유니크(상점·제작 불가)의 초저확률 별도 롤.
// 정규 장비 드랍(dungeonEquipDrops, rollEquipDrop) 위에 얹는 별개 굴림.
//
// PR-5(Phase 1) 스캐폴드 → PR-6(Phase 2): 유니크 6종 populate + floors 1~5 시그니처 풀
// (초저확률) + hunt 라우트 배선 완료. 5층은 2종(별을 가르는 단검·현자의 인장). 6~8층(엔드)은
// 후속. 확률(0.003~0.005)은 sim/라이브 다이얼.
//
// 유니크 = id당 1개(ownedSet 제외) — 정규 장비와 동일 unique-per-id.

import type { DungeonFloorId } from "./types";
import { V2_EQUIPMENT, isUnique, type V2EquipmentId } from "./v2Equipment";

// 카탈로그의 유니크 id 목록 (rarity:"unique"). Phase 2: 6종.
export const V2_UNIQUE_IDS: V2EquipmentId[] = (
  Object.keys(V2_EQUIPMENT) as V2EquipmentId[]
).filter((id) => isUnique(V2_EQUIPMENT[id]));

// 층별 유니크 풀 — chance(초저확률) + 후보 id. 정규 드랍과 분리된 별도 굴림.
// Phase 1: 전 층 빈 풀(chance 0, ids []) → 항상 null. Phase 2 에서 층/보스 시그니처로 채움.
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
  // 6~8 층(엔드)은 후속 — 빈 풀.
  6: { chance: 0, ids: [] },
  7: { chance: 0, ids: [] },
  8: { chance: 0, ids: [] },
};

// 유니크 드랍 굴림(순수). rng() ∈ [0, 1). rollEquipDrop 패턴 미러:
//   1) 통과 굴림 (pool.chance × chanceMult, 1 cap)
//   2) 보유 제외 후보 균등 pick
// 빈 풀 / chance 0 / 후보 0(전부 보유) → null. Phase 1 은 항상 null(빈 풀, rng 미소비).
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
// pool.chance = 풀 통과(총 드랍률). 통과 시 후보 균등 pick → 후보(미보유) 1종당 chance/len.
//   마른 협곡 = 11종 × 0.5% → chance 0.055(시작 시 종류당 0.5%). 보유분 제외돼 후보가 줄면
//   남은 종류 확률이 올라간다(수집 가속 = 컬렉션 추격). ← 드랍률 다이얼.
export type BandUniquePool = {
  /** 밴드 시작 깊이(포함). */
  minDepth: number;
  /** 밴드 끝 깊이(포함). */
  maxDepth: number;
  /** 사냥 1회당 풀 통과 확률 [0, 1] = 총 드랍률. 후보 균등 분배. */
  chance: number;
  /** 통과 시 후보 유니크 id. 이미 보유한 건 제외하고 균등 pick. */
  ids: V2EquipmentId[];
};

export const BAND_UNIQUE_POOLS: readonly BandUniquePool[] = [
  {
    // 마른 협곡(밴드 A, 깊이 13~18). 무기 8(8 무기타입 1종씩) + 마른땅 갑주 3 + 바위문 수호구 3
    // + 모래바람 장신구 2 = 16종. chance 0.08 / 16 균등 → 시작 시 종류당 0.5%(종 추가 시 chance 비례 조정).
    minDepth: 13,
    maxDepth: 18,
    chance: 0.08,
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
    // chance 0.08 / 16 균등 → 시작 시 종류당 0.5%.
    minDepth: 19,
    maxDepth: 24,
    chance: 0.08,
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
];

// 깊이 → 밴드 유니크 풀(없으면 null). 밴드는 겹치지 않게 정의.
export function bandUniquePoolForDepth(depth: number): BandUniquePool | null {
  for (const p of BAND_UNIQUE_POOLS) {
    if (depth >= p.minDepth && depth <= p.maxDepth) return p;
  }
  return null;
}

// 밴드 유니크 드랍 굴림(순수) — rollUniqueDrop 의 깊이-밴드 버전. rng() ∈ [0, 1).
// 밴드 밖 깊이 → pool null → rng 미소비하고 null(레거시 floor 롤과 ?? 합성해도 rng 안 샘).
export function rollBandUniqueDrop(
  depth: number,
  ownedSet: ReadonlySet<V2EquipmentId>,
  rng: () => number,
  // 통과 굴림 chance 배율. 미지정 1. chance×배율(1 cap).
  chanceMult: number = 1,
): V2EquipmentId | null {
  const pool = bandUniquePoolForDepth(depth);
  if (!pool || pool.chance <= 0 || pool.ids.length === 0) return null;
  if (rng() >= Math.min(1, pool.chance * chanceMult)) return null;
  const candidates = pool.ids.filter((id) => !ownedSet.has(id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}
