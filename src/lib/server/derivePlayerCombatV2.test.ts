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

describe("aggregateV2Equipment (PR-4a 위력/무게/옵션)", () => {
  it("빈 장비 → 모든 키 0", () => {
    expect(aggregateV2Equipment({})).toEqual({
      atk: 0,
      magicAtk: 0,
      def: 0,
      magicDef: 0,
      weight: 0,
      crit: 0,
      mp: 0,
      eva: 0,
      hp: 0,
    });
  });

  it("철검 T1 (위력 → 물공+마공 둘 다) → atk=3 magicAtk=3 weight=2", () => {
    // 철검: power 3, weight 2. 무기 위력은 atk·magicAtk 둘 다 먹인다.
    const a = aggregateV2Equipment({ weapon: "v2_iron_sword" });
    expect(a.atk).toBe(3);
    expect(a.magicAtk).toBe(3);
    expect(a.weight).toBe(2);
    expect(a.def).toBe(0);
    expect(a.crit).toBe(0);
  });

  it("3슬롯 풀세팅 — 위력 슬롯별 분기 + 무게 합산 (T1)", () => {
    // 철검: power 3 weight 2 (무기 → atk·magicAtk)
    // 쇠사슬 갑옷: power 2 weight 2 (방어구 → def)
    // 은가락지: power 1 weight 0 (장신구 → def·magicDef)
    const a = aggregateV2Equipment({
      weapon: "v2_iron_sword",
      armor: "v2_chain_mail",
      accessory: "v2_silver_ring",
    });
    expect(a.atk).toBe(3);
    expect(a.magicAtk).toBe(3);
    expect(a.def).toBe(2 + 1); // 방어구 + 장신구 위력
    expect(a.magicDef).toBe(1); // 장신구 위력만
    expect(a.weight).toBe(2 + 2 + 0);
  });

  it("옵션 (crit/eva/mp) 합산 + 위력 분기 — T5 풀", () => {
    // 별노래궁 T5: power 14 weight 2 crit 2
    // 바람 망토 T5: power 4 weight 1 eva 3
    // 마나의 정수 T5: power 3 weight 0 mp 30
    const a = aggregateV2Equipment({
      weapon: "v2_starsong_bow",
      armor: "v2_windweave_cloak",
      accessory: "v2_mana_essence",
    });
    expect(a.atk).toBe(14);
    expect(a.magicAtk).toBe(14);
    expect(a.def).toBe(4 + 3); // 방어구 + 장신구 위력
    expect(a.magicDef).toBe(3); // 장신구 위력
    expect(a.weight).toBe(2 + 1 + 0);
    expect(a.crit).toBe(2);
    expect(a.eva).toBe(3);
    expect(a.mp).toBe(30);
  });

  it("중갑 무게 — 미스릴 갑옷 T5 = def 10, weight 8", () => {
    const a = aggregateV2Equipment({ armor: "v2_mithril_plate" });
    expect(a.def).toBe(10);
    expect(a.weight).toBe(8);
    expect(a.magicDef).toBe(0); // 방어구는 마방 안 줌
  });

  it("장신구 위력은 def·magicDef 둘 다, 무게 0", () => {
    // 운명의 반지 T5: power 3 weight 0 crit 2.
    const a = aggregateV2Equipment({ accessory: "v2_fate_ring" });
    expect(a.def).toBe(3);
    expect(a.magicDef).toBe(3);
    expect(a.weight).toBe(0);
    expect(a.crit).toBe(2);
  });

  it("luck 컨셉 5종은 옵션이 crit 만 (정체성 일관성)", () => {
    for (const id of [
      "v2_silver_ring",
      "v2_gold_ring",
      "v2_lucky_charm",
      "v2_stardust_ring",
      "v2_fate_ring",
    ] as const) {
      const item = V2_EQUIPMENT[id as V2EquipmentId];
      expect(item.power, `${id}.power`).toBeGreaterThanOrEqual(1);
      for (const k of Object.keys(item.options ?? {})) {
        expect(k, `${id}.options.${k} 는 luck 컨셉 외 옵션`).toBe("crit");
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
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 0, int: 25 },
      v2Equipped: {},
    });
    expect(d.totalStats.int).toBe(25);
    expect(d.player.maxMp).toBe(V2_BASE_MP + 25 * 2);
  });

  it("mana accessory mp 옵션 가산 (스탯 token 없음 — PR-4a)", () => {
    // 마나의 정수 T5: power 3, mp 옵션 30. 장비는 더 이상 int token 을 안 줌.
    // maxMp = V2_BASE_MP(50) + mp 30 + INT(0)×2 = 80.
    const d = derivePlayerCombatV2Pure({
      level: 1,
      v2Equipped: { accessory: "v2_mana_essence" },
    });
    expect(d.totalStats.int).toBe(0); // 장비 token 없음
    expect(d.player.maxMp).toBe(V2_BASE_MP + 30);
  });
});

describe("derivePlayerCombatV2Pure magicAtk (PR-magic — INT 환산 마법 공격력)", () => {
  it("INT 0 빌드 → magicAtk 0 (마법 경로 비활성)", () => {
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 245, dex: 0, vit: 0, luk: 0, int: 0 },
      v2Equipped: {},
    });
    expect(d.totalStats.int).toBe(0);
    expect(d.player.magicAtk).toBe(0);
  });

  it("INT 투자 → magicAtk = floor(int × MAGIC_ATK_PER_INT 0.35)", () => {
    // 베이스 int 0 + 할당 100 = 100. magicAtk = floor(100 × 0.35) = 35.
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 0, int: 100 },
      v2Equipped: {},
    });
    expect(d.totalStats.int).toBe(100);
    expect(d.player.magicAtk).toBe(35);
  });

  it("지팡이 위력 → magicAtk·atk 둘 다 (PR-4a 무기 안 가림, int token 없음)", () => {
    // 별빛 지팡이 T5: power 17 (무기 → atk·magicAtk 둘 다). int token 없음.
    // magicAtk = floor(int 0 × 0.35) + 위력 17 = 17. atk = floor(str 15×0.2 + 17) = 20.
    const d = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: { weapon: "v2_starlit_staff" },
    });
    expect(d.totalStats.int).toBe(0); // 장비 token 없음
    expect(d.player.magicAtk).toBe(17);
    expect(d.player.atk).toBe(Math.floor(15 * 0.2) + 17); // 3 + 17 = 20
  });

  it("INT 0 물리빌드도 지팡이 위력만큼 magicAtk — 마법스킬 없으면 무용", () => {
    // 참나무 지팡이: power 5. magicAtk = floor(0×0.35) + 5 = 5. 물리 빌드는 마법스킬을 안
    // 배워 실제 데미지엔 안 쓰이지만 derive 합산 자체는 정상.
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 0, int: 0 },
      v2Equipped: { weapon: "v2_oak_staff" }, // power 5
    });
    expect(d.player.magicAtk).toBe(5);
  });
});

describe("derivePlayerCombatV2Pure critMult (PR-luk-critdmg — LUK 크리 데미지)", () => {
  it("luk 미투자(물리빌드) → critMult ≈ base 2.0 (+ 베이스 luk 15)", () => {
    const d = derivePlayerCombatV2Pure({
      level: 1,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 0, int: 0 },
      v2Equipped: {},
    });
    // PR-2 strict §4: critMult = base 2.0 + luk 15×0.006 + str 15×0.002 (행운 major + 힘 minor).
    expect(d.totalStats.luk).toBe(15);
    expect(d.player.critMult).toBeCloseTo(2.0 + 15 * 0.006 + 15 * 0.002);
  });

  it("luk 투자 → critMult = 2.0 + luk × 0.006 (투자 비례 크리 데미지)", () => {
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 200, int: 0 },
      v2Equipped: {},
    });
    // 베이스 15 + 투자 200 = 215. critMult = 2.0 + 215×0.006 + str 15×0.002 (힘 minor).
    expect(d.totalStats.luk).toBe(215);
    expect(d.player.critMult).toBeCloseTo(2.0 + 215 * 0.006 + 15 * 0.002);
  });

  it("critMult 안전 상한 cap 5.0 — 극단 luk 도 초과 안 함", () => {
    const d = derivePlayerCombatV2Pure({
      level: 100,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 1000, int: 0 },
      v2Equipped: {},
    });
    // luk 1015 → 2.0 + 1015×0.006 = 8.09 → cap 5.0.
    expect(d.player.critMult).toBe(5.0);
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
      allocatedStats: { str: 0, dex: 0, vit: 50, luk: 0, int: 0 },
      v2Equipped: {},
    });
    // 베이스 vit 15 + 할당 50 = 65. maxHp = 135 + 65 = 200.
    expect(d.totalStats.vit).toBe(65);
    expect(d.maxHp).toBe(V2_BASE_HP + 65);
  });
});
