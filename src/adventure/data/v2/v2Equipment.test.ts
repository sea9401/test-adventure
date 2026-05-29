import { describe, expect, it } from "vitest";
import {
  CONCEPT_LABELS,
  SLOT_CONCEPTS,
  V2_EQUIPMENT,
  V2_EQUIP_BONUS_KEYS,
  V2_EQUIP_BONUS_LABELS,
  V2_EQUIP_PERCENT_KEYS,
  parseEquipmentSave,
  pickEquipBonus,
  v2EquipmentByConcept,
  v2EquipmentBySlot,
  type V2EquipConcept,
  type V2EquipmentId,
  type V2EquipSlot,
  type V2EquipTier,
} from "./v2Equipment";

const ALL_SLOTS: V2EquipSlot[] = ["weapon", "armor", "accessory"];
const ALL_CONCEPTS: V2EquipConcept[] = [
  "str",
  "dex",
  "int",
  "heavy",
  "light",
  "luck",
  "mana",
];
const ALL_TIERS: V2EquipTier[] = [1, 2, 3, 4, 5];

// 컨셉별 "주력 스탯" — 같은 컨셉의 T1~T5 가 이 키에서 단조 증가해야 함.
const PRIMARY_STAT: Record<V2EquipConcept, keyof typeof V2_EQUIP_BONUS_LABELS> = {
  str: "str",
  dex: "dex",
  int: "int",
  heavy: "vit",
  light: "dex",
  luck: "luk",
  mana: "int",
};

describe("V2_EQUIPMENT catalog", () => {
  it("모든 id 는 키와 일치해야 함 (self-id 일관성)", () => {
    for (const [key, item] of Object.entries(V2_EQUIPMENT)) {
      expect(item.id).toBe(key);
    }
  });

  it("모든 슬롯은 유효한 값이어야 함", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      expect(ALL_SLOTS).toContain(item.slot);
    }
  });

  it("v2EquipmentBySlot 가 슬롯 일치 아이템만 반환", () => {
    for (const slot of ALL_SLOTS) {
      const items = v2EquipmentBySlot(slot);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.slot).toBe(slot);
      }
    }
  });

  it("모든 stats 객체는 유효한 키만 사용 (atk/def + 6스탯)", () => {
    const allowed = new Set<string>(V2_EQUIP_BONUS_KEYS);
    for (const item of Object.values(V2_EQUIPMENT)) {
      for (const k of Object.keys(item.stats)) {
        expect(allowed.has(k), `${item.id}.stats.${k} 가 허용 키가 아님`).toBe(
          true,
        );
      }
    }
  });

  it("모든 stats 값은 유한 정수 (NaN/Infinity/소수 X)", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      for (const k of V2_EQUIP_BONUS_KEYS) {
        const v = item.stats[k];
        if (v === undefined) continue;
        expect(Number.isFinite(v)).toBe(true);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it("모든 항목의 stats 가 비어있지 않음 (적어도 1키)", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      const keys = V2_EQUIP_BONUS_KEYS.filter(
        (k) => (item.stats[k] ?? 0) !== 0,
      );
      expect(keys.length, `${item.id} stats 가 비어있음`).toBeGreaterThan(0);
    }
  });

  it("BONUS_LABELS 가 BONUS_KEYS 와 동일 키셋", () => {
    expect(new Set(Object.keys(V2_EQUIP_BONUS_LABELS))).toEqual(
      new Set(V2_EQUIP_BONUS_KEYS),
    );
  });

  it("PERCENT_KEYS 는 BONUS_KEYS 의 부분집합", () => {
    for (const k of V2_EQUIP_PERCENT_KEYS) {
      expect(V2_EQUIP_BONUS_KEYS).toContain(k);
    }
  });
});

describe("V2_EQUIPMENT grid (35종 — 7컨셉 × T1~T5)", () => {
  it("총 35종", () => {
    expect(Object.keys(V2_EQUIPMENT)).toHaveLength(35);
  });

  it("모든 컨셉이 T1~T5 정확히 한 종씩", () => {
    for (const concept of ALL_CONCEPTS) {
      const items = v2EquipmentByConcept(concept);
      expect(items, `concept=${concept}`).toHaveLength(5);
      const tiers = items.map((i) => i.tier);
      expect(tiers).toEqual(ALL_TIERS);
    }
  });

  it("SLOT_CONCEPTS 와 카탈로그의 슬롯-컨셉 매핑이 일관", () => {
    for (const slot of ALL_SLOTS) {
      for (const concept of SLOT_CONCEPTS[slot]) {
        for (const item of v2EquipmentByConcept(concept)) {
          expect(item.slot, `${item.id} 의 slot 이 SLOT_CONCEPTS 와 불일치`).toBe(
            slot,
          );
        }
      }
    }
  });

  it("CONCEPT_LABELS 가 ALL_CONCEPTS 와 동일 키셋", () => {
    expect(new Set(Object.keys(CONCEPT_LABELS))).toEqual(new Set(ALL_CONCEPTS));
  });

  it("같은 컨셉의 주력 스탯은 T1→T5 단조 증가", () => {
    for (const concept of ALL_CONCEPTS) {
      const items = v2EquipmentByConcept(concept);
      const primary = PRIMARY_STAT[concept];
      const values = items.map((i) => i.stats[primary] ?? 0);
      // 모두 양수
      for (const v of values) {
        expect(v, `${concept} primary=${primary}`).toBeGreaterThan(0);
      }
      // 단조 증가 (등호 불허)
      for (let i = 1; i < values.length; i++) {
        expect(
          values[i],
          `${concept} T${i + 1} primary 가 T${i} 보다 작거나 같음`,
        ).toBeGreaterThan(values[i - 1]);
      }
    }
  });

  it("tier 값이 1~5 범위 안에 있고 정수", () => {
    for (const item of Object.values(V2_EQUIPMENT)) {
      expect(Number.isInteger(item.tier)).toBe(true);
      expect(item.tier).toBeGreaterThanOrEqual(1);
      expect(item.tier).toBeLessThanOrEqual(5);
    }
  });
});

describe("pickEquipBonus", () => {
  it("EquipBonus 부분(atk/def + 6스탯)만 반환, 추가 파생(crit/mp/eva/hp) 제외", () => {
    const out = pickEquipBonus({
      str: 5,
      atk: 3,
      crit: 2,
      mp: 30,
      eva: 4,
      hp: 50,
    });
    expect(out).toEqual({ str: 5, atk: 3 });
  });

  it("빈 stats 는 빈 객체", () => {
    expect(pickEquipBonus({})).toEqual({});
  });

  it("0 값 키는 보존되지 않는다 (undefined 만 스킵)", () => {
    // 정확히는 0 도 보존되어야 하지만 — 우리 카탈로그는 0 값 키를 안 박음.
    // 그래도 의도된 동작을 명시: 정의된 값은 그대로.
    const out = pickEquipBonus({ str: 0, atk: 7 });
    expect(out).toEqual({ str: 0, atk: 7 });
  });
});

describe("parseEquipmentSave", () => {
  it("null/undefined → 빈 결과", () => {
    expect(parseEquipmentSave(null)).toEqual({ owned: [], equipped: {} });
    expect(parseEquipmentSave(undefined)).toEqual({ owned: [], equipped: {} });
  });

  it("owned 의 중복은 보존된다 (등장 횟수 = 보유 카운트)", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword", "v2_iron_sword", "v2_leather_armor"],
    });
    expect(r.owned).toEqual([
      "v2_iron_sword",
      "v2_iron_sword",
      "v2_leather_armor",
    ]);
  });

  it("owned 의 알 수 없는 id 는 제거", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword", "v2_fake_item", 42, null],
    });
    expect(r.owned).toEqual(["v2_iron_sword"]);
  });

  it("equipped 는 보유한 아이템만 인정 (race 보정)", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword"],
      equipped: { weapon: "v2_iron_sword", armor: "v2_leather_armor" },
    });
    expect(r.equipped).toEqual({ weapon: "v2_iron_sword" });
  });

  it("equipped 의 slot mismatch 는 거절", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword"],
      // 무기를 방어구 슬롯에 박으면 거절
      equipped: { armor: "v2_iron_sword" },
    });
    expect(r.equipped).toEqual({});
  });

  it("정상 raw 는 그대로 통과", () => {
    const raw = {
      owned: ["v2_iron_sword", "v2_chain_mail", "v2_jade_amulet"],
      equipped: {
        weapon: "v2_iron_sword",
        armor: "v2_chain_mail",
        accessory: "v2_jade_amulet",
      },
    };
    const r = parseEquipmentSave(raw);
    expect(r.owned).toEqual(raw.owned);
    expect(r.equipped).toEqual(raw.equipped);
  });

  it("equipped 의 알 수 없는 슬롯 키는 무시", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword"],
      equipped: {
        weapon: "v2_iron_sword",
        boots: "v2_iron_sword",
      } as Record<string, V2EquipmentId>,
    });
    expect(r.equipped).toEqual({ weapon: "v2_iron_sword" });
  });
});
