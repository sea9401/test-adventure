// v2 던전 장비 드랍 — 사용자 결정: 장비는 던전 전담.
// 거점·토너먼트·본전쟁·아레나는 골드/EXP/점수/자원만, 장비 X.
//
// 자료구조: 층별로 (chance, tierWeights). 한 사냥당 장비 굴림 1회 — rng() 가 chance
// 미만이면 통과. 통과 시 tierWeights 가중 랜덤으로 티어 선택, 그 티어 안에서 컨셉
// 균등 랜덤. 이미 보유한 id 는 후보에서 제외 (장비는 unique).
//
// 컨셉 균등 = "어떤 빌드든 펜션 비슷한 속도" 의 단순화. PR-4 sim 캘리브 단계에서 가중·
// 확률 튜닝.

import type { DungeonFloorId } from "./types";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
  type V2EquipTier,
} from "./v2Equipment";

export type FloorEquipDropPool = {
  /** 사냥 1회당 장비 굴림 확률 [0, 1]. */
  chance: number;
  /** 통과 시 가중 티어 pick. 합산 가중치 = 분모. */
  tierWeights: Partial<Record<V2EquipTier, number>>;
};

// 곡선 — 층 올라갈수록 chance 상승 + 고티어 가중치 상승.
// 1~5 성장 5층은 옛 1·2 사이를 부드럽게 보간. 6~8 엔드는 옛 3·4·5 그대로.
export const EQUIP_FLOOR_POOLS: Record<DungeonFloorId, FloorEquipDropPool> = {
  1: { chance: 0.15, tierWeights: { 1: 7, 2: 2 } },
  2: { chance: 0.15, tierWeights: { 1: 5, 2: 3, 3: 1 } },
  3: { chance: 0.16, tierWeights: { 1: 3, 2: 5, 3: 2 } },
  4: { chance: 0.17, tierWeights: { 2: 4, 3: 5, 4: 2 } },
  5: { chance: 0.18, tierWeights: { 2: 3, 3: 5, 4: 3, 5: 1 } },
  6: { chance: 0.22, tierWeights: { 3: 3, 4: 5, 5: 3 } },
  7: { chance: 0.28, tierWeights: { 4: 3, 5: 7 } },
  8: { chance: 0.35, tierWeights: { 5: 10 } },
};

const VALID_TIERS: ReadonlySet<V2EquipTier> = new Set<V2EquipTier>([1, 2, 3, 4, 5]);

// 결정적 테스트 + 서버 무작위 모두 같은 함수 시그니처. rng() ∈ [0, 1).
// 굴림 실패·티어 후보 풀 0·이미 다 보유 → null.
//
// rng 호출 순서:
//   1) 통과 굴림 (pool.chance)
//   2) 통과 시 티어 pick
//   3) 티어 안에서 보유 제외 후 컨셉 균등 pick
export function rollEquipDrop(
  floor: DungeonFloorId,
  ownedSet: ReadonlySet<V2EquipmentId>,
  rng: () => number,
): V2EquipmentId | null {
  const pool = EQUIP_FLOOR_POOLS[floor];
  if (!pool) return null;

  // 1) 통과 굴림
  if (rng() >= pool.chance) return null;

  // 2) 티어 가중 pick
  const tiers: V2EquipTier[] = [];
  let totalWeight = 0;
  for (const k of Object.keys(pool.tierWeights)) {
    const t = Number(k) as V2EquipTier;
    if (!VALID_TIERS.has(t)) continue;
    const w = pool.tierWeights[t] ?? 0;
    if (w <= 0) continue;
    tiers.push(t);
    totalWeight += w;
  }
  if (totalWeight <= 0 || tiers.length === 0) return null;

  let roll = rng() * totalWeight;
  let pickedTier: V2EquipTier = tiers[tiers.length - 1];
  for (const t of tiers) {
    const w = pool.tierWeights[t] ?? 0;
    if (roll < w) {
      pickedTier = t;
      break;
    }
    roll -= w;
  }

  // 3) 같은 티어의 후보 — 이미 보유 제외 후 균등 pick.
  // 모두 보유면 null (PR-3 단순화, PR-4 에서 다른 티어 fallback 여부 결정).
  const candidates: V2EquipmentId[] = [];
  for (const item of Object.values(V2_EQUIPMENT)) {
    if (item.tier !== pickedTier) continue;
    if (ownedSet.has(item.id)) continue;
    candidates.push(item.id);
  }
  if (candidates.length === 0) return null;

  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx];
}
