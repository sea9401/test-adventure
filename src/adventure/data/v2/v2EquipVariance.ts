// v2 장비 개체 편차 — 획득(드랍/제작) 시 위력·무게·옵션 값을 카탈로그 ±편차로 굴린다.
// 등급/이름 없음(숫자 편차만). 상점 구매는 미적용(정가 고정). 굴림은 equipment.v2.statRolls
// 에 per-id 저장(V2EquipRoll). derive·UI 는 굴림 있으면 그 값, 없으면 카탈로그.
//
// spread = round(값 × VARIANCE_FRACTION). 값이 작아 spread 0 이면 그 스탯은 변동 없음
// (저티어 1 값 안정). 바닥: 위력 ≥1, 무게 ≥0, 옵션 ≥1(옵션이 사라지진 않음).
// VARIANCE_FRACTION·바닥은 sim/라이브 다이얼.

import {
  V2_EQUIP_OPTION_KEYS,
  type V2Equipment,
  type V2EquipOptions,
  type V2EquipRoll,
} from "./v2Equipment";

export const VARIANCE_FRACTION = 0.3;

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

// 적용 스탯 — 굴림 있으면 그것, 없으면 카탈로그(상점 구매·옛 데이터·옵션 없는 아이템).
// 옵션은 굴림에 있으면 그것, 없으면 카탈로그 옵션(굴림이 옵션을 안 담은 경우 대비).
export function effectiveStats(
  item: V2Equipment,
  roll: V2EquipRoll | undefined,
): { power: number; weight: number; options?: V2EquipOptions } {
  if (!roll) {
    return { power: item.power, weight: item.weight, options: item.options };
  }
  // 옵션은 **카탈로그 키로 스코프** + per-key 병합 — 굴림 값 우선, 없으면 카탈로그.
  // 카탈로그에 없는 옵션은(손상/변조 세이브라도) 주입 안 하고, 카탈로그 옵션이 굴림에서
  // 누락돼도 떨어뜨리지 않는다(all-or-nothing 회피).
  let options = item.options;
  if (item.options) {
    const merged: V2EquipOptions = {};
    for (const k of V2_EQUIP_OPTION_KEYS) {
      const cv = item.options[k];
      if (cv == null) continue;
      merged[k] = roll.options?.[k] ?? cv;
    }
    options = merged;
  }
  return { power: roll.power, weight: roll.weight, options };
}
