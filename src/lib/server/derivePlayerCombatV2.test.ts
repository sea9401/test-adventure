// PR-S1 5배 해상도 — 단위 테스트는 pure 함수 aggregateV2Equipment 만 (db 의존 derive 는 통합/sim).
// expected 값들은 PR-S1 5배 스케일 (옛값 × 5) 로 갱신.

import { describe, expect, it } from "vitest";
import {
  aggregateV2Equipment,
  derivePlayerCombatV2Pure,
  V2_BASE_COMBAT_BONUS,
} from "./derivePlayerCombatV2";
import {
  V2_BASE_HP,
  V2_BASE_MP,
  V2_HP_PER_LEVEL,
} from "@/adventure/data/v2/v2Stats";
import { V2_EQUIPMENT, type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { getJobSpec } from "@/adventure/data/v2/v2JobSpecs";

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

  it("개체 굴림(statRolls) 있으면 카탈로그 대신 굴림값 — 위력·무게·옵션", () => {
    // 철검(카탈로그 power4/weight2)에 굴림 {power:10, weight:5} → atk·magicAtk=10, weight=5.
    const sword = aggregateV2Equipment(
      { weapon: "v2_iron_sword" },
      { v2_iron_sword: { power: 10, weight: 5 } },
    );
    expect(sword.atk).toBe(10);
    expect(sword.magicAtk).toBe(10);
    expect(sword.weight).toBe(5);

    // 별노래궁(카탈로그 power14/crit2)에 굴림 {power:18, weight:3, crit:3}.
    const bow = aggregateV2Equipment(
      { weapon: "v2_starsong_bow" },
      { v2_starsong_bow: { power: 18, weight: 3, options: { crit: 3 } } },
    );
    expect(bow.atk).toBe(18);
    expect(bow.weight).toBe(3);
    expect(bow.crit).toBe(3);
  });

  it("statRolls 에 그 장비 굴림 없으면 카탈로그 그대로(비파괴)", () => {
    const a = aggregateV2Equipment(
      { weapon: "v2_iron_sword" },
      { v2_steel_sword: { power: 99, weight: 0 } },
    );
    expect(a.atk).toBe(3);
    expect(a.weight).toBe(2);
  });

  it("슬롯별 분기 + 무게 합산 (T1) — 무기·갑옷·반지", () => {
    // 철검: power 3 weight 2 (무기 → atk·magicAtk)
    // 쇠사슬 갑옷: power 2 weight 2 (갑옷 → def)
    // 은가락지: power 1 weight 0 (반지 → magicDef)
    const a = aggregateV2Equipment({
      weapon: "v2_iron_sword",
      armor: "v2_chain_mail",
      ring: "v2_silver_ring",
    });
    expect(a.atk).toBe(3);
    expect(a.magicAtk).toBe(3);
    expect(a.def).toBe(2); // 갑옷만(반지는 마방)
    expect(a.magicDef).toBe(1); // 반지 위력
    expect(a.weight).toBe(2 + 2 + 0);
  });

  it("장갑·신발 위력 → 물방 (+ 시그니처 옵션 crit/eva)", () => {
    // 미스릴 건틀릿 T5: power 2 crit 2 / 미스릴 장화 T5: power 2 eva 2.
    const a = aggregateV2Equipment({
      gloves: "v2_mithril_gauntlets",
      boots: "v2_mithril_boots",
    });
    expect(a.def).toBe(2 + 2);
    expect(a.magicDef).toBe(0);
    expect(a.crit).toBe(2);
    expect(a.eva).toBe(2);
  });

  it("옵션 (crit/eva/mp) 합산 + 위력 분기 — T5 풀", () => {
    // 별노래궁 T5: power 26 weight 2 crit 2
    // 바람 망토 T5: power 3 weight 1 eva 3
    // 마나의 정수 T5: power 2 weight 0 mp 30 (목걸이 → 마방)
    const a = aggregateV2Equipment({
      weapon: "v2_starsong_bow",
      armor: "v2_windweave_cloak",
      necklace: "v2_mana_essence",
    });
    expect(a.atk).toBe(26);
    expect(a.magicAtk).toBe(26);
    expect(a.def).toBe(3); // 갑옷만
    expect(a.magicDef).toBe(2); // 목걸이 위력
    expect(a.weight).toBe(2 + 1 + 0);
    expect(a.crit).toBe(2);
    expect(a.eva).toBe(3);
    expect(a.mp).toBe(30);
  });

  it("중갑 무게 — 미스릴 갑옷 T5 = def 9, weight 8", () => {
    const a = aggregateV2Equipment({ armor: "v2_mithril_plate" });
    expect(a.def).toBe(9);
    expect(a.weight).toBe(8);
    expect(a.magicDef).toBe(0); // 방어구는 마방 안 줌
  });

  it("반지·목걸이 위력은 마방만(물방 X), 무게 0", () => {
    // 운명의 반지 T5: power 2 weight 0 crit 2 → 마방만.
    const a = aggregateV2Equipment({ ring: "v2_fate_ring" });
    expect(a.def).toBe(0); // 반지는 물방 안 줌
    expect(a.magicDef).toBe(2);
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
    // 마나의 정수 T5: power 2, mp 옵션 30. 장비는 int token 안 줌.
    // maxMp = V2_BASE_MP(50) + mp 30 + INT(기본15)×2 = 110.
    const d = derivePlayerCombatV2Pure({
      level: 1,
      v2Equipped: { necklace: "v2_mana_essence" },
    });
    expect(d.totalStats.int).toBe(15); // 기본 int (장비 token 없음)
    expect(d.player.maxMp).toBe(V2_BASE_MP + 30 + 15 * 2);
  });
});

describe("derivePlayerCombatV2Pure magicAtk (PR-magic — INT 환산 마법 공격력)", () => {
  it("기본 int 15 → magicAtk = floor(15×0.15) = 2 (마법 베이스라인)", () => {
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 245, dex: 0, vit: 0, luk: 0, int: 0 },
      v2Equipped: {},
    });
    expect(d.totalStats.int).toBe(15); // 기본 int 15 (할당 0)
    expect(d.player.magicAtk).toBe(Math.floor(15 * 0.15) + V2_BASE_COMBAT_BONUS); // 2 + 5
  });

  it("INT 투자 → magicAtk = floor(int × MAGIC_ATK_PER_INT 0.15) (STR 대칭)", () => {
    // 기본 15 + 할당 100 = 115. magicAtk = floor(115 × 0.15) = 17.
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 0, int: 100 },
      v2Equipped: {},
    });
    expect(d.totalStats.int).toBe(115);
    expect(d.player.magicAtk).toBe(Math.floor(115 * 0.15) + V2_BASE_COMBAT_BONUS); // 17 + 5
  });

  it("지팡이 위력 → magicAtk·atk 둘 다 (PR-4a 무기 안 가림, int token 없음)", () => {
    // 별빛 지팡이 T5: power 31 (무기 → atk·magicAtk 둘 다). int token 없음.
    // magicAtk = floor(int 15 × 0.15) + 위력 31 = 2 + 31 = 33. atk = floor(str 15×0.15) + 31 = 33.
    const d = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: { weapon: "v2_starlit_staff" },
    });
    expect(d.totalStats.int).toBe(15); // 기본 int (장비 token 없음)
    expect(d.player.magicAtk).toBe(
      Math.floor(15 * 0.15) + 31 + V2_BASE_COMBAT_BONUS,
    ); // 2 + 31 + 5 = 38
    expect(d.player.atk).toBe(
      Math.floor(15 * 0.15) + 31 + V2_BASE_COMBAT_BONUS,
    ); // 2 + 31 + 5 = 38
  });

  it("기본 int 물리빌드도 지팡이 위력만큼 magicAtk — 마법스킬 없으면 무용", () => {
    // 참나무 지팡이: power 6. magicAtk = floor(15×0.15) + 6 = 2 + 6 = 8. 물리 빌드는 마법스킬을
    // 안 배워 실제 데미지엔 안 쓰이지만 derive 합산 자체는 정상.
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: { str: 0, dex: 0, vit: 0, luk: 0, int: 0 },
      v2Equipped: { weapon: "v2_oak_staff" }, // power 6
    });
    expect(d.player.magicAtk).toBe(
      Math.floor(15 * 0.15) + 6 + V2_BASE_COMBAT_BONUS,
    ); // 2 + 6 + 5 = 13
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

describe("derivePlayerCombatV2Pure weaponElement (PR-5b 무기 속성)", () => {
  it("속성 무기 장착 → weaponElement = 무기 속성", () => {
    // 별노래궁 = starlight 무기.
    const d = derivePlayerCombatV2Pure({
      level: 50,
      v2Equipped: { weapon: "v2_starsong_bow" },
    });
    expect(d.weaponElement).toBe("starlight");
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

  it("구 직업 패시브 필드는 (레거시 시그니처 학습해도) 미설정 — 은퇴", () => {
    const d = derivePlayerCombatV2Pure({
      level: 50,
      allocatedStats: STATS,
      playerClass: "warrior",
      learnedSkillIds: ["v2_skill_blade_dance"],
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

describe("세트 보너스 (들가죽 — 회피+3, HP+20)", () => {
  const SET = {
    armor: "v2_field_leather_armor" as const,
    gloves: "v2_field_leather_gloves" as const,
    boots: "v2_field_leather_boots" as const,
  };

  it("3종 다 착용 → 세트 보너스 적용 (eva 1+1+3=5, hp 0+20=20)", () => {
    const a = aggregateV2Equipment(SET);
    expect(a.def).toBe(7); // 3 + 2 + 2 위력 → 물방
    expect(a.crit).toBe(1); // 장갑 crit
    expect(a.eva).toBe(5); // 갑옷1 + 신발1 + 세트3
    expect(a.hp).toBe(20); // 세트 HP
  });

  it("2종만 착용 → 세트 보너스 없음", () => {
    const a = aggregateV2Equipment({ armor: SET.armor, boots: SET.boots });
    expect(a.eva).toBe(2); // 갑옷1 + 신발1, 세트 미적용
    expect(a.hp).toBe(0);
  });

  it("다른 슬롯을 채워도 세트 3종이 빠지면 미적용", () => {
    const a = aggregateV2Equipment({
      armor: SET.armor,
      gloves: SET.gloves,
      weapon: "v2_meadow_bow",
    });
    expect(a.hp).toBe(0); // boots 빠짐 → 세트 미완성
  });
});

describe("derivePlayerCombatV2Pure 계파(스펙) 패시브 (P3c — docs/v2-job-spec-passives-plan)", () => {
  const gwang = getJobSpec("warrior", "gwang")!; // 광검류(대검 게이트)
  const base = {
    level: 50,
    allocatedStats: { str: 100 },
    v2Equipped: { weapon: "v2_greatsword" as V2EquipmentId }, // weaponType: greatsword
  };

  it("계파 미지정 = 효과 없음(inert) — 계파 필드 미설정", () => {
    const d = derivePlayerCombatV2Pure(base);
    expect(d.player.passiveDefPenetrationPct).toBeUndefined();
    expect(d.player.passiveDamageTakenReductionPct).toBeUndefined();
    expect(d.player.thornsPct).toBeUndefined();
    expect(d.player.bleedDmgPerStack).toBeUndefined();
  });

  it("광검 + 대검 + 해금 → atk%·방관 적용 (광폭 신규필드는 훅 미구현=inert)", () => {
    const baseD = derivePlayerCombatV2Pure(base);
    const d = derivePlayerCombatV2Pure({
      ...base,
      spec: gwang,
      unlockedPassives: ["gwang_cut", "gwang_pierce", "gwang_crit"],
    });
    expect(d.player.atk).toBe(Math.floor(baseD.player.atk * 1.2)); // atkPctAdd 20
    expect(d.player.passiveDefPenetrationPct).toBe(17); // gwang_pierce
    // 광폭(gwang_crit) = selfDefReductionPct+dmgDealtPctAdd — derive 훅 미구현이라 critMult 불변.
    expect(d.player.critMult ?? 0).toBeCloseTo(baseD.player.critMult ?? 0, 5);
  });

  it("무기 게이트 불통과(일반 검) = 완전 비활성", () => {
    const baseNoType = derivePlayerCombatV2Pure({
      ...base,
      v2Equipped: { weapon: "v2_iron_sword" as V2EquipmentId },
    });
    const d = derivePlayerCombatV2Pure({
      ...base,
      v2Equipped: { weapon: "v2_iron_sword" as V2EquipmentId }, // 타입 없는 일반 검
      spec: gwang,
      unlockedPassives: ["gwang_cut", "gwang_pierce", "gwang_crit"],
    });
    expect(d.player.atk).toBe(baseNoType.player.atk); // 효과 0
    expect(d.player.passiveDefPenetrationPct).toBeUndefined();
  });

  it("해금 안 한 패시브는 미적용", () => {
    const baseD = derivePlayerCombatV2Pure(base);
    const d = derivePlayerCombatV2Pure({
      ...base,
      spec: gwang,
      unlockedPassives: ["gwang_pierce"], // 방관만 해금, atk%·크리뎀 미해금
    });
    expect(d.player.passiveDefPenetrationPct).toBe(17); // 해금됨
    expect(d.player.atk).toBe(baseD.player.atk); // gwang_cut 미해금 → atk 불변
  });

  it("기사 + 검방 → 받피감·반격·반사(thornsPct) 매핑", () => {
    const knight = getJobSpec("warrior", "knight")!;
    // 검방 무기가 카탈로그에 아직 없으니 — 게이트 통과 케이스는 P3a 데이터 단위테스트가 커버.
    // 여기선 매핑 경로만: 무기 불일치라 비활성 확인(현 카탈로그엔 sword_shield 아이템 0개).
    const d = derivePlayerCombatV2Pure({
      ...base,
      spec: knight,
      unlockedPassives: ["knight_guard", "knight_counter", "knight_reflect"],
    });
    // base 는 대검 → 검방 게이트 불통과 → 비활성
    expect(d.player.passiveDamageTakenReductionPct).toBeUndefined();
    expect(d.player.thornsPct).toBeUndefined();
  });
});
