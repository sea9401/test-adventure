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

// 2026-06-03: 재료 시스템 재설계 — 옛 15종(계열/티어) 통째 비운 뒤, **지역당 소수**로 다시
// 채운다. 규칙: 한 지역 = 희귀 2종 + 흔함 3~4종, 드랍률은 낮게(잡재료 범람 방지). 타입은
// string 으로 둬(세이브 키 호환·지역별 점진 추가 용이) 카탈로그에 등재된 것만 유효.
// 현재: 들판(1층)만 정의. 나머지 지역은 보류(드랍 풀 빈 채).
// ⚠️ 재료 수집이 3·4차 전직 요건(codex.ts)이라, V2_CODEX_TOTAL = 등재 재료 수.
//    들판 5종 등재 → 전직 재료 요건이 min(요건, 5)로 부활(들판에서 전부 수집 가능).
export type V2MaterialId = string;

export type V2Material = {
  id: V2MaterialId;
  name: string;
  description: string;
};

export const V2_MATERIALS: Record<V2MaterialId, V2Material> = {
  // ── 들판 (1층) — 흔함 3 ──────────────────────────────────────────
  v2_field_grass: {
    id: "v2_field_grass",
    name: "들풀",
    description: "들에 지천으로 자라는 풀. 달이거나 끈으로 엮어 쓴다.",
  },
  v2_field_hide: {
    id: "v2_field_hide",
    name: "무른 가죽",
    description: "작은 들짐승에게서 얻은 무른 가죽 조각.",
  },
  v2_field_stone: {
    id: "v2_field_stone",
    name: "돌조각",
    description: "발끝에 차이는 흔한 돌 부스러기.",
  },
  // ── 들판 (1층) — 희귀 2 ──────────────────────────────────────────
  v2_field_fang: {
    id: "v2_field_fang",
    name: "들짐승 송곳니",
    description: "단단한 들짐승의 송곳니. 드물게 온전한 것이 나온다.",
  },
  v2_field_venom: {
    id: "v2_field_venom",
    name: "거미 독샘",
    description: "들거미의 독을 머금은 작은 주머니. 좀처럼 터지지 않은 채 얻기 어렵다.",
  },
};

// 재료 판매가 (개당, 골드). 상점 '판매' 탭에서 드랍 환금에 사용(제작 보류 중이라 현 주 용도).
// 흔함=헐값, 희귀=환금 가치. 등재 재료마다 값 필요.
export const V2_MATERIAL_SELL_PRICE: Record<V2MaterialId, number> = {
  v2_field_grass: 2,
  v2_field_hide: 3,
  v2_field_stone: 2,
  v2_field_fang: 16,
  v2_field_venom: 22,
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

// 2026-06-03: 지역당 소수 재료 + 저드랍 규칙. 들판(1층)만 채움 — 흔함 3(0.07~0.10)·희귀
// 2(0.035~0.05). 체감 과다로 전체 ~30% 추가 인하. 기대 획득 ≈ 1마리당 0.39개.
// ⚠️ v2 던전 드롭은 신참 배율 미적용(항상 ×1, 신참 혜택은 EXP 전용). 나머지 층은 보류.
export const FLOOR_DROP_POOLS: Record<DungeonFloorId, DropRule[]> = {
  1: [
    // 흔함
    { id: "v2_field_grass", chance: 0.1, amountMin: 1, amountMax: 2 },
    { id: "v2_field_hide", chance: 0.08, amountMin: 1, amountMax: 1 },
    { id: "v2_field_stone", chance: 0.07, amountMin: 1, amountMax: 1 },
    // 희귀
    { id: "v2_field_fang", chance: 0.05, amountMin: 1, amountMax: 1 },
    { id: "v2_field_venom", chance: 0.035, amountMin: 1, amountMax: 1 },
  ],
  2: [],
  3: [],
  4: [],
  5: [],
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
