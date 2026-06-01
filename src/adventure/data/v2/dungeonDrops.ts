// v2 던전 사냥의 재료 드랍.
//
// 라이브 MATERIALS 와 분리된 v2 전용 풀 (id 는 v2_ 접두어로 충돌 회피).
//
// 제작 척추 재설계 (2026-06, docs/v2-item-crafting-plan.md): 옛 범용 5종(돌멩이·약초·
// 슬라임조각·뼛조각·별빛가루)을 **계열 정체성**을 가진 15종으로 확장. 계열 = 어느 장비군에
// 쓰이나 + 어느 구역(층)에서 나오나:
//   - 금속 계열: 거친 광석 → 강철 주괴 → 미스릴 원석 (검·중갑).
//   - 가죽/직물 계열: 질긴 가죽 → 비단실 → 바람결 천 (경갑·활).
//   - 마력 계열: 마력 가루 → 룬 조각 → 비전 수정 (지팡이·반지·목걸이).
//   - 공용: 약초·슬라임조각·뼛조각·짐승 힘줄·별빛 가루 (계열 무관 접착 + 티어 게이트).
// 층마다 계열을 편향(산악=금속↑, 별빛=마력·T5) → 장비군마다 다른 사냥터로 보낸다.
//
// ⚠️ 마이그레이션: 옛 5종 id 는 **개명/제거 없이 전부 보존** (보유분 비파괴, mergeDrops
//    원칙). 늘어난 재료 종 수는 V2_CODEX_TOTAL(전직 도감 분모)을 키운다 — codexRequirement
//    가 min(요건, 총량) 클램프라 전직 요건 절대값(3·5개)은 불변(비파괴). docs 참고.

import type { DungeonFloorId } from "./types";

// === 재료 정의 ======================================================

export type V2MaterialId =
  // 공용 (계열 무관 — 저~중티어 접착 + 별빛가루 T5 게이트)
  | "v2_stone_chip"
  | "v2_herb"
  | "v2_slime_shard"
  | "v2_bone_fragment"
  | "v2_beast_sinew"
  | "v2_starlit_dust"
  // 금속 계열 (검·중갑)
  | "v2_rough_ore"
  | "v2_steel_ingot"
  | "v2_mithril_ore"
  // 가죽/직물 계열 (경갑·활)
  | "v2_tough_hide"
  | "v2_silk_thread"
  | "v2_windweave_cloth"
  // 마력 계열 (지팡이·반지·목걸이)
  | "v2_mana_dust"
  | "v2_rune_shard"
  | "v2_arcane_crystal";

export type V2Material = {
  id: V2MaterialId;
  name: string;
  description: string;
};

export const V2_MATERIALS: Record<V2MaterialId, V2Material> = {
  // ── 공용 ────────────────────────────────────────────────────────
  v2_stone_chip: {
    id: "v2_stone_chip",
    name: "돌멩이",
    description: "흔히 굴러다니는 돌 조각. 다듬어 받침이나 숫돌로 쓴다.",
  },
  v2_herb: {
    id: "v2_herb",
    name: "약초",
    description: "들과 산에서 흔히 자라는 풀. 달여 마신다.",
  },
  v2_slime_shard: {
    id: "v2_slime_shard",
    name: "슬라임 조각",
    description: "물컹한 점액 덩어리. 끈끈해서 무언가를 이어 붙일 때 쓴다.",
  },
  v2_bone_fragment: {
    id: "v2_bone_fragment",
    name: "뼛조각",
    description: "오래된 뼈 부스러기. 단단해 손잡이나 보강재로 쓰인다.",
  },
  v2_beast_sinew: {
    id: "v2_beast_sinew",
    name: "짐승 힘줄",
    description: "질긴 짐승의 힘줄. 활시위나 매듭에 더없이 알맞다.",
  },
  v2_starlit_dust: {
    id: "v2_starlit_dust",
    name: "별빛 가루",
    description: "별빛에 닿은 곳에서만 모이는 미세한 가루.",
  },

  // ── 금속 계열 ───────────────────────────────────────────────────
  v2_rough_ore: {
    id: "v2_rough_ore",
    name: "거친 광석",
    description: "막 캐낸 거친 광석. 제련하면 무기와 갑옷의 바탕이 된다.",
  },
  v2_steel_ingot: {
    id: "v2_steel_ingot",
    name: "강철 주괴",
    description: "잘 벼린 강철 덩이. 단단한 장비의 뼈대가 된다.",
  },
  v2_mithril_ore: {
    id: "v2_mithril_ore",
    name: "미스릴 원석",
    description: "가볍고도 단단한 귀한 광석. 다루기 까다롭다.",
  },

  // ── 가죽/직물 계열 ──────────────────────────────────────────────
  v2_tough_hide: {
    id: "v2_tough_hide",
    name: "질긴 가죽",
    description: "잘 손질한 질긴 가죽. 가벼운 방어구의 바탕이 된다.",
  },
  v2_silk_thread: {
    id: "v2_silk_thread",
    name: "비단실",
    description: "곱게 자아낸 비단실. 가볍고 질긴 옷을 짜는 데 쓴다.",
  },
  v2_windweave_cloth: {
    id: "v2_windweave_cloth",
    name: "바람결 천",
    description: "바람결을 머금은 듯 가벼운 천. 손에 닿는 느낌이 서늘하다.",
  },

  // ── 마력 계열 ───────────────────────────────────────────────────
  v2_mana_dust: {
    id: "v2_mana_dust",
    name: "마력 가루",
    description: "옅은 마력이 어린 가루. 주문 도구의 바탕에 섞는다.",
  },
  v2_rune_shard: {
    id: "v2_rune_shard",
    name: "룬 조각",
    description: "룬이 새겨진 돌 조각. 쥐고 있으면 미세하게 떨린다.",
  },
  v2_arcane_crystal: {
    id: "v2_arcane_crystal",
    name: "비전 수정",
    description: "맑은 수정 안에 마력이 응결되어 있다.",
  },
};

// 재료 판매가 (개당, 골드). 상점 '판매' 탭에서 드랍 환금에 사용. 재료는 티어/등급 개념이
// 없어 재료별 고정값으로 둔다(흔함순 차등). 구매는 불가. 제작 척추가 들어오면 주 소비처는
// 제작이지만 환금 밸브로 남긴다. 계열 상위로 갈수록 값↑.
export const V2_MATERIAL_SELL_PRICE: Record<V2MaterialId, number> = {
  // 공용
  v2_stone_chip: 2,
  v2_herb: 3,
  v2_slime_shard: 4,
  v2_bone_fragment: 6,
  v2_beast_sinew: 8,
  v2_starlit_dust: 20,
  // 금속
  v2_rough_ore: 3,
  v2_steel_ingot: 9,
  v2_mithril_ore: 26,
  // 가죽/직물
  v2_tough_hide: 3,
  v2_silk_thread: 9,
  v2_windweave_cloth: 24,
  // 마력
  v2_mana_dust: 4,
  v2_rune_shard: 10,
  v2_arcane_crystal: 28,
};

// === floor 별 드랍 풀 ===============================================
// chance = 0~1, 굴림 통과 시 [amountMin, amountMax] 사이 정수 개수 획득.
// 한 사냥에서 여러 row 가 동시에 통과할 수 있음 (독립 굴림).
//
// 테마: 층마다 계열을 편향한다(아래 주석). 같은 재료가 여러 층에 걸치되 흔한 층이 다르다.
// 확률·수량은 sim 캘리브 다이얼.

export type DropRule = {
  id: V2MaterialId;
  chance: number;
  amountMin: number;
  amountMax: number;
};

export const FLOOR_DROP_POOLS: Record<DungeonFloorId, DropRule[]> = {
  // 1층 — 변경 입구 (Lv 1~5). 전 계열 T1 재료 입문. (앞 3행은 옛 테스트 호환 유지)
  1: [
    { id: "v2_stone_chip", chance: 0.5, amountMin: 1, amountMax: 2 },
    { id: "v2_herb", chance: 0.3, amountMin: 1, amountMax: 1 },
    { id: "v2_slime_shard", chance: 0.1, amountMin: 1, amountMax: 1 },
    { id: "v2_rough_ore", chance: 0.4, amountMin: 1, amountMax: 2 },
    { id: "v2_tough_hide", chance: 0.4, amountMin: 1, amountMax: 2 },
    { id: "v2_mana_dust", chance: 0.35, amountMin: 1, amountMax: 1 },
  ],
  // 2층 — 변경 외곽 (Lv 6~13). 3계열 중급 재료 진입(소량) — 금속/가죽/마력 동일 깊이로
  // 둬야 T2 제작이 빌드 무관 동시에 풀린다(steel·silk·rune 셋 다 2층). slime_shard(T2 공용
  // 접착)도 여기 둬 T2 제작이 2층에서 자기완결되도록(1층 되돌이 불필요).
  2: [
    { id: "v2_rough_ore", chance: 0.45, amountMin: 1, amountMax: 2 },
    { id: "v2_tough_hide", chance: 0.4, amountMin: 1, amountMax: 2 },
    { id: "v2_mana_dust", chance: 0.35, amountMin: 1, amountMax: 2 },
    { id: "v2_herb", chance: 0.3, amountMin: 1, amountMax: 2 },
    { id: "v2_slime_shard", chance: 0.25, amountMin: 1, amountMax: 2 },
    { id: "v2_steel_ingot", chance: 0.15, amountMin: 1, amountMax: 1 },
    { id: "v2_silk_thread", chance: 0.15, amountMin: 1, amountMax: 1 },
    { id: "v2_rune_shard", chance: 0.15, amountMin: 1, amountMax: 1 },
  ],
  // 3층 — 산악 평원 (Lv 18~28). 광산 느낌 — 금속 편향 + 뼈/힘줄.
  3: [
    { id: "v2_rough_ore", chance: 0.45, amountMin: 1, amountMax: 3 },
    { id: "v2_steel_ingot", chance: 0.3, amountMin: 1, amountMax: 2 },
    { id: "v2_bone_fragment", chance: 0.2, amountMin: 1, amountMax: 1 },
    { id: "v2_beast_sinew", chance: 0.18, amountMin: 1, amountMax: 1 },
    { id: "v2_rune_shard", chance: 0.15, amountMin: 1, amountMax: 1 },
    { id: "v2_silk_thread", chance: 0.12, amountMin: 1, amountMax: 1 },
  ],
  // 4층 — 화염 지대 (Lv 34~55). 고티어 재료 진입(미스릴·비전 수정·바람결 천).
  4: [
    { id: "v2_steel_ingot", chance: 0.3, amountMin: 1, amountMax: 2 },
    { id: "v2_beast_sinew", chance: 0.25, amountMin: 1, amountMax: 2 },
    { id: "v2_mithril_ore", chance: 0.12, amountMin: 1, amountMax: 1 },
    { id: "v2_arcane_crystal", chance: 0.12, amountMin: 1, amountMax: 1 },
    { id: "v2_windweave_cloth", chance: 0.1, amountMin: 1, amountMax: 1 },
    { id: "v2_starlit_dust", chance: 0.08, amountMin: 1, amountMax: 1 },
  ],
  // 5층 — 별빛 회랑 (Lv 70~100). T5 게이트 — 상위 계열 + 별빛 가루 본격.
  5: [
    { id: "v2_mithril_ore", chance: 0.25, amountMin: 1, amountMax: 2 },
    { id: "v2_windweave_cloth", chance: 0.2, amountMin: 1, amountMax: 2 },
    { id: "v2_arcane_crystal", chance: 0.2, amountMin: 1, amountMax: 2 },
    { id: "v2_beast_sinew", chance: 0.18, amountMin: 1, amountMax: 1 },
    { id: "v2_starlit_dust", chance: 0.15, amountMin: 1, amountMax: 2 },
  ],
  // 6~8 층(엔드) 은 후속 PR 에서 채움. 빈 풀이라 사냥 보상 X.
  6: [],
  7: [],
  8: [],
};

// === 재료 → 드랍 구역 역인덱스 (모험의 서 재료 도감용) ================
// FLOOR_DROP_POOLS 를 뒤집어 "이 재료가 어느 floor 에서 몇 % 로 떨어지나" 를 만든다.
// 라이브 모험의 서 재료 탭이 "재료 → 드랍 몬스터" 였던 것의 v2 대응 —
// v2 드랍은 몬스터별이 아니라 floor(구역)별이라 출처를 구역으로 잡는다.
// chance 내림차순(잘 떨어지는 구역이 위). 정적 카탈로그라 게이팅 없음.

export type MaterialDropSource = {
  floorId: DungeonFloorId;
  chance: number;
  amountMin: number;
  amountMax: number;
};

export const MATERIAL_DROP_SOURCES: Record<V2MaterialId, MaterialDropSource[]> =
  (() => {
    const map = {} as Record<V2MaterialId, MaterialDropSource[]>;
    for (const id of Object.keys(V2_MATERIALS) as V2MaterialId[]) map[id] = [];
    const floors = Object.keys(FLOOR_DROP_POOLS).map(Number) as DungeonFloorId[];
    for (const floorId of floors) {
      for (const rule of FLOOR_DROP_POOLS[floorId]) {
        map[rule.id].push({
          floorId,
          chance: rule.chance,
          amountMin: rule.amountMin,
          amountMax: rule.amountMax,
        });
      }
    }
    for (const id of Object.keys(map) as V2MaterialId[]) {
      map[id].sort((a, b) => b.chance - a.chance);
    }
    return map;
  })();

// === 드랍 굴림 (순수 함수) ===========================================

export type DropResult = Partial<Record<V2MaterialId, number>>;

// rng() ∈ [0, 1). 빈 결과는 {} 반환.
export function rollDrops(
  floor: DungeonFloorId,
  rng: () => number,
  // 드롭 chance 배율 — 신참 보너스(Lv30 미만 ×2) 등. 미지정 1. 칸당 chance×배율(1 cap).
  chanceMult: number = 1,
): DropResult {
  const pool = FLOOR_DROP_POOLS[floor];
  const out: DropResult = {};
  for (const rule of pool) {
    if (rng() >= Math.min(1, rule.chance * chanceMult)) continue;
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
