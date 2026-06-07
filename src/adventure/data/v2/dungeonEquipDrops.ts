// v2 던전 장비 드랍 — 사용자 결정: 장비는 던전 전담.
// 거점·토너먼트·본전쟁·아레나는 골드/EXP/점수/자원만, 장비 X.
//
// 자료구조: 층별로 (chance, tierWeights). 한 사냥당 장비 굴림 1회 — rng() 가 chance
// 미만이면 통과. 통과 시 tierWeights 가중 랜덤으로 티어 선택, 그 티어 안에서 컨셉
// 균등 랜덤. 이미 보유한 id 는 후보에서 제외 (장비는 unique).
//
// 컨셉 균등 = "어떤 빌드든 펜션 비슷한 속도" 의 단순화. PR-4 sim 캘리브 단계에서 가중·
// 확률 튜닝.

import {
  V2_EQUIPMENT,
  isUnique,
  type V2EquipmentId,
  type V2EquipTier,
} from "./v2Equipment";

export type FloorEquipDropPool = {
  /** 사냥 1회당 장비 굴림 확률 [0, 1]. */
  chance: number;
  /** 통과 시 가중 티어 pick. 합산 가중치 = 분모. */
  tierWeights: Partial<Record<V2EquipTier, number>>;
};

// 드랍 = 스타터 구간(들판/깊은산, 깊이 1~12)에서만. 단일 풀 균일 — 깊이별 램프 없이 한 값.
//   처치당 T1 3% / T2 2% / T3 1% (총 6%, 고티어일수록 희귀). 티어 = "초보자 졸업 키트"(진행 축
//   아님, 표기 숨김 #525). 프론티어(깊이 13+)는 밴드 콘텐츠(C) 구간이라 정규 티어 드랍 없음.
//   신참 보너스는 EXP 전용(드랍 ×1 고정, hunt route). ← 드랍률 다이얼.
export const STARTER_END_DEPTH = 12; // 들판(1~6) + 깊은산(7~12) = 스타터 구간
export const STARTER_DROP_POOL: FloorEquipDropPool = {
  chance: 0.06, // 총 드랍률. tierWeights 3:2:1 → 처치당 T1 3% / T2 2% / T3 1%.
  tierWeights: { 1: 3, 2: 2, 3: 1 },
};

// 깊이 → 드랍 풀. 스타터 구간(1~12)만 풀, 프론티어(13+)는 null(밴드 콘텐츠 C 전 정규 드랍 없음).
export function dropPoolForDepth(depth: number): FloorEquipDropPool | null {
  if (depth >= 1 && depth <= STARTER_END_DEPTH) return STARTER_DROP_POOL;
  return null;
}

const VALID_TIERS: ReadonlySet<V2EquipTier> = new Set<V2EquipTier>([1, 2, 3]);

// 결정적 테스트 + 서버 무작위 모두 같은 함수 시그니처. rng() ∈ [0, 1).
// 굴림 실패·티어 후보 풀 0·이미 다 보유 → null.
//
// rng 호출 순서:
//   1) 통과 굴림 (pool.chance)
//   2) 통과 시 티어 pick
//   3) 티어 안에서 컨셉 균등 pick (보유분 포함 — 중복 드랍 허용)
//
// ⚠️ 중복 드랍(no-dup off): 보유한 종류도 후보에 포함 → 같은 종류가 새 굴림으로 재드랍.
//   god-roll 추격 엔진(편차 0.65 와 짝). ownedSet 은 더 이상 후보 필터에 안 쓰지만 시그니처는
//   유지(호출부·rollUniqueDrop 대칭 — 유니크는 dedup 유지). 첫카피 보호 없음(순수 균등 랜덤).
export function rollEquipDrop(
  depth: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 중복 드랍 허용 후 미사용(시그니처 유지)
  ownedSet: ReadonlySet<V2EquipmentId>,
  rng: () => number,
  // 통과 굴림 chance 배율 — 신참 보너스(Lv30 미만 ×2) 등. 미지정 1. chance×배율(1 cap).
  chanceMult: number = 1,
): V2EquipmentId | null {
  // 스타터 구간(1~12)만 드랍. 프론티어(13+)는 풀 없음(null) → 정규 드랍 없음.
  const pool = dropPoolForDepth(depth);
  if (!pool) return null;

  // 1) 통과 굴림
  if (rng() >= Math.min(1, pool.chance * chanceMult)) return null;

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

  // 3) 같은 티어의 후보 — 균등 pick. 보유분 포함(중복 드랍 허용) → 보유한 종류도 새 굴림으로
  //    재드랍해 god-roll 추격이 성립. (드랍 전용 제외만 적용 — 유니크/제작/스타터/noDrop.)
  const candidates: V2EquipmentId[] = [];
  for (const item of Object.values(V2_EQUIPMENT)) {
    if (item.tier !== pickedTier) continue;
    // 유니크는 정규 드랍 후보에서 제외 — 드랍 전용 유니크는 rollUniqueDrop(별도 초저확률
    // 롤)로만 나온다. 이게 빠지면 Phase 2 유니크가 정규 티어 드랍으로 새 나간다.
    if (isUnique(item)) continue;
    // 제작 전용·전문화 스타터도 정규 드랍 제외 — 레시피/전직 지급으로만 획득.
    if (item.craftOnly || item.starterOnly) continue;
    // 드랍 제외(noDrop) — 전문화 무기는 상점 전용(드랍은 후속 추가 예정).
    if (item.noDrop) continue;
    candidates.push(item.id);
  }
  if (candidates.length === 0) return null; // 티어에 드랍 가능 종류가 0(데이터상)일 때만

  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx];
}
