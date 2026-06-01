// v2 던전 유니크 드랍 — 드랍 전용 유니크(상점·제작 불가)의 초저확률 별도 롤.
// 정규 장비 드랍(dungeonEquipDrops, rollEquipDrop) 위에 얹는 별개 굴림.
//
// 제작 척추 PR-5(Phase 1)는 **스캐폴드만** — 실제 유니크 0종, UNIQUE_FLOOR_POOLS 도 빈 풀이라
// rollUniqueDrop 은 항상 null. Phase 2 에서 V2_EQUIPMENT 에 rarity:"unique" 항목을 추가하고
// (층/보스 시그니처) 여기 풀을 채운 뒤 hunt 라우트에 배선한다. 그때까지 사냥에 무영향.
//
// 유니크 = id당 1개(ownedSet 제외) — 정규 장비와 동일 unique-per-id.

import type { DungeonFloorId } from "./types";
import { V2_EQUIPMENT, isUnique, type V2EquipmentId } from "./v2Equipment";

// 카탈로그의 유니크 id 목록 (rarity:"unique"). Phase 1 은 0종.
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
  1: { chance: 0, ids: [] },
  2: { chance: 0, ids: [] },
  3: { chance: 0, ids: [] },
  4: { chance: 0, ids: [] },
  5: { chance: 0, ids: [] },
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
