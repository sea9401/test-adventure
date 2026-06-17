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
      expect(V2_SKILLS[active].category, active).toBe("attack");
      expect(V2_SKILLS[passive].category, passive).toBe("passive");
    }
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
    // 다양성 2차: brawler/magus 는 직군 축 % 유지(증폭), paladin/ranger 는 비스탯 효과로 리스킨
    //   (방어%·명중, PvP-안전). 트리 오르며 같은 축 몰빵이 아니라 효과가 갈린다.
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
    // brawler/magus = 직군 축 % 증폭(유지).
    expect(V2_SKILLS.v2c_brawler_fortitude3.passive?.statPct?.vit).toBe(20);
    expect(V2_SKILLS.v2c_magus_acumen3.passive?.statPct?.int).toBe(20);
    // paladin/ranger = 비스탯 효과(리스킨) — 방어%·명중.
    expect(V2_SKILLS.v2c_paladin_might3.passive?.defPct).toBe(20);
    expect(V2_SKILLS.v2c_paladin_might3.passive?.statPct).toBeUndefined();
    expect(V2_SKILLS.v2c_ranger_finesse3.passive?.accuracyPct).toBe(12);
    expect(V2_SKILLS.v2c_ranger_finesse3.passive?.statPct).toBeUndefined();
  });

  it("심화 4직업(tier 4) = 액티브 1(강) + 패시브(직군마다 다른 효과)", () => {
    const KIT: Record<string, [V2SkillId, V2SkillId]> = {
      veteran: ["v2c_veteran_cleave", "v2c_veteran_lethal"],
      sensei: ["v2c_sensei_combo", "v2c_sensei_ironbody"],
      sage: ["v2c_sage_bolt", "v2c_sage_insight"],
      chief: ["v2c_chief_strike", "v2c_chief_afterimage"],
    };
    for (const [job, [active, passive]] of Object.entries(KIT)) {
      expect(skillsForJob(job), job).toEqual([active, passive]);
      expect(V2_SKILLS[active].category, active).toBe("attack");
      expect(V2_SKILLS[passive].category, passive).toBe("passive");
    }
    // 심화 패시브 = 라인 비포화 효과(기존 어휘 재사용, PvP-안전).
    expect(V2_SKILLS.v2c_veteran_lethal.passive?.critDmgPct).toBe(25);
    expect(V2_SKILLS.v2c_sensei_ironbody.passive?.maxHpPct).toBe(12);
    expect(V2_SKILLS.v2c_sage_insight.passive?.critPct).toBe(8);
    expect(V2_SKILLS.v2c_chief_afterimage.passive?.evasionPct).toBe(12);
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
    expect(V2_SKILLS.v2c_warrior_might.passive).toEqual({ stat: { str: 10 } });
    expect(V2_SKILLS.v2c_martial_fortitude.passive).toEqual({ stat: { vit: 10 } });
    expect(V2_SKILLS.v2c_mage_acumen.passive).toEqual({ stat: { int: 10 } });
    expect(V2_SKILLS.v2c_rogue_finesse.passive?.atkPerDexCoef).toBeGreaterThan(0);
  });

  it("패시브 스킬도 SP 코스트 양수(액티브와 예산 경쟁)", () => {
    expect(spCostOf(V2_SKILLS.v2c_warrior_might)).toBeGreaterThan(0);
    expect(spCostOf(V2_SKILLS.v2c_rogue_finesse)).toBeGreaterThan(0);
  });

  it("aggregateEquippedPassives — 장착 패시브 합산(stat + atkPerDexCoef)", () => {
    const agg = aggregateEquippedPassives([
      "v2c_warrior_might", // str+10
      "v2c_rogue_finesse", // atkPerDexCoef
      "v2c_warrior_strike", // 액티브 → 무시
    ]);
    expect(agg.stat).toEqual({ str: 10 });
    expect(agg.atkPerDexCoef).toBeGreaterThan(0);
  });

  it("aggregateEquippedPassives — % 패시브(statPct/maxHpPct/maxMpPct) 합산", () => {
    const agg = aggregateEquippedPassives([
      "v2c_warrior_might", // 플랫 str+10
      "v2c_squire_might", // statPct str+15
      "v2c_shieldman_vitality", // maxHpPct 12
      "v2c_acolyte_mana", // maxMpPct 12
    ]);
    expect(agg.stat).toEqual({ str: 10 }); // 플랫과 % 는 분리
    expect(agg.statPct).toEqual({ str: 15 });
    expect(agg.maxHpPct).toBe(12);
    expect(agg.maxMpPct).toBe(12);
  });

  it("aggregateEquippedPassives — 다양성 효과(치명/치명피해/회피/흡혈/방어%/명중) 합산", () => {
    const agg = aggregateEquippedPassives([
      "v2c_assassin_fortune", // critPct 8
      "v2c_caster_acumen", // critDmgPct 30
      "v2c_monk_spirit", // evasionPct 10
      "v2c_boxer_fortitude", // lifestealPct 4 (저수치)
      "v2c_paladin_might3", // defPct 20 (철벽)
      "v2c_ranger_finesse3", // accuracyPct 12 (정밀)
    ]);
    expect(agg.critPct).toBe(8);
    expect(agg.critDmgPct).toBe(30);
    expect(agg.evasionPct).toBe(10);
    expect(agg.lifestealPct).toBe(4);
    expect(agg.defPct).toBe(20);
    expect(agg.accuracyPct).toBe(12);
    // 흡혈은 자동전투 눈덩이 방지로 의도적 저수치(가드).
    expect(agg.lifestealPct).toBeLessThanOrEqual(5);
    // 비스탯 효과는 stat/statPct 와 분리.
    expect(agg.statPct).toEqual({});
  });

  it("효과 패시브 맵(V2_JOB_PASSIVES)은 비어 있음 — 기본은 패시브 스킬로 이관", () => {
    expect(V2_JOB_PASSIVES).toEqual({});
    expect(jobPassive("warrior")).toEqual({});
  });
});
