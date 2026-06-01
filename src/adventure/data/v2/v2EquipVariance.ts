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

// effectiveStats 는 v2Equipment.ts(순수 장비-모델 함수)로 이전 — v2EquipStatRows 가 순환
// import 없이 쓰도록. 기존 import 경로(derive·테스트) 유지를 위해 여기서 re-export.
export { effectiveStats } from "./v2Equipment";
