// PR-S1 5배 해상도 — 단위 테스트는 pure 함수 aggregateV2Equipment 만 (db 의존 derive 는 통합/sim).
// expected 값들은 PR-S1 5배 스케일 (옛값 × 5) 로 갱신.

import { describe, expect, it } from "vitest";
import {
  aggregateV2Equipment,
  derivePlayerCombatV2Pure,
} from "./derivePlayerCombatV2";
import {
  V2_BASE_HP,
  V2_BASE_MP,
  V2_HP_PER_LEVEL,
} from "@/adventure/data/v2/v2Stats";
import { V2_EQUIPMENT, type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";

describe("aggregateV2Equipment", () => {
  it("빈 장비 → 모든 키 0", () => {
    expect(aggregateV2Equipment({})).toEqual({
      str: 0,
      dex: 0,
      vit: 0,
      spd: 0,
      luk: 0,
      int: 0,
      atk: 0,
      def: 0,
      crit: 0,
      mp: 0,
      eva: 0,
      hp: 0,
    });
  });

  it("철검 T1 (str+25 atk+3) → str=25 atk=3 나머지 0", () => {
    const a = aggregateV2Equipment({ weapon: "v2_iron_sword" });
    expect(a.str).toBe(25);
    expect(a.atk).toBe(3);
    expect(a.dex).toBe(0);
    expect(a.crit).toBe(0);
  });

  it("3슬롯 풀세팅 — 모든 키 합산 (T1 ×5 스케일)", () => {
    // 철검: str+25 atk+3
    // 쇠사슬 갑옷: vit+25 def+6 spd-5
    // 은가락지: luk+15
    const a = aggregateV2Equipment({
      weapon: "v2_iron_sword",
      armor: "v2_chain_mail",
      accessory: "v2_silver_ring",
    });
    expect(a.str).toBe(25);
    expect(a.atk).toBe(3);
    expect(a.vit).toBe(25);
    expect(a.def).toBe(6);
    expect(a.spd).toBe(-5);
    expect(a.luk).toBe(15);
  });

  it("추가 파생 (crit/mp/eva) 합산 — T5 풀 ×5 스케일", () => {
    // 별노래궁 T5: dex+125 atk+14 crit+7
    // 바람 망토 T5: dex+85 def+13 eva+10
    // 마나의 정수 T5: int+110 mp+90
    const a = aggregateV2Equipment({
      weapon: "v2_starsong_bow",
      armor: "v2_windweave_cloak",
      accessory: "v2_mana_essence",
    });
    expect(a.dex).toBe(125 + 85);
    expect(a.atk).toBe(14);
    expect(a.crit).toBe(7);
    expect(a.def).toBe(13);
    expect(a.eva).toBe(10);
    expect(a.int).toBe(110);
    expect(a.mp).toBe(90);
  });

  it("중갑 spd 페널티도 ×5 스케일 — 미스릴 갑옷 T5 = spd -25", () => {
    const a = aggregateV2Equipment({ armor: "v2_mithril_plate" });
    expect(a.vit).toBe(140);
    expect(a.def).toBe(30);
    expect(a.spd).toBe(-25);
  });

  it("luck 컨셉 5종은 luk/crit 만 채움 (컨셉 일관성)", () => {
    for (const id of [
      "v2_silver_ring",
      "v2_gold_ring",
      "v2_lucky_charm",
      "v2_stardust_ring",
      "v2_fate_ring",
    ] as const) {
      const stats = V2_EQUIPMENT[id as V2EquipmentId].stats;
      const allowed = new Set(["luk", "crit"]);
      for (const k of Object.keys(stats)) {
        expect(
          allowed.has(k),
          `${id}.stats.${k} 는 luck 컨셉 외 키`,
        ).toBe(true);
      }
    }
  });
});

describe("derivePlayerCombatV2Pure maxMp (V2_BASE_MP 가산)", () => {
  it("INT 0 신캐 (빈 장비) → maxMp = V2_BASE_MP", () => {
    const d = derivePlayerCombatV2Pure({
      level: 1,
      v2Equipped: {},
    });
    expect(d.player.maxMp).toBe(V2_BASE_MP);
    expect(d.totalStats.int).toBe(0);
  });

  it("INT 투자 시 추가 (V2_BASE_MP + int × 2)", () => {
    // INT 25 → maxMp = 50 + 25 × 2 = 100.
    const d = derivePlayerCombatV2Pure({
      level: 1,
      allocatedStats: { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 25 },
      v2Equipped: {},
    });
    expect(d.totalStats.int).toBe(25);
    expect(d.player.maxMp).toBe(V2_BASE_MP + 25 * 2);
  });

  it("mana accessory + INT 합산", () => {
    // 마나의 정수 T5: int+110 mp+90. + 베이스 50 + INT(0+110)×2 = 50+90+220 = 360.
    const d = derivePlayerCombatV2Pure({
      level: 1,
      v2Equipped: { accessory: "v2_mana_essence" },
    });
    expect(d.player.maxMp).toBe(V2_BASE_MP + 90 + 110 * 2);
  });
});

describe("derivePlayerCombatV2Pure maxHp (V2_BASE_HP + 레벨 성장 + vit)", () => {
  it("Lv1 신캐 (빈 장비, vit 15) → maxHp = V2_BASE_HP + vit = 135 + 15 = 150", () => {
    const d = derivePlayerCombatV2Pure({
      level: 1,
      v2Equipped: {},
    });
    expect(d.totalStats.vit).toBe(15);
    expect(d.maxHp).toBe(V2_BASE_HP + 15);
    expect(d.maxHp).toBe(150);
  });

  it("레벨 성장 — Lv100 = V2_BASE_HP + 99×5 + vit", () => {
    const d = derivePlayerCombatV2Pure({
      level: 100,
      v2Equipped: {},
    });
    expect(d.maxHp).toBe(V2_BASE_HP + 99 * V2_HP_PER_LEVEL + 15);
    expect(d.maxHp).toBe(135 + 495 + 15); // 645
  });

  it("vit 투자 시 추가 (HP_PER_VIT 1)", () => {
    const d = derivePlayerCombatV2Pure({
      level: 1,
      allocatedStats: { str: 0, dex: 0, vit: 50, spd: 0, luk: 0, int: 0 },
      v2Equipped: {},
    });
    // 베이스 vit 15 + 할당 50 = 65. maxHp = 135 + 65 = 200.
    expect(d.totalStats.vit).toBe(65);
    expect(d.maxHp).toBe(V2_BASE_HP + 65);
  });
});
