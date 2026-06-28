// PR-S1 5배 해상도 — 단위 테스트는 pure 함수 aggregateV2Equipment 만 (db 의존 derive 는 통합/sim).
// expected 값들은 PR-S1 5배 스케일 (옛값 × 5) 로 갱신.

import { describe, expect, it } from "vitest";
import {
  aggregateV2Equipment,
  collectEquipSignatures,
  CRIT_MULT_CEIL,
  CRIT_MULT_SCALE,
  derivePlayerCombatV2,
  derivePlayerCombatV2FromSaves,
  derivePlayerCombatV2Pure,
  MAGIC_ATK_PER_INT,
  V2_BASE_COMBAT_BONUS,
  VIT_ATK_COEF,
} from "./derivePlayerCombatV2";
import { CRIT_MULT_BASE } from "@/adventure/data/v2/v2CombatConstants";
import {
  V2_BASE_HP,
  V2_BASE_MP,
  V2_HP_PER_LEVEL,
  V2_MP_PER_LEVEL,
} from "@/adventure/data/v2/v2Stats";
import { V2_EQUIPMENT, type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { V2_JOB_CATALOG } from "@/adventure/data/v2/v2JobCatalog";

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
      critMult: 0,
      spd: 0,
      healPowerPct: 0,
      critResist: 0,
    });
  });

  it("SPI gear 옵션(PR-2) — magicDef 옵션 → acc.magicDef, healPowerPct 옵션 → acc.healPowerPct", () => {
    // 경갑 T3 = magicDef 옵션 14(갑옷 위력은 물방). 목걸이 T3 = healPowerPct 옵션 8(+위력→magicDef).
    const armor = aggregateV2Equipment({ armor: "v2_windweave_cloak" });
    expect(armor.magicDef).toBe(14);
    expect(armor.healPowerPct).toBe(0);
    const neck = aggregateV2Equipment({ necklace: "v2_mana_essence" });
    expect(neck.healPowerPct).toBe(8);
    expect(neck.magicDef).toBeGreaterThan(0); // 목걸이 위력 → magicDef
  });
  it("SPI gear — 장비 healPowerPct 가 healMult 에 곱연산(패시브와 합산 경로)", () => {
    const plain = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    const geared = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: { necklace: "v2_mana_essence" }, // healPowerPct 8
    }).player;
    // 목걸이는 1차 스탯(vit/spi) 무변(PR-4a) → healMult 의 정신/활력항 동일, 회복강화 8%만 곱연산.
    expect(geared.healMult ?? 1).toBeCloseTo((plain.healMult ?? 1) * 1.08, 4);
  });

  it("철검 T1 (위력 → 물공) → atk=무기위력, magicAtk=0, weight=8(원시2×무기4)", () => {
    // 지팡이를 제외한 무기 위력은 물리 공격력에만 먹인다. 위력값은 카탈로그 기준(다이얼 변경에 견고).
    // 무게는 effectiveStats 슬롯 스케일 — 무기 ×4(WEAPON_WEIGHT_SCALE) → 원시 2 = 표시 8.
    const swordPow = V2_EQUIPMENT.v2_iron_sword.power;
    const a = aggregateV2Equipment({ weapon: "v2_iron_sword" });
    expect(a.atk).toBe(swordPow);
    expect(a.magicAtk).toBe(0);
    expect(a.weight).toBe(8);
    expect(a.def).toBe(0);
    expect(a.crit).toBe(0);
  });

  it("개체 굴림(statRolls) 있으면 카탈로그 대신 굴림값 — 위력·무게·옵션", () => {
    // 철검(무기)에 굴림 {power:10, weight:5} → atk=10, weight 5 × 무기4 = 20.
    const sword = aggregateV2Equipment(
      { weapon: "v2_iron_sword" },
      { v2_iron_sword: { power: 10, weight: 5 } },
    );
    expect(sword.atk).toBe(10);
    expect(sword.magicAtk).toBe(0);
    expect(sword.weight).toBe(20);

    // 별노래궁(무기)에 굴림 {power:18, weight:3, crit:3} → weight 3 × 무기4 = 12.
    const bow = aggregateV2Equipment(
      { weapon: "v2_starsong_bow" },
      { v2_starsong_bow: { power: 18, weight: 3, options: { crit: 3 } } },
    );
    expect(bow.atk).toBe(18);
    expect(bow.weight).toBe(12);
    expect(bow.crit).toBe(3);
  });

  it("statRolls 에 그 장비 굴림 없으면 카탈로그 그대로(비파괴)", () => {
    const a = aggregateV2Equipment(
      { weapon: "v2_iron_sword" },
      { v2_greatsword: { power: 99, weight: 0 } },
    );
    expect(a.atk).toBe(V2_EQUIPMENT.v2_iron_sword.power);
    expect(a.weight).toBe(8); // 철검 원시 2 × 무기4
  });

  it("슬롯별 분기 + 무게 합산 (T1) — 무기·갑옷·반지", () => {
    // 철검: 무기 위력 → atk, weight 원시2 × 무기4 = 8
    // 쇠사슬 갑옷: 위력 4(×2) weight 원시2 × 일반2 = 4 (갑옷 → def)
    // 은가락지: 위력 2(×2) weight 0 (반지 → magicDef)
    const a = aggregateV2Equipment({
      weapon: "v2_iron_sword",
      armor: "v2_chain_mail",
      ring: "v2_silver_ring",
    });
    expect(a.atk).toBe(V2_EQUIPMENT.v2_iron_sword.power);
    expect(a.magicAtk).toBe(0);
    expect(a.def).toBe(4); // 갑옷만(반지는 마방)
    expect(a.magicDef).toBe(2); // 반지 위력
    expect(a.weight).toBe(8 + 4 + 0);
  });

  it("장갑·신발 위력 → 물방 (+ 슬롯 축 crit·eva·spd)", () => {
    // 슬롯 고유 축(C): 바람결 장갑 T3 위력 4 crit 12 / 바람결 신 T3 위력 4 eva 12 spd 14.
    const a = aggregateV2Equipment({
      gloves: "v2_windweave_gloves",
      boots: "v2_windweave_boots",
    });
    expect(a.def).toBe(4 + 4);
    expect(a.magicDef).toBe(0);
    expect(a.crit).toBe(12);
    expect(a.eva).toBe(12);
    expect(a.spd).toBe(14);
  });

  it("옵션 (crit/eva/mp/hp) 합산 + 위력 분기 — T5 풀", () => {
    // 별노래궁: 무기 위력 weight 원시2 × 무기4 = 8, crit 2
    // 바람 망토: 위력 6 weight 원시1 × 일반2 = 2, eva 3 hp 80 (갑옷 축: 방어+HP)
    // 마나의 정수 T3: 위력 4(×2) weight 0 mp 48 + eva 3 (목걸이 → 마방, 워드 갈래)
    const a = aggregateV2Equipment({
      weapon: "v2_starsong_bow",
      armor: "v2_windweave_cloak",
      necklace: "v2_mana_essence",
    });
    expect(a.atk).toBe(V2_EQUIPMENT.v2_starsong_bow.power);
    expect(a.magicAtk).toBe(0);
    expect(a.def).toBe(6); // 갑옷만
    expect(a.magicDef).toBe(4 + 14); // 목걸이 위력 4 + 바람망토 magicDef 옵션 14(SPI gear PR-2)
    expect(a.healPowerPct).toBe(8); // 마나의 정수 healPowerPct 옵션(SPI gear PR-2)
    expect(a.weight).toBe(8 + 2 + 0);
    expect(a.crit).toBe(2);
    expect(a.eva).toBe(6); // 바람망토 3 + 마나의 정수 3
    expect(a.hp).toBe(80);
    expect(a.mp).toBe(48);
  });

  it("중갑 무게 — 미스릴 갑옷 T5 = def 18(×2), weight 원시8 × 일반2 = 16", () => {
    const a = aggregateV2Equipment({ armor: "v2_mithril_plate" });
    expect(a.def).toBe(18);
    expect(a.weight).toBe(16);
    expect(a.magicDef).toBe(0); // 방어구는 마방 안 줌
  });

  it("반지·목걸이 위력은 마방만(물방 X), 무게 0", () => {
    // 운명의 반지 T3: 위력 4(×2) weight 0 critMult 26(+0.26×) + spd 7 → 마방 + 치명피해(반지 축) + 속공 갈래.
    const a = aggregateV2Equipment({ ring: "v2_fate_ring" });
    expect(a.def).toBe(0); // 반지는 물방 안 줌
    expect(a.magicDef).toBe(4);
    expect(a.weight).toBe(0);
    expect(a.critMult).toBe(26);
    expect(a.spd).toBe(7);
    expect(a.crit).toBe(0);
  });

  it("luck 컨셉 반지는 critMult 1차 축 보유 (2차 축은 갈래별 다양)", () => {
    // 2026-06-08 다양화: 반지=치명피해 1차 축 유지 + 2차 축(crit/spd 등)으로 아키타입 갈래.
    //   단일 축 강제(critMult 만)는 폐지 — 슬롯 시그니처는 1차 축으로만 보존.
    for (const id of [
      "v2_silver_ring",
      "v2_lucky_charm",
      "v2_fate_ring",
    ] as const) {
      const item = V2_EQUIPMENT[id as V2EquipmentId];
      expect(item.power, `${id}.power`).toBeGreaterThanOrEqual(1);
      expect(
        item.options?.critMult ?? 0,
        `${id} 는 반지 1차 축(critMult) 보유`,
      ).toBeGreaterThan(0);
    }
  });

});

describe("derivePlayerCombatV2Pure maxMp (V2_BASE_MP 가산)", () => {
  it("기본 int 15 신캐 (빈 장비) → maxMp = V2_BASE_MP + 15×2", () => {
    const d = derivePlayerCombatV2Pure({
      level: 1,
      v2Equipped: {},
    });
    expect(d.totalStats.int).toBe(15); // 기본 int 15
    expect(d.player.maxMp).toBe(V2_BASE_MP + 15 * 2); // 50 + 30 = 80
  });

  it("INT 투자 시 추가 (V2_BASE_MP + int × 2)", () => {
    // 기본 15 + 할당 25 = 40 → maxMp = 50 + 40 × 2 = 130.
    const d = derivePlayerCombatV2Pure({
      level: 1,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 0, int: 25 },
      v2Equipped: {},
    });
    expect(d.totalStats.int).toBe(40);
    expect(d.player.maxMp).toBe(V2_BASE_MP + 40 * 2);
  });

  it("mana 목걸이 mp 옵션 가산 (스탯 token 없음 — PR-4a)", () => {
    // 마나의 정수 T3: power 2, mp 옵션 48(+eva 3). 장비는 int token 안 줌.
    // maxMp = V2_BASE_MP(50) + mp 48 + INT(기본15)×2 = 128.
    const d = derivePlayerCombatV2Pure({
      level: 1,
      v2Equipped: { necklace: "v2_mana_essence" },
    });
    expect(d.totalStats.int).toBe(15); // 기본 int (장비 token 없음)
    expect(d.player.maxMp).toBe(V2_BASE_MP + 48 + 15 * 2);
  });

  it("레벨 성장 — Lv100 → maxMp += (level−1)×V2_MP_PER_LEVEL", () => {
    // Lv100 빈 장비(int 15) → 50 + 99×V2_MP_PER_LEVEL + 15×2.
    const d = derivePlayerCombatV2Pure({ level: 100, v2Equipped: {} });
    expect(d.player.maxMp).toBe(V2_BASE_MP + 99 * V2_MP_PER_LEVEL + 15 * 2);
  });
});

describe("derivePlayerCombatV2Pure magicAtk (PR-magic — INT 환산 마법 공격력)", () => {
  it("기본 int 15 → magicAtk = floor(15×MAGIC_ATK_PER_INT) (마법 베이스라인)", () => {
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 245, dex: 0, vit: 0, luk: 0, int: 0 },
      v2Equipped: {},
    });
    expect(d.totalStats.int).toBe(15); // 기본 int 15 (할당 0)
    expect(d.player.magicAtk).toBe(
      Math.floor(15 * MAGIC_ATK_PER_INT) + V2_BASE_COMBAT_BONUS,
    );
  });

  it("INT 투자 → magicAtk = floor(int × MAGIC_ATK_PER_INT) (STR 대칭)", () => {
    // 기본 15 + 할당 100 = 115.
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 0, int: 100 },
      v2Equipped: {},
    });
    expect(d.totalStats.int).toBe(115);
    expect(d.player.magicAtk).toBe(
      Math.floor(115 * MAGIC_ATK_PER_INT) + V2_BASE_COMBAT_BONUS,
    );
  });

  it("지팡이 위력 → magicAtk + 물리 atk 1/3 (int token 없음)", () => {
    // 별빛 지팡이: 무기 위력 → magicAtk, 물리 atk 는 위력의 1/3 보조.
    const staffPow = V2_EQUIPMENT.v2_starlit_staff.power;
    const d = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: { weapon: "v2_starlit_staff" },
    });
    expect(d.totalStats.int).toBe(15); // 기본 int (장비 token 없음)
    expect(d.player.magicAtk).toBe(
      Math.floor(15 * MAGIC_ATK_PER_INT) + staffPow + V2_BASE_COMBAT_BONUS,
    );
    expect(d.player.atk).toBe(
      Math.floor(15 * 0.15 + 15 * VIT_ATK_COEF) +
        Math.floor(staffPow / 3) +
        V2_BASE_COMBAT_BONUS,
    );
  });

  it("기본 int 물리빌드도 지팡이 위력만큼 magicAtk — 마법스킬 없으면 무용", () => {
    // 참나무 지팡이 위력만큼 magicAtk 합산(물리 빌드는 마법스킬 없어 실제론 무용이나 derive 합산은 정상).
    const staffPow = V2_EQUIPMENT.v2_oak_staff.power;
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 0, int: 0 },
      v2Equipped: { weapon: "v2_oak_staff" },
    });
    expect(d.player.magicAtk).toBe(
      Math.floor(15 * MAGIC_ATK_PER_INT) + staffPow + V2_BASE_COMBAT_BONUS,
    );
  });
});

describe("derivePlayerCombatV2Pure critMult (점감 곡선 — LUK 크리 데미지)", () => {
  // 점감 곡선: critMult = CEIL − (CEIL − BASE) × exp(−bonus / SCALE).
  //   bonus = luk×0.007 + str×0.002 + 장비 + 맹공. bonus=0 → BASE, bonus↑ → CEIL 점근(하드캡 없음).
  const curve = (bonus: number) =>
    CRIT_MULT_CEIL - (CRIT_MULT_CEIL - CRIT_MULT_BASE) * Math.exp(-bonus / CRIT_MULT_SCALE);

  it("luk 미투자(물리빌드) → 곡선 바닥 ≈ base (+ 베이스 luk 15)", () => {
    const d = derivePlayerCombatV2Pure({
      level: 1,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 0, int: 0 },
      v2Equipped: {},
    });
    expect(d.totalStats.luk).toBe(15);
    expect(d.player.critMult).toBeCloseTo(curve(15 * 0.007 + 15 * 0.002));
  });

  it("luk 투자 → 곡선값(투자 비례 크리 데미지, 점감)", () => {
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 200, int: 0 },
      v2Equipped: {},
    });
    // 베이스 15 + 투자 200 = 215. bonus = 215×0.007 + str 15×0.002.
    expect(d.totalStats.luk).toBe(215);
    expect(d.player.critMult).toBeCloseTo(curve(215 * 0.007 + 15 * 0.002));
  });

  it("극단 luk → CEIL 로 점근하되 절대 도달X(하드캡 없음·죽은 투자 없음)", () => {
    const hi = derivePlayerCombatV2Pure({
      level: 100,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 1000, int: 0 },
      v2Equipped: {},
    });
    const mid = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 200, int: 0 },
      v2Equipped: {},
    });
    expect(hi.player.critMult).toBeCloseTo(curve(1015 * 0.007 + 15 * 0.002));
    expect(hi.player.critMult).toBeLessThan(CRIT_MULT_CEIL); // 천장 미도달
    expect(hi.player.critMult ?? 0).toBeGreaterThan(mid.player.critMult ?? 0); // 단조 증가(투자 의미 유지)
  });
});

describe("derivePlayerCombatV2Pure critResistPct (SPI PR-3b — 정신 치명저항·cap)", () => {
  it("정신(spi) 비례 치명저항 — 0.1/스탯, cap 50 클램프", () => {
    // spi 200 → 20%p(미달캡).
    const mid = derivePlayerCombatV2Pure({
      level: 60,
      allocatedStats: { spi: 200 },
      v2Equipped: {},
    }).player;
    expect(mid.critResistPct).toBeCloseTo((200 + 15) * 0.1, 5); // 기본 spi 15 포함
    // spi 1000 → 101.5%p raw → cap 50.
    const heavy = derivePlayerCombatV2Pure({
      level: 60,
      allocatedStats: { spi: 1000 },
      v2Equipped: {},
    }).player;
    expect(heavy.critResistPct).toBe(50);
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

  it("레벨 성장 — Lv100 = V2_BASE_HP + 99×10 + vit", () => {
    const d = derivePlayerCombatV2Pure({
      level: 100,
      v2Equipped: {},
    });
    expect(d.maxHp).toBe(V2_BASE_HP + 99 * V2_HP_PER_LEVEL + 15);
    expect(d.maxHp).toBe(135 + 990 + 15); // 1140
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

describe("derivePlayerCombatV2Pure — 상위 직업 % 패시브(statPct/maxHpPct/maxMpPct)", () => {
  it("statPct — 플랫 가산 뒤 곱 적용(근력 II 힘 +15%)", () => {
    const base = derivePlayerCombatV2Pure({
      level: 1,
      allocatedStats: { str: 100, dex: 0, vit: 0, luk: 0, int: 0 },
      v2Equipped: {},
    });
    const withPct = derivePlayerCombatV2Pure({
      level: 1,
      allocatedStats: { str: 100, dex: 0, vit: 0, luk: 0, int: 0 },
      v2Equipped: {},
      statPct: { str: 15 },
    });
    expect(withPct.totalStats.str).toBe(Math.floor(base.totalStats.str * 1.15));
  });

  it("플랫 jobBonus + statPct — 가산 후 % (순서)", () => {
    const alloc = { str: 100, dex: 0, vit: 0, luk: 0, int: 0 } as const;
    // 플랫만 적용한 기준(가산 후) → 거기에 % 곱이 붙어야 한다(곱이 가산 뒤 순서).
    const flatOnly = derivePlayerCombatV2Pure({
      level: 1,
      allocatedStats: alloc,
      v2Equipped: {},
      jobBonus: { str: 10 },
    });
    const d = derivePlayerCombatV2Pure({
      level: 1,
      allocatedStats: alloc,
      v2Equipped: {},
      jobBonus: { str: 10 },
      statPct: { str: 15 },
    });
    expect(d.totalStats.str).toBe(Math.floor(flatOnly.totalStats.str * 1.15));
  });

  it("maxHpPct — 최대 HP 비례 증가(체력 +12%)", () => {
    const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} });
    const withPct = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      maxHpPct: 12,
    });
    expect(withPct.maxHp).toBe(Math.floor(base.maxHp * 1.12));
  });

  it("maxMpPct — 최대 MP 비례 증가(마나 +12%)", () => {
    const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} });
    const withPct = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      maxMpPct: 12,
    });
    expect(withPct.player.maxMp).toBe(Math.floor((base.player.maxMp ?? 0) * 1.12));
  });

  it("미지정(flag off/sim) → 무변경(byte-identical)", () => {
    const base = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} });
    const same = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      statPct: undefined,
      maxHpPct: undefined,
      maxMpPct: undefined,
    });
    expect(same.maxHp).toBe(base.maxHp);
    expect(same.player.maxMp).toBe(base.player.maxMp);
    expect(same.totalStats).toEqual(base.totalStats);
  });
});

describe("derivePlayerCombatV2Pure weaponElement (무기 속성 폐지 — 항상 neutral)", () => {
  it("무기 속성 폐지 → 어떤 무기든 weaponElement = neutral", () => {
    // 속성 무기가 더는 없음 → 평타 속성은 캐릭터 선택으로(hunt/arena 가 weaponElement!==neutral 분기).
    const d = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: { weapon: "v2_starsong_bow" },
    });
    expect(d.weaponElement).toBe("neutral");
  });

  it("무속성 무기/미장착 → neutral", () => {
    // 철검 = element 미지정.
    expect(
      derivePlayerCombatV2Pure({
        level: 50,
        v2Equipped: { weapon: "v2_iron_sword" },
      }).weaponElement,
    ).toBe("neutral");
    // 무기 없음.
    expect(
      derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).weaponElement,
    ).toBe("neutral");
  });

});

describe("P4 — 구 직업 패시브 은퇴 + 차수 앵커 보정", () => {
  const STATS = { str: 40, dex: 40, vit: 40, int: 40, spi: 40, luk: 40 };

  it("구 직업 패시브 필드는 (스킬 학습해도) 미설정 — 은퇴", () => {
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: STATS,
      playerClass: "warrior",
      learnedSkillIds: ["v2_skill_strike"],
    }).player;
    expect(d.passiveTurnHealPctMaxHp).toBeUndefined();
    expect(d.passiveDefPenetrationPct).toBeUndefined();
    expect(d.passiveCounterChancePct).toBeUndefined();
    expect(d.passiveMagicBasicAttack).toBeUndefined();
  });

  it("차수 앵커 보정 — 전사 STR: 1차 +10%, 4차 +35% (차수가 prof.tier 에서 옴)", () => {
    const none = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: STATS,
      playerClass: "none",
      classTier: 1,
    }).totalStats.str; // 보정 없음 = floor(=base+40)
    const t1 = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: STATS,
      playerClass: "warrior",
      classTier: 1,
    }).totalStats.str;
    const t4 = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: STATS,
      playerClass: "warrior",
      classTier: 4,
    }).totalStats.str;
    expect(t1).toBe(Math.floor(none * 1.1));
    expect(t4).toBe(Math.floor(none * 1.35));
    expect(t4).toBeGreaterThan(t1);
  });

  it("classTier 미지정 = 1차 보정", () => {
    const t1 = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: STATS,
      playerClass: "warrior",
      classTier: 1,
    }).totalStats.str;
    const dflt = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: STATS,
      playerClass: "warrior",
    }).totalStats.str;
    expect(dflt).toBe(t1);
  });
});

describe("세트 보너스 (aggregateV2Equipment — 전 조각 장착 시 후-가산)", () => {
  // 마른땅 갑주(dry_canyon, 중갑 3종) — 3종 다 착용 시 crit+5·HP+30.
  // (들가죽 세트는 2026-06-08 대장간 제작 콘텐츠 제거와 함께 삭제 → 잔존 세트로 메커니즘 검증.)
  // 개별 조각 수치에 비의존: "풀세트 집계 − 조각별 집계 합 = 세트 보너스" 델타로만 검증.
  const FULL = {
    armor: "v2_canyon_set_armor" as const,
    gloves: "v2_canyon_set_gloves" as const,
    boots: "v2_canyon_set_boots" as const,
  };

  it("3종 다 착용 → 세트 보너스 적용 (개별 합 대비 델타 = crit+5·critMult+30·hp+30)", () => {
    const full = aggregateV2Equipment(FULL);
    const a = aggregateV2Equipment({ armor: FULL.armor });
    const g = aggregateV2Equipment({ gloves: FULL.gloves });
    const b = aggregateV2Equipment({ boots: FULL.boots });
    expect(full.crit - (a.crit + g.crit + b.crit)).toBe(5);
    expect(full.critMult - (a.critMult + g.critMult + b.critMult)).toBe(30);
    expect(full.hp - (a.hp + g.hp + b.hp)).toBe(30);
  });

  it("일부(2종)만 착용 → 세트 보너스 없음 (개별 합과 동일)", () => {
    const partial = aggregateV2Equipment({ armor: FULL.armor, gloves: FULL.gloves });
    const a = aggregateV2Equipment({ armor: FULL.armor });
    const g = aggregateV2Equipment({ gloves: FULL.gloves });
    expect(partial.crit).toBe(a.crit + g.crit);
    expect(partial.hp).toBe(a.hp + g.hp);
  });

  it("태그 세트 — 같은 setTags 2/3개 장착 시 단계 보너스 누적 적용", () => {
    const two = aggregateV2Equipment({
      armor: "v2_throne_black_armor",
      gloves: "v2_throne_black_gloves",
    });
    const armor = aggregateV2Equipment({ armor: "v2_throne_black_armor" });
    const gloves = aggregateV2Equipment({ gloves: "v2_throne_black_gloves" });
    expect(two.hp - (armor.hp + gloves.hp)).toBe(100);
    expect(two.magicDef - (armor.magicDef + gloves.magicDef)).toBe(10);
    expect(two.critResist).toBe(0);

    const three = aggregateV2Equipment({
      armor: "v2_throne_black_armor",
      gloves: "v2_throne_black_gloves",
      boots: "v2_throne_black_boots",
    });
    const boots = aggregateV2Equipment({ boots: "v2_throne_black_boots" });
    expect(three.hp - (armor.hp + gloves.hp + boots.hp)).toBe(260);
    expect(three.magicDef - (armor.magicDef + gloves.magicDef + boots.magicDef)).toBe(28);
    expect(three.critResist).toBe(8);
  });
});

describe("derivePlayerCombatV2FromSaves (사냥 라우트 dedup용 — select 래퍼와 동등)", () => {
  // 모든 필드 optional 인 SavedCharacterV2 구조에 맞는 픽스처(변수로 둬 excess-property 회피).
  const character = {
    level: 50,
    hp: 500,
    mp: 100,
    class: "warrior",
    selectedStance: null,
    specChoice: null,
  };

  it("character 없으면 null (래퍼와 동일)", () => {
    expect(
      derivePlayerCombatV2FromSaves({
        character: undefined,
        equipmentSave: {},
        proficiencyRaw: {},
        skillsRaw: {},
      }),
    ).toBeNull();
  });

  it("4 save → derive: select 래퍼(derivePlayerCombatV2)와 byte-동일 결과", async () => {
    const saves = {
      character,
      equipmentSave: { owned: [], equipped: {} },
      proficiencyRaw: {},
      skillsRaw: { learned: [], equipped: [] },
    };
    // 래퍼는 4개 row 를 select 후 FromSaves 호출 — mock executor 로 그 row 들을 돌려준다.
    const rows = [
      { key: "character.v2", value: saves.character },
      { key: "equipment.v2", value: saves.equipmentSave },
      { key: "proficiency.v2", value: saves.proficiencyRaw },
      { key: "skills.v2", value: saves.skillsRaw },
    ];
    const mockExecutor = {
      select: () => ({ from: () => ({ where: async () => rows }) }),
    } as never;

    const viaWrapper = await derivePlayerCombatV2("u1", mockExecutor);
    const viaSaves = derivePlayerCombatV2FromSaves(saves);
    expect(viaWrapper).not.toBeNull();
    expect(viaWrapper).toEqual(viaSaves); // 리팩터 동등성 — 래퍼 = select + FromSaves
    expect(viaSaves!.player.atk).toBeGreaterThan(0);
  });
});

describe("derivePlayerCombatV2 preloaded (사냥 배치 char/equip 중복 select 제거)", () => {
  const character = {
    level: 50, hp: 500, mp: 100, class: "warrior",
    selectedStance: null, specChoice: null,
  };
  const equipmentSave = { owned: [], equipped: {} };
  const profVal = {};
  const skillsVal = { learned: [], equipped: [] };

  it("preloaded char+equip → prof/skills 만 select 해도 full derive 와 동일", async () => {
    // full: 4-key select.
    const fullRows = [
      { key: "character.v2", value: character },
      { key: "equipment.v2", value: equipmentSave },
      { key: "proficiency.v2", value: profVal },
      { key: "skills.v2", value: skillsVal },
    ];
    const fullExec = {
      select: () => ({ from: () => ({ where: async () => fullRows }) }),
    } as never;
    const baseline = await derivePlayerCombatV2("u", fullExec);

    // preloaded: char/equip 안 넘어옴 → select 는 prof/skills 만 반환(2-key) 시뮬.
    const partialRows = [
      { key: "proficiency.v2", value: profVal },
      { key: "skills.v2", value: skillsVal },
    ];
    const partialExec = {
      select: () => ({ from: () => ({ where: async () => partialRows }) }),
    } as never;
    const viaPreloaded = await derivePlayerCombatV2("u", partialExec, {
      character,
      equipmentSave,
    });

    expect(baseline).not.toBeNull();
    expect(viaPreloaded).toEqual(baseline); // char/equip 재select 없이 동일 결과
  });

  it("preloaded 4개 모두(char+equip+prof+skills) → select 0회 + full derive 와 동일", async () => {
    // baseline — 4-key select.
    const fullRows = [
      { key: "character.v2", value: character },
      { key: "equipment.v2", value: equipmentSave },
      { key: "proficiency.v2", value: profVal },
      { key: "skills.v2", value: skillsVal },
    ];
    const baseline = await derivePlayerCombatV2("u", {
      select: () => ({ from: () => ({ where: async () => fullRows }) }),
    } as never);

    // 4개 모두 preload → keys 빈 배열 → executor.select 호출 0(사냥 라우트 경로). select 가
    // 호출되면 throw 하는 executor 로 "왕복 0" 을 강제 검증.
    let selectCalls = 0;
    const noQueryExec = {
      select: () => {
        selectCalls++;
        throw new Error("preloaded 4개면 select 가 호출되면 안 된다");
      },
    } as never;
    const viaAllPreloaded = await derivePlayerCombatV2("u", noQueryExec, {
      character,
      equipmentSave,
      proficiencyRaw: profVal,
      skillsRaw: skillsVal,
    });

    expect(selectCalls).toBe(0); // DB 왕복 0
    expect(viaAllPreloaded).not.toBeNull();
    expect(viaAllPreloaded).toEqual(baseline); // 재select 없이 동일 결과
  });
});

describe("derivePlayerCombatV2Pure jobBonus (PR-4 직업 보너스 플랫 주입)", () => {
  const base = () => derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} });

  it("미지정/빈 객체 = 무변경(byte-identical, flag off·sim 호환)", () => {
    const b = base();
    const undef = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      jobBonus: undefined,
    });
    const empty = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      jobBonus: {},
    });
    expect(undef.totalStats).toEqual(b.totalStats);
    expect(empty.totalStats).toEqual(b.totalStats);
    expect(empty.player.atk).toBe(b.player.atk);
  });

  it("플랫 보너스가 totalStats 에 가산되고 파생 스탯에 흐른다", () => {
    const b = base();
    const boosted = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      jobBonus: { str: 100, vit: 100 },
    });
    expect(boosted.totalStats.str).toBe(b.totalStats.str + 100);
    expect(boosted.totalStats.vit).toBe(b.totalStats.vit + 100);
    // str → atk, vit → maxHp·def 로 자연 반영.
    expect(boosted.player.atk).toBeGreaterThan(b.player.atk);
    expect(boosted.maxHp).toBeGreaterThan(b.maxHp);
    expect(boosted.player.def).toBeGreaterThan(b.player.def);
  });

  it("카탈로그 jobBonus(내장 보너스) 연동 — 견습 기사(squire) 카탈로그값 그대로 가산", () => {
    const b = base();
    const bonus = V2_JOB_CATALOG.squire.jobBonus;
    const squire = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      jobBonus: bonus,
    });
    // 하드코딩 회피 — 카탈로그 값을 그대로 검증(다이얼 변경에 견고).
    expect(squire.totalStats.str).toBe(b.totalStats.str + (bonus.str ?? 0));
    expect(squire.totalStats.dex).toBe(b.totalStats.dex + (bonus.dex ?? 0));
    expect(bonus.str ?? 0).toBeGreaterThan(0); // 내장 보너스 존재(0으로 비지 않게)
  });
});

describe("derivePlayerCombatV2Pure jobPassiveEffect (직업 킷 — 효과 패시브)", () => {
  it("spdPctAdd 주입 시 spd 증가(견습 도적), 미지정은 무변경", () => {
    const base = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { dex: 100 },
      v2Equipped: {},
    });
    const boosted = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { dex: 100 },
      v2Equipped: {},
      jobPassiveEffect: { spdPctAdd: 15 },
    });
    expect(boosted.player.spd).toBeGreaterThan(base.player.spd);
  });
});

describe("derivePlayerCombatV2Pure atkPerDexCoef (예기 — 패시브 스킬)", () => {
  it("atkPerDexCoef 주입 시 DEX가 공격력 보조", () => {
    const noCoef = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { dex: 200 },
      v2Equipped: {},
      playerClass: "warrior",
      atkPerDexCoef: 0, // 예기 미장착
    });
    const withCoef = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { dex: 200 },
      v2Equipped: {},
      playerClass: "warrior",
      atkPerDexCoef: 0.08, // 예기 장착
    });
    expect(withCoef.player.atk).toBeGreaterThan(noCoef.player.atk);
  });

  it("미지정(undefined)이면 도적 직군 베이스라인 폴백(flag off 호환)", () => {
    const rogue = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { dex: 200 },
      v2Equipped: {},
      playerClass: "rogue", // atkPerDexCoef 미지정 → 도적 베이스라인 dex→atk
    });
    const warrior = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { dex: 200 },
      v2Equipped: {},
      playerClass: "warrior", // 미지정 → 0
    });
    expect(rogue.player.atk).toBeGreaterThan(warrior.player.atk);
  });
});

describe("derivePlayerCombatV2Pure 다양성 패시브(A 메타 — 장착 패시브 → 전투 레버)", () => {
  const base = { level: 50, v2Equipped: {}, playerClass: "warrior" as const };
  it("치명확률/치명피해/회피/흡혈이 derive 레버에 가산된다", () => {
    const plain = derivePlayerCombatV2Pure({ ...base }).player;
    const buffed = derivePlayerCombatV2Pure({
      ...base,
      passiveCritPct: 8,
      passiveCritDmgPct: 30, // +0.30×
      passiveEvasionPct: 10,
      passiveLifestealPct: 4,
    }).player;
    expect((buffed.critChancePct ?? 0) - (plain.critChancePct ?? 0)).toBeCloseTo(
      8,
      5,
    );
    // 맹공(critDmgPct) → critMult 점감 곡선에 가산(wired + 정확 magnitude). flat 아님.
    //   역곡선으로 bonus 복원 — passiveCritDmgPct 30 → bonus 정확히 +0.30(drop/double-count 가드).
    expect(buffed.critMult ?? 0).toBeGreaterThan(plain.critMult ?? 0);
    const invCurve = (m: number) =>
      -CRIT_MULT_SCALE *
      Math.log((CRIT_MULT_CEIL - m) / (CRIT_MULT_CEIL - CRIT_MULT_BASE));
    expect(invCurve(buffed.critMult ?? 0) - invCurve(plain.critMult ?? 0)).toBeCloseTo(
      30 / 100,
      5,
    );
    expect((buffed.evasionPct ?? 0) - (plain.evasionPct ?? 0)).toBeCloseTo(10, 5);
    // 흡혈 — 미장착 시 미설정(undefined), 장착 시 enchantLifestealPct 훅으로 노출.
    expect(plain.enchantLifestealPct ?? 0).toBe(0);
    expect(buffed.enchantLifestealPct).toBe(4);
  });

  it("방어%/명중(다양성 2차)이 derive 레버에 적용된다 (PvE/PvP 공용)", () => {
    const plain = derivePlayerCombatV2Pure({ ...base }).player;
    const buffed = derivePlayerCombatV2Pure({
      ...base,
      passiveDefPct: 20,
      passiveAccuracyPct: 12,
    }).player;
    // 방어% — def 곱연산(철벽).
    expect(buffed.def).toBe(Math.floor(plain.def * 1.2));
    // 명중 — accuracyPct 가산(정밀). 저레벨 베이스라 캡(35) 미도달 → +12.
    expect((buffed.accuracyPct ?? 0) - (plain.accuracyPct ?? 0)).toBeCloseTo(
      12,
      5,
    );
  });

  it("광전 패시브는 잃은 HP 비례 공격력 레버로 노출된다", () => {
    const plain = derivePlayerCombatV2Pure({ ...base }).player;
    const berserker = derivePlayerCombatV2Pure({
      ...base,
      passiveBerserkAtkPctPerLostHpPct: 0.45,
    }).player;
    expect(plain.berserkAtkPctPerLostHpPct).toBeUndefined();
    expect(berserker.berserkAtkPctPerLostHpPct).toBe(0.45);
  });

  it("마법취약 패시브는 스킬 적중 취약 누적 레버로 노출된다", () => {
    const plain = derivePlayerCombatV2Pure({ ...base }).player;
    const shaman = derivePlayerCombatV2Pure({
      ...base,
      passiveEnemyMagicVulnPctPerStack: 5,
    }).player;
    expect(plain.enemyMagicVulnPctPerStack).toBeUndefined();
    expect(shaman.enemyMagicVulnPctPerStack).toBe(5);
  });

  it("미지정/0 이면 무영향 (byte-identical 레버)", () => {
    const a = derivePlayerCombatV2Pure({ ...base }).player;
    const b = derivePlayerCombatV2Pure({
      ...base,
      passiveCritPct: 0,
      passiveCritDmgPct: 0,
      passiveEvasionPct: 0,
      passiveLifestealPct: 0,
      passiveDefPct: 0,
      passiveAccuracyPct: 0,
      passiveBerserkAtkPctPerLostHpPct: 0,
      passiveEnemyMagicVulnPctPerStack: 0,
    }).player;
    expect(b.critChancePct ?? 0).toBe(a.critChancePct ?? 0);
    expect(b.critMult ?? 0).toBe(a.critMult ?? 0);
    expect(b.evasionPct ?? 0).toBe(a.evasionPct ?? 0);
    expect(b.enchantLifestealPct ?? 0).toBe(0);
    expect(b.def).toBe(a.def);
    expect(b.accuracyPct ?? 0).toBe(a.accuracyPct ?? 0);
    expect(b.berserkAtkPctPerLostHpPct).toBeUndefined();
    expect(b.enemyMagicVulnPctPerStack).toBeUndefined();
  });
});

describe("derivePlayerCombatV2Pure healMult (SPI 부활 PR-1 — 정신 주력 힐 + 회복강화)", () => {
  const base = { level: 50, v2Equipped: {}, playerClass: "warrior" as const };
  it("정신(spi)이 힐 주축 — +0.006/스탯, vit(+0.004)보다 큰 기여", () => {
    const plain = derivePlayerCombatV2Pure({ ...base }).player; // 기본 spi 15·vit 15
    const spiBuild = derivePlayerCombatV2Pure({
      ...base,
      allocatedStats: { spi: 100 },
    }).player;
    const vitBuild = derivePlayerCombatV2Pure({
      ...base,
      allocatedStats: { vit: 100 },
    }).player;
    // spi +100 → healMult +0.6, vit +100 → +0.4. 정신이 더 큰 힐 스탯.
    expect((spiBuild.healMult ?? 1) - (plain.healMult ?? 1)).toBeCloseTo(0.6, 5);
    expect((vitBuild.healMult ?? 1) - (plain.healMult ?? 1)).toBeCloseTo(0.4, 5);
    expect(spiBuild.healMult ?? 1).toBeGreaterThan(vitBuild.healMult ?? 1);
  });
  it("회복강화 패시브(passiveHealPowerPct) — healMult 곱연산 ×(1+%/100)", () => {
    const plain = derivePlayerCombatV2Pure({ ...base }).player;
    const boosted = derivePlayerCombatV2Pure({
      ...base,
      passiveHealPowerPct: 25,
    }).player;
    expect(boosted.healMult ?? 1).toBeCloseTo((plain.healMult ?? 1) * 1.25, 5);
  });
  it("passiveHealPowerPct 0/미지정 = 무영향(byte-identical)", () => {
    const a = derivePlayerCombatV2Pure({ ...base }).player;
    const b = derivePlayerCombatV2Pure({
      ...base,
      passiveHealPowerPct: 0,
    }).player;
    expect(b.healMult ?? 1).toBe(a.healMult ?? 1);
  });
});

describe("derivePlayerCombatV2Pure thornsFlatFromDef (수호자 가시 방벽)", () => {
  it("passiveThornsDefPct 100 → thornsFlatFromDef = def (방어 계수만큼)", () => {
    const p = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      passiveThornsDefPct: 100,
    }).player;
    expect(p.thornsFlatFromDef).toBe(p.def);
  });

  it("passiveThornsDefPct 50 → def 의 50%(floor)", () => {
    const p = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: {},
      passiveThornsDefPct: 50,
    }).player;
    expect(p.thornsFlatFromDef).toBe(Math.floor(p.def * 0.5));
  });

  it("미지정 → thornsFlatFromDef 미설정(inert·byte-identical)", () => {
    const p = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    expect(p.thornsFlatFromDef).toBeUndefined();
  });
});

describe("collectEquipSignatures + equipSignatures 배선 (고유 시그니처 Phase 2)", () => {
  it("시그니처 없음 → 빈 배열", () => {
    expect(collectEquipSignatures({})).toEqual([]);
    // 일반 장비(시그니처 없는 흔한템)만 → 빈 배열.
    expect(
      collectEquipSignatures({ weapon: "v2_iron_sword" } as never),
    ).toEqual([]);
  });

  it("마퀴 단품(봉인된 반지) 장착 → on_dodge 시그니처", () => {
    const sigs = collectEquipSignatures({
      ring: "v2_sanctum_sig_sealed_ring",
    } as never);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].trigger).toBe("on_dodge");
    expect(sigs[0].label).toBe("봉인");
  });

  it("세트(성물) 전 조각 장착 → low_hp 시그니처, 부분 장착 → 없음", () => {
    const full = collectEquipSignatures({
      armor: "v2_sanctum_sig_priest_armor",
      necklace: "v2_sanctum_sig_priest_necklace",
    } as never);
    expect(full.some((s) => s.trigger === "low_hp" && s.label === "성물")).toBe(
      true,
    );
    // 한 조각만 → 세트 미완성 → 성물 시그니처 없음(그 조각 단품 시그니처도 없음).
    const partial = collectEquipSignatures({
      armor: "v2_sanctum_sig_priest_armor",
    } as never);
    expect(partial).toEqual([]);
  });

  it("derive → 시그니처 없으면 player.equipSignatures 미설정(byte-identical), 있으면 채움", () => {
    const none = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    expect(none.equipSignatures).toBeUndefined();
    const withSig = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: { ring: "v2_sanctum_sig_sealed_ring" } as never,
    }).player;
    expect(withSig.equipSignatures?.[0]?.trigger).toBe("on_dodge");
  });
});
