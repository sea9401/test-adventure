import { describe, it, expect } from "vitest";
import { V2_SKILLS_BY_JOB, skillsForJob } from "./v2SkillsByJob";
import { V2_JOB_PASSIVES, jobPassive } from "./v2JobPassives";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
  spCostOf,
  type V2SkillId,
} from "./v2Skills";

describe("직업 킷 — 스킬셋", () => {
  it("기본 4직업 = 액티브 1 + 패시브 스킬 1", () => {
    expect(skillsForJob("warrior")).toEqual([
      "v2c_warrior_strike",
      "v2c_warrior_might",
    ]); // 강타 + 근력
    expect(skillsForJob("martial")).toEqual([
      "v2c_martial_steelguard",
      "v2c_martial_fortitude",
    ]); // 철포 + 강건
    expect(skillsForJob("mage")).toEqual([
      "v2c_mage_boltcast",
      "v2c_mage_acumen",
    ]); // 마력탄 + 총명
    expect(skillsForJob("rogue")).toEqual([
      "v2c_rogue_poison",
      "v2c_rogue_finesse",
    ]); // 독침 + 예기
  });

  it("모든 직업 스킬 id 가 전투 카탈로그(V2_SKILLS)에 존재", () => {
    for (const [job, ids] of Object.entries(V2_SKILLS_BY_JOB)) {
      for (const id of ids) {
        expect(id in V2_SKILLS, `${job}:${id}`).toBe(true);
      }
    }
  });

  it("상위 8직업 = 액티브 1 + 고유 % 패시브 1", () => {
    const UPPER: Record<string, [V2SkillId, V2SkillId]> = {
      shieldman: ["v2c_shieldman_bash", "v2c_shieldman_vitality"],
      squire: ["v2c_squire_cleave", "v2c_squire_might"],
      boxer: ["v2c_boxer_combo", "v2c_boxer_fortitude"],
      monk: ["v2c_monk_palm", "v2c_monk_spirit"],
      caster: ["v2c_caster_bolt", "v2c_caster_acumen"],
      acolyte: ["v2c_acolyte_smite", "v2c_acolyte_mana"],
      assassin: ["v2c_assassin_ambush", "v2c_assassin_fortune"],
      archer: ["v2c_archer_volley", "v2c_archer_agility"],
    };
    for (const [job, kit] of Object.entries(UPPER)) {
      expect(skillsForJob(job), job).toEqual(kit);
      const [active, passive] = kit;
      // 액티브 = 비(非)패시브(공격/힐/버프 등 — 역할 다양화로 사제는 heal). 패시브 = passive.
      expect(V2_SKILLS[active].category, active).not.toBe("passive");
      expect(V2_SKILLS[passive].category, passive).toBe("passive");
    }
    // 역할 다양화 1차: 사제 = 자힐(heal), 방패병 = 방어력 기반 데미지.
    expect(V2_SKILLS.v2c_acolyte_smite.category).toBe("heal");
    expect(V2_SKILLS.v2c_acolyte_smite.effects[0]).toMatchObject({ kind: "heal" });
    expect(V2_SKILLS.v2c_shieldman_bash.effects[0]).toMatchObject({
      kind: "damage",
      scaling: "def",
    });
    // 역할 다양화 2차: 수도승 = 회피버프, 자객 = 처형, 궁수 = 딜+취약.
    expect(V2_SKILLS.v2c_monk_palm.effects[0]).toMatchObject({
      kind: "selfBuffPct",
      target: "evasion",
    });
    expect(V2_SKILLS.v2c_assassin_ambush.effects[0]).toMatchObject({
      kind: "executeDamage",
    });
    expect(
      V2_SKILLS.v2c_archer_volley.effects.some((e) => e.kind === "enemyVuln"),
    ).toBe(true);
  });

  it("도적 직군 스케일링: 자객 처단=LUK 비례, 궁사 연사=DEX 비례", () => {
    // 도적 정체성 — 데미지가 str-atk 가 아니라 행운/민첩 직접 비례(scaling). 원시스탯이 커서 계수 작음.
    const assassin = V2_SKILLS.v2c_assassin_ambush.effects[0];
    expect(assassin).toMatchObject({ kind: "executeDamage", scaling: "luk" });
    const ranger = V2_SKILLS.v2c_ranger_ambush.effects[0];
    expect(ranger).toMatchObject({ kind: "damage", scaling: "dex" });
  });

  it("상위 8직업 패시브는 서로 다른 축/효과(고유 — 순회 메리트)", () => {
    const passiveIds = [
      "v2c_shieldman_vitality", "v2c_squire_might", "v2c_boxer_fortitude",
      "v2c_monk_spirit", "v2c_caster_acumen", "v2c_acolyte_mana",
      "v2c_assassin_fortune", "v2c_archer_agility",
    ] as const;
    // 각 패시브가 건드리는 "축/효과"를 키로 직렬화 → 8개 모두 유일해야 한다.
    //   다양성 확장(A 메타): 스탯%뿐 아니라 회피·치명·흡혈 등 비(非)스탯 효과도 포함해 직렬화.
    const axes = passiveIds.map((id) => {
      const p = V2_SKILLS[id].passive!;
      const keys: string[] = [];
      for (const k of Object.keys(p.statPct ?? {})) keys.push(`statPct.${k}`);
      if (p.maxHpPct) keys.push("maxHpPct");
      if (p.maxMpPct) keys.push("maxMpPct");
      if (p.critPct) keys.push("critPct");
      if (p.critDmgPct) keys.push("critDmgPct");
      if (p.evasionPct) keys.push("evasionPct");
      if (p.lifestealPct) keys.push("lifestealPct");
      if (p.atkPerDexCoef) keys.push("atkPerDexCoef");
      return keys.sort().join(",");
    });
    expect(new Set(axes).size).toBe(passiveIds.length);
  });

  it("고차 4직업(tier 3) = 액티브 1(강) + 패시브 1(다양성: 일부는 비스탯 효과)", () => {
    // 다양성 2차: brawler/magus/ranger 는 직군 축 % 유지(증폭·각 +20%), paladin 만 비스탯 효과로
    //   리스킨(공방 균형, PvP-안전). 트리 오르며 효과가 갈린다.
    const ACTIVES: Record<string, V2SkillId> = {
      paladin: "v2c_paladin_cleave",
      brawler: "v2c_brawler_combo",
      magus: "v2c_magus_bolt",
      ranger: "v2c_ranger_ambush",
    };
    const PASSIVE: Record<string, V2SkillId> = {
      paladin: "v2c_paladin_might3",
      brawler: "v2c_brawler_fortitude3",
      magus: "v2c_magus_acumen3",
      ranger: "v2c_ranger_finesse3",
    };
    for (const job of Object.keys(ACTIVES)) {
      expect(skillsForJob(job), job).toEqual([ACTIVES[job], PASSIVE[job]]);
      expect(V2_SKILLS[ACTIVES[job]].category, ACTIVES[job]).toBe("attack");
      expect(V2_SKILLS[ACTIVES[job]].tier, ACTIVES[job]).toBe(3);
      expect(V2_SKILLS[PASSIVE[job]].category, PASSIVE[job]).toBe("passive");
    }
    // brawler/magus/ranger = 직군 축 % 증폭(유지·각 +20%). ranger 는 궁수 민첩(dex+10%)의 상위판 "민첩 II".
    expect(V2_SKILLS.v2c_brawler_fortitude3.passive?.statPct?.vit).toBe(20);
    expect(V2_SKILLS.v2c_magus_acumen3.passive?.statPct?.int).toBe(30);
    expect(V2_SKILLS.v2c_ranger_finesse3.passive?.statPct?.dex).toBe(20);
    expect(V2_SKILLS.v2c_ranger_finesse3.passive?.accuracyPct).toBeUndefined();
    // paladin(기사) = 공방 균형(힘 10% + 방어 10%, 각 낮게). 가디언(방어 20%)·견습기사(힘 15%)와 차별.
    expect(V2_SKILLS.v2c_paladin_might3.passive?.statPct?.str).toBe(10);
    expect(V2_SKILLS.v2c_paladin_might3.passive?.defPct).toBe(10);
  });

  it("고차 두 번째 갈래(tier 3) = 액티브 1 + 고유 패시브(형제와 다른 축)", () => {
    const KIT: Record<string, [V2SkillId, V2SkillId]> = {
      guardian: ["v2c_guardian_bash", "v2c_guardian_bulwark3"],
      warmonk: ["v2c_warmonk_kick", "v2c_warmonk_evasion3"],
      bishop: ["v2c_bishop_heal", "v2c_bishop_blessing3"],
      shadow: ["v2c_shadow_assassinate", "v2c_shadow_lethality3"],
    };
    for (const [job, [active, passive]] of Object.entries(KIT)) {
      expect(skillsForJob(job), job).toEqual([active, passive]);
      expect(V2_SKILLS[active], active).toBeDefined();
      expect(V2_SKILLS[passive].category, passive).toBe("passive");
      expect(V2_SKILLS[passive].tier, passive).toBe(3);
    }
    // 형제(기사/격투가/마도사/궁사)와 다른 축: 방어%(순수)·회피·회복강화·치명피해.
    expect(V2_SKILLS.v2c_guardian_bulwark3.passive?.defPct).toBe(20);
    expect(V2_SKILLS.v2c_warmonk_evasion3.passive?.evasionPct).toBe(14);
    expect(V2_SKILLS.v2c_bishop_blessing3.passive?.healPowerPct).toBe(30);
    expect(V2_SKILLS.v2c_shadow_lethality3.passive?.critDmgPct).toBe(25); // 크리축 차수 단조(3차)
    // 대사제 액티브 = 자힐(heal), 그림자 액티브 = 처형(executeDamage).
    expect(V2_SKILLS.v2c_bishop_heal.category).toBe("heal");
    expect(V2_SKILLS.v2c_shadow_assassinate.effects[0].kind).toBe("executeDamage");
  });

  it("심화 4직업(tier 4) = 액티브 1(강) + 패시브(직군마다 다른 효과)", () => {
    // 절정(sensei)은 예외 — 액티브(난무) 대신 반격 패시브로 교체(둘 다 패시브·액티브 없음). 아래 별도 검증.
    const KIT: Record<string, [V2SkillId, V2SkillId]> = {
      veteran: ["v2c_veteran_cleave", "v2c_veteran_lethal"],
      sage: ["v2c_sage_bolt", "v2c_sage_insight"],
      chief: ["v2c_chief_strike", "v2c_chief_afterimage"],
    };
    for (const [job, [active, passive]] of Object.entries(KIT)) {
      expect(skillsForJob(job), job).toEqual([active, passive]);
      expect(V2_SKILLS[active].category, active).toBe("attack");
      expect(V2_SKILLS[passive].category, passive).toBe("passive");
    }
    // 심화 패시브 = 라인 비포화 효과(기존 어휘 재사용, PvP-안전).
    expect(V2_SKILLS.v2c_veteran_lethal.passive?.critDmgPct).toBe(30); // 크리축 차수 단조 — 4차 최상
    expect(V2_SKILLS.v2c_sensei_ironbody.passive?.maxHpPct).toBe(20);
    expect(V2_SKILLS.v2c_sage_insight.passive?.critPct).toBe(10); // 크리축 차수 단조 — 4차 > 2차 자객(8)
    expect(V2_SKILLS.v2c_chief_afterimage.passive?.evasionPct).toBe(18);
  });

  it("절정(sensei) = 반격 패시브 + 철신 패시브(액티브 없음)", () => {
    // 오너 결정 — 절정의 액티브(난무)를 반격으로 교체. 반격은 반응형(피격 시 발동)이라 패시브이며,
    //   v2c_sensei_combo id 는 유지(킷/세이브 안정)하되 category=passive·counterChancePct 30 으로 재용도.
    expect(skillsForJob("sensei")).toEqual([
      "v2c_sensei_combo",
      "v2c_sensei_ironbody",
    ]);
    expect(V2_SKILLS.v2c_sensei_combo.category).toBe("passive");
    expect(V2_SKILLS.v2c_sensei_combo.passive?.counterChancePct).toBe(30);
    expect(V2_SKILLS.v2c_sensei_ironbody.category).toBe("passive");
  });

  it("없는 jobId = 빈 배열", () => {
    expect(skillsForJob("none")).toEqual([]);
    expect(skillsForJob("nope")).toEqual([]);
  });
});

describe("직업 킷 — 액티브 스킬", () => {
  it("철포 = 받피감 버프(selfBuffPct damageReduction)", () => {
    const eff = V2_SKILLS.v2c_martial_steelguard.effects[0];
    expect(eff).toMatchObject({
      kind: "selfBuffPct",
      target: "damageReduction",
    });
  });

  it("마력탄 = 0코스트 마법 단일타", () => {
    const s = V2_SKILLS.v2c_mage_boltcast;
    expect(s.mpCost).toBe(0);
    expect(s.effects[0]).toMatchObject({ kind: "damage", scaling: "magic" });
  });

  it("독침 = 고정 수치 중독(% 아님)", () => {
    const dot = V2_SKILLS.v2c_rogue_poison.effects.find((e) => e.kind === "dot");
    expect(dot).toBeTruthy();
    if (dot && dot.kind === "dot") {
      expect(dot.flatPerStack).toBeGreaterThan(0);
      expect(dot.pctMaxHpPerStack).toBe(0);
    }
  });
});

describe("패시브 스킬 (학습+SP 슬롯해야 효과)", () => {
  it("기본 패시브 스킬 = category passive + 효과(근력/강건/총명/예기)", () => {
    expect(V2_SKILLS.v2c_warrior_might.category).toBe("passive");
    expect(V2_SKILLS.v2c_warrior_might.passive).toEqual({ statPct: { str: 10 } }); // 힘 +10%(flat→% 변경)
    expect(V2_SKILLS.v2c_martial_fortitude.passive).toEqual({ statPct: { vit: 10 } }); // 활력 +10%(flat→% 변경)
    expect(V2_SKILLS.v2c_mage_acumen.passive).toEqual({ statPct: { int: 10 } }); // 지능 +10%(flat→% 변경)
    expect(V2_SKILLS.v2c_rogue_finesse.passive?.atkPerDexCoef).toBeGreaterThan(0);
  });

  it("패시브 스킬도 SP 코스트 양수(액티브와 예산 경쟁)", () => {
    expect(spCostOf(V2_SKILLS.v2c_warrior_might)).toBeGreaterThan(0);
    expect(spCostOf(V2_SKILLS.v2c_rogue_finesse)).toBeGreaterThan(0);
  });

  it("aggregateEquippedPassives — 장착 패시브 합산(statPct + atkPerDexCoef)", () => {
    const agg = aggregateEquippedPassives([
      "v2c_martial_fortitude", // statPct vit+10%
      "v2c_rogue_finesse", // atkPerDexCoef
      "v2c_warrior_strike", // 액티브 → 무시
    ]);
    expect(agg.statPct).toEqual({ vit: 10 });
    expect(agg.atkPerDexCoef).toBeGreaterThan(0);
  });

  it("aggregateEquippedPassives — % 패시브(statPct/maxHpPct/healPowerPct) 합산", () => {
    const agg = aggregateEquippedPassives([
      "v2c_martial_fortitude", // statPct vit+10%
      "v2c_squire_might", // statPct str+15
      "v2c_shieldman_vitality", // maxHpPct 12
      "v2c_acolyte_mana", // healPowerPct 20 (회복강화 — SPI PR-4, 옛 maxMpPct 리스킨)
    ]);
    expect(agg.statPct).toEqual({ vit: 10, str: 15 }); // % 스탯 누적
    expect(agg.maxHpPct).toBe(12);
    expect(agg.healPowerPct).toBe(20);
    expect(agg.maxMpPct).toBe(0); // 리스킨 후 maxMpPct 패시브는 카탈로그에 없음
  });

  it("aggregateEquippedPassives — 다양성 효과(치명/치명피해/회피/흡혈/방어%) 합산", () => {
    // 명중(accuracyPct) 은 더는 패시브 축이 아님 — 옛 궁사 "정밀" 이 "민첩 II"(dex%) 로 전환됨.
    const agg = aggregateEquippedPassives([
      "v2c_assassin_fortune", // critPct 8
      "v2c_shadow_lethality3", // critDmgPct 25 (크리축 3차·마법사 INT 전환으로 교체)
      "v2c_monk_spirit", // evasionPct 10
      "v2c_boxer_fortitude", // lifestealPct 2 (저수치)
      "v2c_guardian_bulwark3", // defPct 20 (방벽·순수 방어)
    ]);
    expect(agg.critPct).toBe(8);
    expect(agg.critDmgPct).toBe(25);
    expect(agg.evasionPct).toBe(10);
    expect(agg.lifestealPct).toBe(2);
    expect(agg.defPct).toBe(20);
    // 흡혈은 자동전투 눈덩이 방지로 의도적 저수치(가드).
    expect(agg.lifestealPct).toBeLessThanOrEqual(5);
    // 비스탯 효과만 골랐으므로 stat/statPct 는 비어 있음.
    expect(agg.statPct).toEqual({});
  });

  it("효과 패시브 맵(V2_JOB_PASSIVES)은 비어 있음 — 기본은 패시브 스킬로 이관", () => {
    expect(V2_JOB_PASSIVES).toEqual({});
    expect(jobPassive("warrior")).toEqual({});
  });
});
