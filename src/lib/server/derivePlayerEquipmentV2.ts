import {
  V2_EQUIPMENT,
  V2_EQUIP_SETS,
  V2_EQUIP_TAG_SETS,
  type SignatureEffect,
  type V2EquipmentId,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { effectiveStats } from "@/adventure/data/v2/v2EquipVariance";

// PR-4a 장비 위력/무게 합산 — equipment.v2 슬롯 6개에서 위력을 슬롯/무기종류별로 분기 누적 +
// 무게 합산 + 옵션(crit/mp/eva/hp) 누적. 장비는 더 이상 6스탯 token 을 안 준다(정체성은
// 훈련 분배). 단위 테스트가 검증할 수 있도록 export.
export type V2EquipAggregate = {
  // 위력 슬롯별 분기 (derive 결과 후-가산)
  atk: number; // Σ 비지팡이 무기 위력 (물리 공격력)
  magicAtk: number; // Σ 지팡이 무기 위력 (마법 공격력)
  def: number; // Σ 방어구 위력 (물리 방어력)
  magicDef: number; // Σ 장신구 위력 (마법 방어력)
  // 무게 — 속도 페널티 (derive 에서 −weight×계수)
  weight: number;
  // 옵션 — derive 결과 후-가산
  crit: number;
  mp: number;
  eva: number;
  hp: number;
  critMult: number; // 백분의 일 정수 합(100=+1.0×). derive 에서 /100 환산.
  spd: number; // flat 속도 합.
  healPowerPct: number; // 회복 +% 옵션 합(SPI PR-2). derive healMult 에 패시브와 합산.
  critResist: number; // 치명저항 +%p 옵션 합.
};

const EMPTY_AGGREGATE = (): V2EquipAggregate => ({
  atk: 0,
  magicAtk: 0,
  def: 0,
  magicDef: 0,
  weight: 0,
  crit: 0,
  mp: 0,
  eva: 0,
  hp: 0,
  critMult: 0,
  spd: 0,
  healPowerPct: 0,
  critResist: 0,
});

function addEquipBonus(
  acc: V2EquipAggregate,
  b: Readonly<{
    crit?: number;
    eva?: number;
    mp?: number;
    hp?: number;
    critMult?: number;
    spd?: number;
    def?: number;
    magicDef?: number;
    healPowerPct?: number;
    critResist?: number;
  }>,
) {
  acc.crit += b.crit ?? 0;
  acc.eva += b.eva ?? 0;
  acc.mp += b.mp ?? 0;
  acc.hp += b.hp ?? 0;
  acc.critMult += b.critMult ?? 0;
  acc.spd += b.spd ?? 0;
  acc.def += b.def ?? 0;
  acc.magicDef += b.magicDef ?? 0;
  acc.healPowerPct += b.healPowerPct ?? 0;
  acc.critResist += b.critResist ?? 0;
}

export function aggregateV2Equipment(
  v2Equipped: Partial<Record<V2EquipSlot, V2EquipmentId>>,
  // PR-편차-9 — id별 개체 굴림. 있으면 카탈로그 대신 굴림값(effectiveStats). 없으면 카탈로그
  // (상점 구매·옛 세이브) → 기존 동작 그대로(비파괴).
  statRolls?: Partial<Record<V2EquipmentId, V2EquipRoll>>,
): V2EquipAggregate {
  const acc = EMPTY_AGGREGATE();
  for (const slot of [
    "weapon",
    "armor",
    "gloves",
    "boots",
    "ring",
    "necklace",
  ] as const) {
    const id = v2Equipped[slot];
    if (!id) continue;
    const item = V2_EQUIPMENT[id];
    const eff = effectiveStats(item, statRolls?.[id]);
    const power = eff.power;
    // 위력 슬롯별 분기: 무기=weaponType 별 공격력 / 갑옷·장갑·신발=물방 / 반지·목걸이=마방.
    if (slot === "weapon") {
      if (item.weaponType === "staff") {
        acc.magicAtk += power;
      } else {
        acc.atk += power;
      }
    } else if (slot === "ring" || slot === "necklace") {
      acc.magicDef += power;
    } else {
      // armor / gloves / boots
      acc.def += power;
    }
    acc.weight += eff.weight;
    const o = eff.options ?? {};
    acc.crit += o.crit ?? 0;
    acc.mp += o.mp ?? 0;
    acc.eva += o.eva ?? 0;
    acc.hp += o.hp ?? 0;
    acc.critMult += o.critMult ?? 0;
    acc.spd += o.spd ?? 0;
    acc.def += o.def ?? 0; // 물방 옵션(신설) — 갑옷 위력 def 와 같은 축에 가산.
    acc.magicDef += o.magicDef ?? 0; // 마방 옵션(SPI PR-2) — 장신구 위력 magicDef 와 같은 축.
    acc.healPowerPct += o.healPowerPct ?? 0; // 회복% 옵션(SPI PR-2) — derive healMult 에 합산.
    acc.critResist += o.critResist ?? 0; // 치명저항 옵션 — SPI 파생 저항과 합산 후 cap.
  }
  // 세트 보너스 — 한 세트의 모든 조각을 장착했으면 옵션 보너스 후-가산(crit/eva/mp/hp).
  const equippedIds = new Set<V2EquipmentId>();
  for (const slot of [
    "weapon",
    "armor",
    "gloves",
    "boots",
    "ring",
    "necklace",
  ] as const) {
    const id = v2Equipped[slot];
    if (id) equippedIds.add(id);
  }
  for (const set of V2_EQUIP_SETS) {
    if (!set.pieces.every((p) => equippedIds.has(p))) continue;
    addEquipBonus(acc, set.bonus);
  }
  const tagCounts = new Map<string, number>();
  for (const id of equippedIds) {
    for (const tag of V2_EQUIPMENT[id]?.setTags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  for (const set of V2_EQUIP_TAG_SETS) {
    const count = tagCounts.get(set.id) ?? 0;
    for (const threshold of set.thresholds) {
      if (count >= threshold.count) addEquipBonus(acc, threshold.bonus);
    }
  }
  return acc;
}

// 장착 발동형 시그니처 집계(Phase 2) — 마퀴 단품 + 활성 세트(전 조각 장착)의 시그니처를 모은다.
//   엔진이 PlayerCombat.equipSignatures 로 읽어 전투 중 발동. 빈 배열 → derive 가 undefined 로
//   내려 엔진 훅 미발화(골든 byte-identical). 순수 함수.
export function collectEquipSignatures(
  v2Equipped: Partial<Record<V2EquipSlot, V2EquipmentId>>,
): SignatureEffect[] {
  const out: SignatureEffect[] = [];
  const equippedIds = new Set<V2EquipmentId>();
  for (const slot of [
    "weapon",
    "armor",
    "gloves",
    "boots",
    "ring",
    "necklace",
  ] as const) {
    const id = v2Equipped[slot];
    if (id) equippedIds.add(id);
  }
  // 단품(마퀴) 시그니처.
  for (const id of equippedIds) {
    const sig = V2_EQUIPMENT[id].signature;
    if (sig) out.push(sig);
  }
  // 세트 시그니처 — 전 조각 장착 시.
  for (const set of V2_EQUIP_SETS) {
    if (set.signature && set.pieces.every((p) => equippedIds.has(p))) {
      out.push(set.signature);
    }
  }
  return out;
}

