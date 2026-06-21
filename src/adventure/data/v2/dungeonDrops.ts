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
import { ENHANCE_STONE_MATERIAL_ID, ENHANCE_STONES } from "./v2Enhance";
import { SUMMON_SCROLL_MATERIAL_ID } from "./coopBosses";
import {
  REFORGE_STONE_MATERIAL_ID,
  REFORGE_STONES,
} from "./v2EquipVariance";

// === 재료/제작 보류 토글 (단일 reversible 플래그) =====================
// 재료·제작 시스템을 통째로 "park" 하는 단일 스위치. false 면:
//   ① 사냥 재료 드랍 중단 (rollDrops 가 빈 결과 — 모든 호출처/sim 커버)
//   ② 전직 모험의 서 재료 요건 해제 (codexRequirement → 0, codex.ts) — 전직은 레벨/숙련도로만
// 대장간·제작 UI 는 그대로 둔다(재료가 안 나와 자연히 제작 안 됨). 기존 세이브의 재료는
// 비파괴로 남는다(보유분/판매 가능). 제작을 다시 도입하려면 이 한 줄만 true 로 되돌리면 된다.
export const V2_MATERIALS_ENABLED = false;

// === 재료 정의 ======================================================

// 2026-06-08: 재료 시스템 콘텐츠 제거 — 대장간 제작을 들어내며 들판 재료 5종도 게임에서 뺐다.
// 2026-06-11: 강화석 2종 입주(장비 강화 PR-2, docs/v2-equipment-enhance-plan.md) —
//   카탈로그 등재만으로 인벤 재료 탭·거래소 재료 거래·NPC 판매가 살아난다. 드랍은
//   FLOOR_DROP_POOLS(플래그 게이트)가 아니라 hunt 라우트의 독립 롤(v2Enhance) —
//   V2_MATERIALS_ENABLED 는 false 유지(제작·전직 도감 요건은 계속 잠금).
// 기존 세이브의 재료 보유분은 mergeDrops 비파괴 원칙으로 그대로 남는다(보유/판매 가능).
export type V2MaterialId = string;

export type V2Material = {
  id: V2MaterialId;
  name: string;
  description: string;
};

export const V2_MATERIALS: Record<V2MaterialId, V2Material> = {
  [ENHANCE_STONE_MATERIAL_ID.red]: {
    id: ENHANCE_STONE_MATERIAL_ID.red,
    name: ENHANCE_STONES.red.name,
    description:
      "맹렬한 기운이 깃든 강화석. 강화 성공 시 위력을 크게(+3%p) 올리지만 실패하기 쉽다.",
  },
  [ENHANCE_STONE_MATERIAL_ID.blue]: {
    id: ENHANCE_STONE_MATERIAL_ID.blue,
    name: ENHANCE_STONES.blue.name,
    description:
      "단단한 기운이 깃든 강화석. 강화 성공 시 위력을 안정적으로(+2%p) 올린다.",
  },
  // 협동 보스 소환서(coopBosses) — 강화석과 같은 독립 드랍(hunt 라우트 롤). 카탈로그
  // 등재로 인벤 재료 탭·거래소 재료 거래가 살아나고, NPC 판매는 의도적 비등재(유저 거래 전용).
  [SUMMON_SCROLL_MATERIAL_ID]: {
    id: SUMMON_SCROLL_MATERIAL_ID,
    name: "보스 소환서",
    description:
      "낡은 양피지에 봉인 술식이 적혀 있다. 여러 장을 모아 협동 보스를 소환한다.",
  },
  // 재련석 2종(v2EquipVariance) — 강화석과 같은 독립 드랍(hunt 라우트 롤). 카탈로그 등재로
  // 인벤 재료 탭·거래소 거래가 살아나고, NPC 판매는 비등재(유저 거래 전용).
  [REFORGE_STONE_MATERIAL_ID.basic]: {
    id: REFORGE_STONE_MATERIAL_ID.basic,
    name: REFORGE_STONES.basic.name,
    description:
      "장비 옵션을 다시 굴리는 재련에 쓰는 재료. 대장간에서 골드와 함께 소모한다.",
  },
  [REFORGE_STONE_MATERIAL_ID.high]: {
    id: REFORGE_STONE_MATERIAL_ID.high,
    name: REFORGE_STONES.high.name,
    description:
      "더 높은 품질이 나올 가능성이 큰 상급 재련 재료. 대장간에서 재련석을 모아 만들 수도 있다.",
  },
};

// 재료 NPC 판매가 (개당, 골드). 강화석은 의도적으로 **비등재** — NPC 환금 없음,
// 유저 거래(거래소) 전용(사용자 결정 2026-06-11). 미등재 재료는 판매 라우트가 거부.
export const V2_MATERIAL_SELL_PRICE: Record<V2MaterialId, number> = {};

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

// 2026-06-08: 재료 제거로 전 층 드랍 풀 비움. 재료 재도입 시 층별로 다시 채운다.
export const FLOOR_DROP_POOLS: Record<DungeonFloorId, DropRule[]> = {
  1: [],
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
  // 재료 보류 중 — 어떤 floor 든 드랍 없음(단일 게이트, 모든 호출처 커버).
  if (!V2_MATERIALS_ENABLED) return {};
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
