// v2 장비 개체 편차 — 획득(드랍/제작) 시 위력·무게·옵션 값을 카탈로그 ±편차로 굴린다.
// 등급/이름 없음(숫자 편차만). 상점 구매는 미적용(정가 고정). 굴림은 equipment.v2.statRolls
// 에 per-id 저장(V2EquipRoll). derive·UI 는 굴림 있으면 그 값, 없으면 카탈로그.
//
// spread = round(값 × VARIANCE_FRACTION). 값이 0(무게 등)이면 변동 없음. 바닥: 위력 ≥1,
// 무게 ≥0, 옵션 ≥1(옵션이 사라지진 않음). god-roll 추격이 엔드게임이라 편차를 크게
// (0.65 = ±65%) — 같은 종류라도 굴림이 크게 갈려 추격 가치. VARIANCE_FRACTION·바닥은 다이얼.

import {
  V2_EQUIPMENT,
  V2_EQUIP_OPTION_KEYS,
  isUnique,
  sellPriceOf,
  type V2Equipment,
  type V2EquipInstance,
  type V2EquipOptions,
  type V2EquipRoll,
  type V2EquipSlot,
} from "./v2Equipment";

export const VARIANCE_FRACTION = 0.65;

// 한 스탯 굴림 — [max(floor, value−spread), value+spread] 균등. spread 0 이면 value 그대로.
function rollStat(value: number, floor: number, rng: () => number): number {
  const spread = Math.round(value * VARIANCE_FRACTION);
  if (spread <= 0) return value;
  const lo = Math.max(floor, value - spread);
  const hi = value + spread;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// 카탈로그 아이템 → 개체 굴림(순수). rng() ∈ [0, 1).
// 옵션은 카탈로그에 있는 키만 굴림(없는 옵션을 새로 만들지 않음).
export function rollItemStats(
  item: V2Equipment,
  rng: () => number,
): V2EquipRoll {
  const roll: V2EquipRoll = {
    power: rollStat(item.power, 1, rng),
    weight: rollStat(item.weight, 0, rng),
  };
  if (item.options) {
    const opts: V2EquipOptions = {};
    for (const k of V2_EQUIP_OPTION_KEYS) {
      const v = item.options[k];
      if (v == null) continue;
      opts[k] = rollStat(v, 1, rng);
    }
    if (Object.keys(opts).length > 0) roll.options = opts;
  }
  return roll;
}

export function catalogItemStats(item: V2Equipment): V2EquipRoll {
  return {
    power: item.power,
    weight: item.weight,
    ...(item.options ? { options: { ...item.options } } : {}),
  };
}

// 한 스탯의 굴림 범위 [lo, hi] — rollStat 과 동일. 변동 없으면(spread 0) null.
function statRange(
  value: number,
  floor: number,
): { lo: number; hi: number } | null {
  const spread = Math.round(value * VARIANCE_FRACTION);
  if (spread <= 0) return null;
  return { lo: Math.max(floor, value - spread), hi: value + spread };
}

// 개체 굴림 품질 % — 카탈로그 기준값 대비 굴린 위치(0 = 최저 굴림, 100 = god-roll).
// 스탯별 [lo, hi](rollStat 과 동일 범위) 안의 정규화 위치를 가중 평균. 무게는 낮을수록
// 좋아 반전. 변동 없는(spread 0) 스탯·굴림 없는 아이템(상점 정가)은 제외 → 그런 건 null.
// 가중: 위력 2(주 스탯), 옵션·무게 각 1. 다이얼.
const ROLL_WEIGHT_POWER = 2;
const ROLL_WEIGHT_OPTION = 1;
const ROLL_WEIGHT_WEIGHT = 1;
export function rollQualityPct(
  item: V2Equipment,
  roll: V2EquipRoll | undefined,
): number | null {
  if (!roll) return null;
  let weightSum = 0;
  let acc = 0;
  const consider = (
    value: number,
    rolled: number,
    floor: number,
    w: number,
    lowerBetter: boolean,
  ) => {
    const range = statRange(value, floor);
    if (!range || range.hi <= range.lo) return;
    let pos = (rolled - range.lo) / (range.hi - range.lo);
    if (lowerBetter) pos = 1 - pos;
    acc += w * Math.max(0, Math.min(1, pos));
    weightSum += w;
  };
  consider(item.power, roll.power, 1, ROLL_WEIGHT_POWER, false);
  consider(item.weight, roll.weight, 0, ROLL_WEIGHT_WEIGHT, true);
  if (item.options) {
    for (const k of V2_EQUIP_OPTION_KEYS) {
      const base = item.options[k];
      if (base == null) continue;
      consider(base, roll.options?.[k] ?? base, 1, ROLL_WEIGHT_OPTION, false);
    }
  }
  if (weightSum === 0) return null; // 변동 가능한 스탯 0 — 굴림 의미 없음
  return Math.round((acc / weightSum) * 100);
}

// ── 재련(Reforge) — 골드로 옵션 굴림을 다시 돌린다(항상 적용 = 도박) ─────────────
// 엔드게임의 "재고(stock) 골드 sink": 강화·길드창단은 일회성이고 세금/치료는 수입
// 비례 skim 이라 쌓인 골드를 못 줄인다. 재련은 god-roll(품질 100) 추격이 희귀해서
// 무한 반복되며 골드를 빨아들인다. 결과 굴림은 rollItemStats(드랍과 동일 분포·동일
// 바닥/천장) 안이라 **신규 파워 천장 없음**(파워크립 0) — 드랍으로도 나올 수 있던 값.
//
// 비용 = max(MIN, floor(카탈로그 위력 × K)) × 유니크배수. 강화 ≠ 재련(강화 레벨 불변).
// 강화는 개체 굴림 위력 기준이라 회마다 흔들리지만, 재련은 **카탈로그 기준 위력**으로
// 비용을 고정해 예측 가능하게(가격이 굴림 결과에 안 휘둘림). K·MIN·배수는 다이얼.
export const REFORGE_GOLD_K = 500; // 하이브리드(재료+골드) 전환으로 골드분 절반(PR-2).
export const REFORGE_MIN_COST = 20_000;
export const REFORGE_UNIQUE_COST_MULT = 2;

export function reforgeGoldCost(item: V2Equipment): number {
  const base = Math.max(
    REFORGE_MIN_COST,
    Math.floor(item.power * REFORGE_GOLD_K),
  );
  return base * (isUnique(item) ? REFORGE_UNIQUE_COST_MULT : 1);
}

// 재련 가능 여부 — 굴림이 있고(드랍/제작 개체) 변동 가능한 스탯이 있어야(상점 정가템
// 처럼 변동 0 이면 재련해도 무의미 → 골드만 날림 방지). rollQualityPct 가 그 판정과 동일.
export function canReforge(
  item: V2Equipment,
  roll: V2EquipRoll | undefined,
  inst?: Pick<V2EquipInstance, "craftedBy">,
): boolean {
  const effectiveRoll =
    roll ?? (item.craftOnly || inst?.craftedBy ? catalogItemStats(item) : undefined);
  return effectiveRoll != null && rollQualityPct(item, effectiveRoll) !== null;
}

// ── 재련석(Reforge Stone) — 재련 소모 재료 2종 ─────────────────────────────
// 재련은 (PR-2부터) 골드 + 재련석 1개 하이브리드로 소모한다. 두 종류:
//   일반 재련석 = 현 재련 굴림(1회) / 상급 재련석 = max-of-N(REFORGE_HIGH_ROLLS)로 고품질 확률↑
//   (결과는 여전히 드랍 분포 안 → 파워크립 0). 굴림 = reforgeRollCount/rollItemStatsBest.
// 수급 = 사냥 승리 독립 드랍(강화석 패턴 미러·V2_MATERIALS_ENABLED 무관). NPC 판매 없음
//   (거래소 유저 거래 전용 — 시세는 수요가 결정). 강화석(붉은0.1·푸른0.3)보다 희소.
export type ReforgeStoneId = "basic" | "high";

export const REFORGE_STONES: Record<ReforgeStoneId, { name: string }> = {
  basic: { name: "재련석" },
  high: { name: "상급 재련석" },
};

export const REFORGE_STONE_MATERIAL_ID: Record<ReforgeStoneId, string> = {
  basic: "v2_reforge_stone",
  high: "v2_reforge_stone_high",
};

// 승리당 드랍 확률(%) — 일반 ≈670승/개·상급 ≈2,500승/개(강화석보다 희소). 다이얼.
export const REFORGE_STONE_DROP_PCT: Record<ReforgeStoneId, number> = {
  basic: 0.15,
  high: 0.04,
};

// hunt 승리 보상 롤 — 종류별 독립 굴림, 통과 시 1개. rng() ∈ [0,1). (rollEnhanceStoneDrops 미러)
export function rollReforgeStoneDrops(
  rng: () => number,
  // 확률 배수 — 레어맵 등 부스트용. 기본 1 = 무변경.
  chanceMult: number = 1,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const stone of ["basic", "high"] as const) {
    if (rng() * 100 < REFORGE_STONE_DROP_PCT[stone] * chanceMult) {
      out[REFORGE_STONE_MATERIAL_ID[stone]] = 1;
    }
  }
  return out;
}

// 대장간 조합 — 일반 재련석 N개 → 상급 재련석 1개(결정론). 일반 상위 변환 sink + 거래 수요. 다이얼.
export const REFORGE_COMBINE_COST = 3;

// 조합 공통 골드 비용 — 모든 대장간 조합(재련석·성벽 수리 키트 등)에 기본 적용하는 골드 sink.
//   재료를 결과물로 바꾸는 수수료. 보유 골드(코어루프 on 이면 은행 우선)에서 차감. 다이얼.
export const COMBINE_GOLD_COST = 200_000;

// 상급 재련석 max-of-N — N회 굴려 품질 최고를 채택(같은 분포·범위라 파워크립 0). N=1=현 굴림.
export const REFORGE_HIGH_ROLLS = 3;

export function reforgeRollCount(stone: ReforgeStoneId): number {
  return stone === "high" ? REFORGE_HIGH_ROLLS : 1;
}

// count 회 굴림 중 rollQualityPct 최고를 반환(동률·null 품질이면 첫 굴림 유지). count≤1 = rollItemStats 동일.
export function rollItemStatsBest(
  item: V2Equipment,
  rng: () => number,
  count: number,
): V2EquipRoll {
  let best = rollItemStats(item, rng);
  let bestQ = rollQualityPct(item, best) ?? -1;
  for (let i = 1; i < count; i++) {
    const r = rollItemStats(item, rng);
    const q = rollQualityPct(item, r) ?? -1;
    if (q > bestQ) {
      best = r;
      bestQ = q;
    }
  }
  return best;
}

// ── 일괄 판매 선택 — 클라(미리보기 확인)·서버(권위 판매) 공용 단일 소스(드리프트 방지) ──
export type BulkSellOpts = {
  // 한 슬롯만(미지정 = 전 슬롯).
  slot?: V2EquipSlot;
  // 품질(굴림 품질)이 이 % 이하인 것만(미지정 = 판매 가능 전부). 굴림 없는 상점템은 belowPct 모드서 제외.
  belowPct?: number;
};
export type BulkSellPlan = { iids: string[]; gold: number; count: number };

// 미장착 + 미잠금 + 판매 가능(유니크 등 비매 제외) 개체를 골라 판매 계획 산출.
// equipped 의 iid 는 제외. locked 개체는 제외. belowPct 주면 품질% ≤ belowPct 만(굴림 없으면 제외).
export function selectBulkSell(
  owned: V2EquipInstance[],
  equipped: Partial<Record<V2EquipSlot, string>>,
  opts: BulkSellOpts = {},
): BulkSellPlan {
  const equippedIids = new Set(Object.values(equipped));
  const iids: string[] = [];
  let gold = 0;
  for (const inst of owned) {
    if (equippedIids.has(inst.iid)) continue;
    if (inst.locked) continue;
    const item = V2_EQUIPMENT[inst.id];
    if (!item) continue;
    if (opts.slot && item.slot !== opts.slot) continue;
    const price = sellPriceOf(item);
    if (price == null) continue; // 비매품(유니크·제작전용·스타터)
    if (opts.belowPct != null) {
      const q = rollQualityPct(item, inst.roll);
      if (q == null || q > opts.belowPct) continue; // 굴림 없거나 임계 초과는 유지(임계 이하만 판매)
    }
    iids.push(inst.iid);
    gold += price;
  }
  return { iids, gold, count: iids.length };
}

// effectiveStats 는 v2Equipment.ts(순수 장비-모델 함수)로 이전 — v2EquipStatRows 가 순환
// import 없이 쓰도록. 기존 import 경로(derive·테스트) 유지를 위해 여기서 re-export.
export { effectiveStats } from "./v2Equipment";
