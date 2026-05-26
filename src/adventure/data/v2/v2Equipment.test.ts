import { describe, expect, it } from "vitest";
import {
  V2_EQUIPMENT,
  V2_EQUIP_BONUS_KEYS,
  V2_EQUIP_BONUS_LABELS,
  parseEquipmentSave,
  v2EquipmentBySlot,
  type V2EquipmentId,
  type V2EquipSlot,
} from "./v2Equipment";

const ALL_SLOTS: V2EquipSlot[] = ["weapon", "armor", "accessory"];

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

  it("PR-1 7종은 모두 stats 가 비어있지 않음 (적어도 1키)", () => {
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
});

describe("parseEquipmentSave", () => {
  it("null/undefined → 빈 결과", () => {
    expect(parseEquipmentSave(null)).toEqual({ owned: [], equipped: {} });
    expect(parseEquipmentSave(undefined)).toEqual({ owned: [], equipped: {} });
  });

  it("owned 의 중복은 한 번만 남는다", () => {
    const r = parseEquipmentSave({
      owned: ["v2_iron_sword", "v2_iron_sword", "v2_leather_armor"],
    });
    expect(r.owned).toEqual(["v2_iron_sword", "v2_leather_armor"]);
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
