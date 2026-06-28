// v2 던전 유니크 드랍 — 드랍 전용 유니크(상점·제작 불가)의 초저확률 별도 롤.
// 정규 장비 드랍(dungeonEquipDrops, rollEquipDrop) 위에 얹는 별개 굴림.
//
// 두 갈래:
//   ① 레거시 층 풀(UNIQUE_FLOOR_POOLS, floor 1~8 키): 들판 구간(깊이 1~6)의 유니크 6종.
//      5층은 2종(별을 가르는 단검·현자의 인장). 확률 0.003~0.005.
//   ② 심층 밴드 풀(깊이 범위 키): 프론티어 밴드 드랍. BAND_COMMON_POOLS(흔한 밴드 장비, 로컬 깊이
//      램프) + BAND_UNIQUE_POOLS. 2026-06-26 **유니크 재정의**: 옛 필드 유니크(굴림 사이드그레이드)는
//      `common` 강등→COMMON 풀로 이동, UNIQUE 풀엔 **이름 있는 고유 아이템(Signature)** 만(잊힌 성소
//      25+·밴드당 5종·chance 0.0005). 7~24 밴드 UNIQUE 풀은 비었다(게이트 전). 상세 = BAND_UNIQUE_POOLS 위 주석.
//
// 밴드 드랍은 중복 허용(보유분 포함 균등 pick). 레거시 층 유니크만 id당 1개(ownedSet 제외).

import type { DungeonFloorId } from "./types";
import { V2_EQUIPMENT, isUnique, type V2EquipmentId } from "./v2Equipment";

// 카탈로그의 유니크 id 목록 (rarity:"unique"). 세트 통합(38→12) 후 대폭 축소(특화 세트 제거).
//   밴드 흔한 장비(무기·기본세트)는 noDrop normal 로 분리(BAND_COMMON_POOLS) — 유니크 아님.
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
  // 들판 유니크 6종 전부 삭제(2026-06-19, 초반 정리). 들판 구간은 정규 그리드만 드랍
  //   (특수 드랍 없음·온보딩 단순화).
  //   심층 유니크는 BAND_UNIQUE_POOLS(깊이 키)가 담당.
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

// ── 프론티어 깊이 밴드 유니크 (심층 7+) ───────────────────────────────────────
// 층(floor 1~8) 기반 레거시 UNIQUE_FLOOR_POOLS 와 별개로 **깊이 범위**로 키. 심층 프론티어
// 밴드 콘텐츠 전용 유니크 드랍. 마른 협곡(7~12)부터.
//
// pool.chance = 풀 통과(총 드랍률). 통과 시 전 종류 균등 pick → 1종당 chance/len.
//   chance = 1회 사냥당 총 드랍률(현 0.005 = 0.5%), 1종당 chance/len. **중복 드랍 허용**
//   (2026-06-08): 보유분 포함 전 종류 균등이라 같은 종류도 새 굴림으로 재드랍(god-roll/편차 추격),
//   다 모아도 드랍 계속. ← 드랍률 다이얼(0.08→0.01→0.005: 라이브 체감 과해 단계적 하향, 2026-06-09).
// 밴드 장비를 흔한(normal·드랍 전용)/유니크(특화·추격) 두 풀로 분리(2026-06-09). 옛 BAND_UNIQUE_POOLS
//   는 밴드 전 장비를 rarity:"unique" 로 묶어 "전부 유니크 취급"이 됐다. 이제:
//   - 흔한 9종/밴드(무기 4 + 갑주세트 3 + 장신구 2) = noDrop normal. 빵앤버터 진행 장비.
//     드랍률 = 밴드 내 로컬 깊이(1~6) 램프(1·2→0.5% / 3·4→0.7% / 5·6→0.9%). droppedEquipment 슬롯.
//   - 유니크 = 비세트 컨셉 사이드그레이드(세트 통합 후 특화/2피스 세트 제거). chance 0.005
//     고정(어디서나 귀함·종당으로도 흔한보다 귀하게). droppedUnique 슬롯. 흔한과 별개 굴림(둘 다 가능).
export type BandPool = {
  /** 밴드 시작 깊이(포함). */
  minDepth: number;
  /** 밴드 끝 깊이(포함). */
  maxDepth: number;
  /** 통과 시 후보 id. 전 종류 균등 pick(중복 드랍 허용 — 보유분 포함). */
  ids: V2EquipmentId[];
};

// 흔한 밴드 장비 풀(noDrop normal). 무기 4 + 갑주세트 3 + 장신구 2 = 밴드당 9종.
export const BAND_COMMON_POOLS: readonly BandPool[] = [
  {
    // 마른 협곡(밴드 A, 7~12) 흔한 9: 무기 4 + 마른땅 갑주 세트 3 + 모래바람 장신구 2.
    minDepth: 7,
    maxDepth: 12,
    ids: [
      "v2_canyon_greatsword",
      "v2_canyon_staff",
      "v2_canyon_bow",
      "v2_canyon_dagger",
      "v2_canyon_set_armor",
      "v2_canyon_set_gloves",
      "v2_canyon_set_boots",
      "v2_canyon_sand_ring",
      "v2_canyon_sand_necklace",
      // 강등된 옛 필드 유니크(일반화·2026-06-26 유니크 재정의).
      "v2_canyon_swift_rapier",
      "v2_canyon_wind_boots",
    ],
  },
  {
    // 얼음 호수(밴드 B, 13~18) 흔한 9: 무기 4 + 서리 갑주 세트 3 + 한기 장신구 2.
    minDepth: 13,
    maxDepth: 18,
    ids: [
      "v2_lake_greatsword",
      "v2_lake_staff",
      "v2_lake_bow",
      "v2_lake_dagger",
      "v2_lake_frost_armor",
      "v2_lake_frost_gloves",
      "v2_lake_frost_boots",
      "v2_lake_chill_ring",
      "v2_lake_chill_necklace",
      // 강등된 옛 필드 유니크(일반화).
      "v2_lake_brutal_greatsword",
      "v2_lake_dodge_cloak",
    ],
  },
  {
    // 심층 동굴(밴드 C, 19~24) 흔한 9: 무기 4 + 심연 갑주 세트 3 + 공허 장신구 2.
    minDepth: 19,
    maxDepth: 24,
    ids: [
      "v2_cave_greatsword",
      "v2_cave_staff",
      "v2_cave_bow",
      "v2_cave_dagger",
      "v2_cave_abyss_armor",
      "v2_cave_abyss_gloves",
      "v2_cave_abyss_boots",
      "v2_cave_void_ring",
      "v2_cave_void_necklace",
      // 강등된 옛 필드 유니크(일반화).
      "v2_cave_fortress_armor",
      "v2_cave_rooted_boots",
      "v2_cave_ruin_gloves",
      "v2_cave_focus_ring",
    ],
  },
  {
    // 잊힌 성소(밴드 D, 25~30) 흔한 9: 무기 4 + 별무리 갑주 세트 3 + 성운 장신구 2.
    minDepth: 25,
    maxDepth: 30,
    ids: [
      "v2_sanctum_greatsword",
      "v2_sanctum_staff",
      "v2_sanctum_bow",
      "v2_sanctum_dagger",
      "v2_sanctum_set_armor",
      "v2_sanctum_set_gloves",
      "v2_sanctum_set_boots",
      "v2_sanctum_arcana_ring",
      "v2_sanctum_arcana_necklace",
      // 강등된 옛 필드 유니크(일반화).
      "v2_sanctum_anchor_armor",
      "v2_sanctum_nova_ring",
    ],
  },
  {
    // 리자드 늪지(밴드 E, 31~36) 흔한 9: 무기 4 + 독안개 갑주 세트 3 + 늪심장 장신구 2.
    minDepth: 31,
    maxDepth: 36,
    ids: [
      "v2_swamp_greatsword",
      "v2_swamp_staff",
      "v2_swamp_bow",
      "v2_swamp_dagger",
      "v2_swamp_set_armor",
      "v2_swamp_set_gloves",
      "v2_swamp_set_boots",
      "v2_swamp_heart_ring",
      "v2_swamp_heart_necklace",
      // 강등된 옛 필드 유니크(일반화).
      "v2_swamp_mire_boots",
      "v2_swamp_bruiser_armor",
    ],
  },
  {
    // 짐승의 소굴(밴드 F, 37~42) 흔한 9: 무기 4 + 포식자 갑주 세트 3 + 우두머리 장신구 2.
    minDepth: 37,
    maxDepth: 42,
    ids: [
      "v2_den_greatsword",
      "v2_den_staff",
      "v2_den_bow",
      "v2_den_dagger",
      "v2_den_set_armor",
      "v2_den_set_gloves",
      "v2_den_set_boots",
      "v2_den_alpha_ring",
      "v2_den_alpha_necklace",
      // 강등된 옛 필드 유니크(일반화).
      "v2_den_mauler_gloves",
      "v2_den_ghost_boots",
      "v2_den_hide_armor",
    ],
  },
  {
    // 검은 왕도(밴드 G, 43~48) — 태그 세트(흑철/공허 예복/왕도 사냥꾼) 첫 적용.
    // 난이도는 dungeonLadder 43+ 엔드 확장 램프가 담당하고, EXP/골드는 31+ 보상 완화 곡선으로 억제.
    minDepth: 43,
    maxDepth: 48,
    ids: [
      "v2_throne_greatsword",
      "v2_throne_staff",
      "v2_throne_bow",
      "v2_throne_dagger",
      "v2_throne_black_armor",
      "v2_throne_void_robe",
      "v2_throne_black_gloves",
      "v2_throne_hunt_gloves",
      "v2_throne_black_boots",
      "v2_throne_shadow_boots",
      "v2_throne_void_ring",
      "v2_throne_royal_necklace",
    ],
  },
];

// 흔한 밴드 장비 드랍률 — 모든 테마에서 로컬 깊이 기준으로 통일한다.
// 2026-06-28: 좋은 장비일수록 확률을 계속 올리지 않고, 테마별 1~2번 0.03% / 3~4번 0.045% /
//   5~6번 0.06% 정도로 고정. 구간이 깊어져도 "더 좋은 장비라 더 잘 나옴"이 되지 않게 한다.
export function bandCommonChance(localDepth: number): number {
  if (localDepth <= 2) return 0.0003;
  if (localDepth <= 4) return 0.00045;
  return 0.0006;
}

export function bandCommonDepthMult(depth: number): number {
  void depth;
  return 1;
}

export function bandCommonChanceForDepth(depth: number): number {
  const pool = bandCommonPoolForDepth(depth);
  if (!pool) return 0;
  const localDepth = depth - pool.minDepth + 1;
  return bandCommonChance(localDepth) * bandCommonDepthMult(depth);
}

export function bandCommonPoolForDepth(depth: number): BandPool | null {
  for (const p of BAND_COMMON_POOLS) {
    if (depth >= p.minDepth && depth <= p.maxDepth) return p;
  }
  return null;
}

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

// 밴드 유니크 풀 — 비(非)세트 컨셉 사이드그레이드 유니크. 세트 통합(38→12) 후 특화/2피스 세트는
//   제거돼 사이드그레이드만 남는다. 밴드 표준 2세트(갑주·장신구)는 BAND_COMMON_POOLS 에서 드랍.
// 🔑 유니크 재정의(2026-06-26·docs/v2-signature-uniques-plan.md): 옛 필드 유니크(굴림 사이드그레이드)는
//   특별하지 않아 `common`(일반)으로 강등 → BAND_COMMON_POOLS 로 이동. 유니크 풀엔 **이름 있는
//   고유 아이템(Signature)** 만 남아 "유니크 = 정말 특별한 것"이 됨. 게이트 = **잊힌 성소(25)부터** —
//   7~24 밴드는 빈 풀(유니크 없음·정규/흔한만). 25~42 = 밴드당 고유 5종, chance 0.0002(밴드유니크보다
//   희귀). droppedUnique 슬롯 → 바이올렛 배너 + unique_drop 전광판 방송(기존 인프라 그대로·강등 후 고유템만).
export const SIGNATURE_UNIQUE_CHANCE = 0.0002; // 고유 아이템 총 드랍률(밴드당)·다이얼. 0.0005→0.0002(더 귀하게).
export const BAND_UNIQUE_POOLS: readonly BandUniquePool[] = [
  // 마른 협곡(7~12)·얼음 호수(13~18)·심층 동굴(19~24) = 게이트 전 → 유니크 없음(빈 풀).
  { minDepth: 7, maxDepth: 12, chance: 0, ids: [] },
  { minDepth: 13, maxDepth: 18, chance: 0, ids: [] },
  { minDepth: 19, maxDepth: 24, chance: 0, ids: [] },
  {
    // 잊힌 성소(25~30) 고유 5종 — 회복·버팀(성물 세트 2 + 단품 3).
    minDepth: 25,
    maxDepth: 30,
    chance: SIGNATURE_UNIQUE_CHANCE,
    ids: [
      "v2_sanctum_sig_priest_armor",
      "v2_sanctum_sig_priest_necklace",
      "v2_sanctum_sig_spire_staff",
      "v2_sanctum_sig_priest_boots",
      "v2_sanctum_sig_sealed_ring",
    ],
  },
  {
    // 리자드 늪지(31~36) 고유 5종 — 회피·기동(독왕 세트 2 + 단품 3).
    minDepth: 31,
    maxDepth: 36,
    chance: SIGNATURE_UNIQUE_CHANCE,
    ids: [
      "v2_swamp_sig_venom_gloves",
      "v2_swamp_sig_slip_boots",
      "v2_swamp_sig_scale_armor",
      "v2_swamp_sig_fang_dagger",
      "v2_swamp_sig_fang_necklace",
    ],
  },
  {
    // 짐승의 소굴(37~42) 고유 5종 — 폭딜·글래스캐넌(포식자 세트 2 + 단품 3).
    minDepth: 37,
    maxDepth: 42,
    chance: SIGNATURE_UNIQUE_CHANCE,
    ids: [
      "v2_den_sig_alpha_greatsword",
      "v2_den_sig_beasthide_armor",
      "v2_den_sig_claw_gloves",
      "v2_den_sig_tracker_boots",
      "v2_den_sig_alpha_necklace",
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
  // 중복 드랍 허용 후 미사용(시그니처 유지, rollEquipDrop 대칭)
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

// 흔한 밴드 장비 드랍 굴림(순수) — 밴드/깊이별 확률(bandCommonChanceForDepth). 통과 시 전 종류
//   균등 pick(중복 드랍 허용). 밴드 밖 깊이 → null(rng 미소비, rollEquipDrop 결과와 ?? 합성 안전).
//   정규 장비 슬롯(droppedEquipment)로 드랍 — 스타터 정규 풀(rollEquipDrop)이 7+ 에서 null 이라 그 자리 채움.
export function rollBandCommonDrop(
  depth: number,
  rng: () => number,
  // 통과 굴림 chance 배율(신참 보너스 등). 미지정 1. chance×배율(1 cap).
  chanceMult: number = 1,
): V2EquipmentId | null {
  const pool = bandCommonPoolForDepth(depth);
  if (!pool || pool.ids.length === 0) return null;
  const chance = bandCommonChanceForDepth(depth);
  if (rng() >= Math.min(1, chance * chanceMult)) return null;
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
