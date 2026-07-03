import { describe, it, expect } from "vitest";
import { V2_SKILLS_BY_JOB, skillsForJob } from "./v2SkillsByJob";
import { V2_JOB_PASSIVES, jobPassive } from "./v2JobPassives";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
  equippedProfPerKillBonus,
  spCostOf,
  type V2SkillId,
} from "./v2Skills";

describe("직업 킷 — 스킬셋", () => {
  it("기본 직업 = 핵심 액티브 1 + 패시브 스킬 1, 생존자는 생활 패시브 추가", () => {
    expect(skillsForJob("warrior")).toEqual([
      "v2c_warrior_strike",
      "v2c_warrior_might",
    ]); // 강타 + 근력
    expect(skillsForJob("martial")).toEqual([
      "v2c_martial_steelguard",
      "v2c_martial_fortitude",
    ]); // 하급 권법 + 강건
    expect(skillsForJob("mage")).toEqual([
      "v2c_mage_boltcast",
      "v2c_mage_acumen",
    ]); // 마력탄 + 총명
    expect(skillsForJob("rogue")).toEqual([
      "v2c_rogue_poison",
      "v2c_rogue_finesse",
    ]); // 독침 + 예기
    expect(skillsForJob("survivor")).toEqual([
      "v2c_survivor_firstaid",
      "v2c_survivor_knowledge",
      "v2c_survivor_baitcraft",
    ]); // 응급 처치 + 생존 지식 + 미끼 고르기
  });

  it("모든 직업 스킬 id 가 전투 카탈로그(V2_SKILLS)에 존재", () => {
    for (const [job, ids] of Object.entries(V2_SKILLS_BY_JOB)) {
      for (const id of ids) {
        expect(id in V2_SKILLS, `${job}:${id}`).toBe(true);
      }
    }
  });

  it("상위 직업 = 핵심 액티브 1 + 고유 % 패시브 1", () => {
    const UPPER: Record<string, readonly V2SkillId[]> = {
      shieldman: ["v2c_shieldman_bash", "v2c_shieldman_vitality"],
      squire: ["v2c_squire_cleave", "v2c_squire_might"],
      boxer: ["v2c_boxer_combo", "v2c_boxer_fortitude"],
      monk: ["v2c_monk_palm", "v2c_monk_spirit"],
      caster: ["v2c_caster_bolt", "v2c_caster_acumen"],
      acolyte: ["v2c_acolyte_smite", "v2c_acolyte_mana"],
      warder: ["v2c_warder_barrier", "v2c_warder_ward"],
      assassin: ["v2c_assassin_ambush", "v2c_assassin_fortune"],
      archer: ["v2c_archer_volley", "v2c_archer_agility"],
      venomist: ["v2c_venomist_toxiccloud", "v2c_venomist_corrosion"],
      camper: ["v2c_camper_camp", "v2c_camper_ration"],
      ironman: ["v2c_ironman_brace", "v2c_ironman_body"],
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
    expect(V2_SKILLS.v2c_warder_barrier.category).toBe("buff");
    expect(V2_SKILLS.v2c_warder_barrier.effects[0]).toMatchObject({
      kind: "shield",
      pctMaxHp: 8,
    });
    expect(V2_SKILLS.v2c_warder_ward.passive).toMatchObject({
      magicDefPct: 15,
      openingMagicDamageReductionPct: 10,
      openingMagicDamageReductionPhases: 3,
    });
    expect(V2_SKILLS.v2c_shieldman_bash.effects[0]).toMatchObject({
      kind: "damage",
      scaling: "def",
    });
    // 역할 다양화 2차: 수도승 = 철포(받피감 버프), 자객 = 처형, 궁수 = 딜+취약.
    expect(V2_SKILLS.v2c_monk_palm.effects[0]).toMatchObject({
      kind: "selfBuffPct",
      target: "damageReduction",
    });
    expect(V2_SKILLS.v2c_ironknight_guard.effects).toEqual([
      { kind: "shield", pctMaxHp: 10, turns: 3 },
      { kind: "selfBuffPct", target: "reflectDamage", pct: 60, turns: 3 },
    ]);
    expect(V2_SKILLS.v2c_assassin_ambush.effects[0]).toMatchObject({
      kind: "executeDamage",
    });
    expect(
      V2_SKILLS.v2c_archer_volley.effects.some((e) => e.kind === "enemyVuln"),
    ).toBe(true);
    expect(
      V2_SKILLS.v2c_venomist_toxiccloud.effects.some((e) => e.kind === "dot" && e.tag === "poison"),
    ).toBe(true);
    expect(
      V2_SKILLS.v2c_venomist_toxiccloud.effects.some((e) => e.kind === "stackPayoffDamage" && e.tag === "poison"),
    ).toBe(true);
    expect(V2_SKILLS.v2c_venomist_corrosion.passive?.poisonedEnemyDefReductionPct).toBe(12);
    expect(V2_SKILLS.v2c_survivor_firstaid.effects[0]).toMatchObject({
      kind: "heal",
      pctLostHp: 20,
    });
    expect(V2_SKILLS.v2c_survivor_firstaid.mpCost).toBe(0);
    expect(V2_SKILLS.v2c_survivor_firstaid.oncePerBattle).toBe(true);
    expect(V2_SKILLS.v2c_survivor_knowledge.passive?.maxHpPct).toBe(10);
    expect(V2_SKILLS.v2c_survivor_baitcraft.passive?.fishingSizeBonusPct).toBe(4);
    expect(V2_SKILLS.v2c_camper_camp.effects[0]).toMatchObject({
      kind: "heal",
      pctLostHp: 25,
    });
    expect(V2_SKILLS.v2c_camper_camp.mpCost).toBe(0);
    expect(V2_SKILLS.v2c_camper_camp.oncePerBattle).toBe(true);
    expect(V2_SKILLS.v2c_camper_ration.passive).toMatchObject({
      healPowerPct: 10,
      maxHpPct: 5,
    });
    expect(V2_SKILLS.v2c_ironman_brace.effects[0]).toMatchObject({
      kind: "shield",
      pctMaxHp: 10,
    });
    expect(V2_SKILLS.v2c_ironman_body.passive?.maxHpPct).toBe(15);
  });

  it("낚시 생활 직업 라인은 장착형 낚시 패시브만 배운다", () => {
    expect(skillsForJob("fisher")).toEqual(["v2c_camper_tidereading"]);
    expect(skillsForJob("angler")).toEqual(["v2c_angler_pointreading"]);
    expect(skillsForJob("masterangler")).toEqual([
      "v2c_masterangler_bigcatchsense",
    ]);
    expect(skillsForJob("fullcatchking")).toEqual([
      "v2c_fullcatchking_bountyhaul",
    ]);
    expect(skillsForJob("seagod")).toEqual(["v2c_seagod_deepcurrent"]);
    for (const jobId of [
      "fisher",
      "angler",
      "masterangler",
      "fullcatchking",
      "seagod",
    ]) {
      for (const id of skillsForJob(jobId)) {
        expect(V2_SKILLS[id].category, id).toBe("passive");
      }
    }
    expect(V2_SKILLS.v2c_camper_tidereading.passive?.fishingSpecialWeightPct).toBe(25);
    expect(V2_SKILLS.v2c_angler_pointreading.passive?.fishingRareSizeBonusPct).toBe(3);
    expect(
      V2_SKILLS.v2c_masterangler_bigcatchsense.passive?.fishingBigCatchSizeBonusPct,
    ).toBe(2);
    expect(V2_SKILLS.v2c_fullcatchking_bountyhaul.passive).toMatchObject({
      fishingSizeBonusPct: 3,
      fishingBigCatchSizeBonusPct: 2,
    });
    expect(V2_SKILLS.v2c_seagod_deepcurrent.passive).toMatchObject({
      fishingSpecialWeightPct: 20,
      fishingRareSizeBonusPct: 4,
    });
  });

  it("헬스 트레이너 생활 직업 라인은 장착형 훈련장 패시브를 배운다", () => {
    expect(skillsForJob("healthtrainer")).toEqual([
      "v2c_healthtrainer_routine",
    ]);
    expect(skillsForJob("physicalcoach")).toEqual([
      "v2c_physicalcoach_conditioning",
    ]);
    expect(skillsForJob("mastertrainer")).toEqual([
      "v2c_mastertrainer_elitetraining",
    ]);
    for (const jobId of ["healthtrainer", "physicalcoach", "mastertrainer"]) {
      for (const id of skillsForJob(jobId)) {
        expect(V2_SKILLS[id].category, id).toBe("passive");
      }
    }
    expect(V2_SKILLS.v2c_healthtrainer_routine.passive?.guildTrainingRewardBonusPct).toBe(5);
    expect(V2_SKILLS.v2c_healthtrainer_routine.passive?.guildTrainingWeeklyBonusMastery).toBe(5);
    expect(V2_SKILLS.v2c_physicalcoach_conditioning.passive?.guildTrainingRewardBonusPct).toBe(8);
    expect(V2_SKILLS.v2c_physicalcoach_conditioning.passive?.guildTrainingWeeklyBonusMastery).toBe(10);
    expect(V2_SKILLS.v2c_mastertrainer_elitetraining.passive?.guildTrainingRewardBonusPct).toBe(12);
    expect(V2_SKILLS.v2c_mastertrainer_elitetraining.passive?.guildTrainingWeeklyBonusMastery).toBe(15);
  });

  it("도적 직군 스케일링: 자객 처단=LUK 비례, 궁사 연사=DEX 비례", () => {
    // 도적 정체성 — 데미지가 str-atk 가 아니라 행운/민첩 직접 비례(scaling). 원시스탯이 커서 계수 작음.
    const assassin = V2_SKILLS.v2c_assassin_ambush.effects[0];
    expect(assassin).toMatchObject({ kind: "executeDamage", scaling: "luk" });
    const ranger = V2_SKILLS.v2c_ranger_ambush.effects[0];
    expect(ranger).toMatchObject({ kind: "damage", scaling: "dex" });
  });

  it("상위 직업 패시브는 서로 다른 축/효과(고유 — 순회 메리트)", () => {
    const passiveIds = [
      "v2c_shieldman_vitality", "v2c_squire_might", "v2c_boxer_fortitude",
      "v2c_monk_spirit", "v2c_caster_acumen", "v2c_acolyte_mana",
      "v2c_assassin_fortune", "v2c_archer_agility", "v2c_venomist_corrosion",
      "v2c_camper_ration", "v2c_ironman_body",
    ] as const;
    // 각 패시브가 건드리는 "축/효과"를 키로 직렬화 → 9개 모두 유일해야 한다.
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
      if (p.defPct) keys.push("defPct"); // 방패병 방벽(방어%) — 고유 축
      if (p.atkPerDexCoef) keys.push("atkPerDexCoef");
      if (p.healPowerPct) keys.push("healPowerPct");
      if (p.poisonedEnemyDefReductionPct) keys.push("poisonedEnemyDefReductionPct");
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
      shaman: "v2c_shaman_hex",
      ranger: "v2c_ranger_ambush",
      fieldmedic: "v2c_fieldmedic_treatment",
      extremesurvivor: "v2c_extremesurvivor_struggle",
    };
    const PASSIVE: Record<string, V2SkillId> = {
      paladin: "v2c_paladin_might3",
      brawler: "v2c_brawler_fortitude3",
      magus: "v2c_magus_acumen3",
      shaman: "v2c_shaman_omen3",
      ranger: "v2c_ranger_finesse3",
      fieldmedic: "v2c_fieldmedic_training",
      extremesurvivor: "v2c_extremesurvivor_adaptation",
    };
    for (const job of Object.keys(ACTIVES)) {
      expect(skillsForJob(job), job).toEqual([ACTIVES[job], PASSIVE[job]]);
      expect(V2_SKILLS[ACTIVES[job]].category, ACTIVES[job]).not.toBe("passive");
      expect(V2_SKILLS[ACTIVES[job]].tier, ACTIVES[job]).toBe(3);
      expect(V2_SKILLS[PASSIVE[job]].category, PASSIVE[job]).toBe("passive");
    }
    // magus/ranger = 직군 축 % 증폭. ranger 는 궁수 민첩(dex+10%)의 상위판 "민첩 II".
    //   brawler 는 무인 재설계로 회피(보법 II)로 전환 — 격투가 회피 갈래.
    expect(V2_SKILLS.v2c_brawler_fortitude3.passive?.evasionPct).toBe(12);
    expect(V2_SKILLS.v2c_magus_acumen3.passive?.statPct?.int).toBe(30);
    expect(V2_SKILLS.v2c_shaman_omen3.passive?.enemyMagicVulnPctPerStack).toBe(5);
    expect(V2_SKILLS.v2c_ranger_finesse3.passive?.statPct?.dex).toBe(20);
    expect(V2_SKILLS.v2c_ranger_finesse3.passive?.accuracyPct).toBeUndefined();
    // paladin(기사) = 공방 균형(힘 10% + 방어 10%, 각 낮게). 가디언(방어 20%)·견습기사(힘 15%)와 차별.
    expect(V2_SKILLS.v2c_paladin_might3.passive?.statPct?.str).toBe(10);
    expect(V2_SKILLS.v2c_paladin_might3.passive?.defPct).toBe(10);
    expect(V2_SKILLS.v2c_fieldmedic_treatment.effects[0]).toMatchObject({
      kind: "heal",
      pctLostHp: 35,
    });
    expect(V2_SKILLS.v2c_fieldmedic_treatment.mpCost).toBe(0);
    expect(V2_SKILLS.v2c_fieldmedic_treatment.oncePerBattle).toBe(true);
    expect(V2_SKILLS.v2c_fieldmedic_training.passive).toMatchObject({
      healPowerPct: 15,
      maxHpPct: 8,
    });
    expect(
      V2_SKILLS.v2c_extremesurvivor_struggle.effects.some(
        (e) => e.kind === "shield" && e.pctMaxHp === 8,
      ),
    ).toBe(true);
    expect(V2_SKILLS.v2c_extremesurvivor_adaptation.passive).toMatchObject({
      maxHpPct: 20,
      damageTakenReductionPct: 5,
    });
  });

  it("고차 두 번째 갈래(tier 3) = 액티브 1 + 고유 패시브(형제와 다른 축)", () => {
    const KIT: Record<string, [V2SkillId, V2SkillId]> = {
      guardian: ["v2c_guardian_bash", "v2c_guardian_bulwark3"],
      berserker: ["v2c_berserker_bloodslash", "v2c_berserker_madness3"],
      warmonk: ["v2c_warmonk_kick", "v2c_warmonk_evasion3"],
      bishop: ["v2c_bishop_heal", "v2c_bishop_blessing3"],
      shadow: ["v2c_shadow_assassinate", "v2c_shadow_lethality3"],
      venomancer: ["v2c_venomancer_miasma", "v2c_venomancer_corrosion3"],
    };
    for (const [job, [active, passive]] of Object.entries(KIT)) {
      expect(skillsForJob(job), job).toEqual([active, passive]);
      expect(V2_SKILLS[active], active).toBeDefined();
      expect(V2_SKILLS[passive].category, passive).toBe("passive");
      expect(V2_SKILLS[passive].tier, passive).toBe(3);
    }
    // 형제(기사/격투가/마도사/궁사)와 다른 축: 방어%(순수)·활력(무승 강건 III)·회복강화·치명피해.
    expect(V2_SKILLS.v2c_guardian_bulwark3.passive?.defPct).toBe(20);
    expect(V2_SKILLS.v2c_berserker_madness3.passive?.berserkAtkPctPerLostHpPct).toBe(0.45);
    expect(V2_SKILLS.v2c_warmonk_evasion3.passive?.statPct?.vit).toBe(30);
    expect(V2_SKILLS.v2c_bishop_blessing3.passive?.healPowerPct).toBe(30);
    expect(V2_SKILLS.v2c_shadow_lethality3.passive?.critDmgPct).toBe(25); // 크리축 차수 단조(3차)
    expect(
      V2_SKILLS.v2c_venomancer_corrosion3.passive
        ?.poisonedEnemyDefReductionPct,
    ).toBe(20);
    // 대사제 액티브 = 자힐(heal), 그림자 액티브 = 처형(executeDamage).
    expect(V2_SKILLS.v2c_bishop_heal.category).toBe("heal");
    expect(V2_SKILLS.v2c_shadow_assassinate.effects[0].kind).toBe("executeDamage");
    expect(V2_SKILLS.v2c_berserker_bloodslash.effects[0].kind).toBe("hpCostDamage");
    expect(
      V2_SKILLS.v2c_venomancer_miasma.effects.some(
        (e) => e.kind === "stackPayoffDamage" && e.tag === "poison",
      ),
    ).toBe(true);
  });

  it("심화 직업(tier 4) = 액티브 1(강) + 패시브(직군마다 다른 효과)", () => {
    // 권룡(sensei)은 아래에서 연격형 공격 킷을 별도 검증한다.
    const KIT: Record<string, [V2SkillId, V2SkillId]> = {
      veteran: ["v2c_veteran_cleave", "v2c_veteran_lethal"],
      warlord: ["v2c_warlord_bloodbath", "v2c_warlord_slaughter"],
      sage: ["v2c_sage_bolt", "v2c_sage_insight"],
      runecaster: ["v2c_runecaster_grandsigil", "v2c_runecaster_circuit"],
      archshaman: ["v2c_archshaman_rite", "v2c_archshaman_curse"],
      archbishop: ["v2c_archbishop_sanctuary", "v2c_archbishop_grace"],
      chief: ["v2c_chief_strike", "v2c_chief_afterimage"],
      phantom: ["v2c_phantom_ambush", "v2c_phantom_stealth"],
      venomlord: ["v2c_venomlord_plague", "v2c_venomlord_sovereign"],
      rescueexpert: ["v2c_rescueexpert_rescue", "v2c_rescueexpert_support"],
      returner: ["v2c_returner_survive", "v2c_returner_undying"],
      crusader: ["v2c_crusader_judgment", "v2c_crusader_oath"],
      runeknight: ["v2c_runeknight_carve", "v2c_runeknight_inscription"],
      crimsontemplar: ["v2c_crimsontemplar_judgment", "v2c_crimsontemplar_oath"],
    };
    for (const [job, [active, passive]] of Object.entries(KIT)) {
      expect(skillsForJob(job), job).toEqual([active, passive]);
      expect(V2_SKILLS[active].category, active).not.toBe("passive");
      expect(V2_SKILLS[passive].category, passive).toBe("passive");
    }
    // 심화 패시브 = 라인 비포화 효과(기존 어휘 재사용, PvP-안전).
    expect(V2_SKILLS.v2c_veteran_lethal.passive?.critDmgPct).toBe(30); // 크리축 차수 단조 — 4차 최상
    expect(V2_SKILLS.v2c_warlord_slaughter.passive?.berserkAtkPctPerLostHpPct).toBe(0.65);
    expect(V2_SKILLS.v2c_sensei_ironbody.passive?.statPct?.str).toBe(20); // 근력 III(힘%·옛 철신서 전환·무인 재설계)
    expect(V2_SKILLS.v2c_sage_insight.passive?.critPct).toBe(10); // 크리축 차수 단조 — 4차 > 2차 자객(8)
    expect(V2_SKILLS.v2c_runecaster_grandsigil.equippedSynergies?.map((s) => s.requiredSkillId)).toEqual([
      "v2c_mage_acumen",
      "v2c_caster_acumen",
      "v2c_magus_acumen3",
    ]);
    expect(V2_SKILLS.v2c_runecaster_circuit.passive).toMatchObject({
      maxMpPct: 12,
      critPct: 5,
    });
    expect(V2_SKILLS.v2c_archshaman_curse.passive?.enemyMagicVulnPctPerStack).toBe(8);
    expect(V2_SKILLS.v2c_archbishop_sanctuary.effects).toEqual([
      { kind: "heal", pctLostHp: 5, statCoef: 0.45, baseFlatByTier: [70, 70, 70], scaling: "magic" },
      { kind: "selfBuffPct", target: "damageReduction", pct: 8, turns: 3 },
    ]);
    expect(V2_SKILLS.v2c_archbishop_grace.passive).toMatchObject({
      healPowerPct: 12,
      maxHpPct: 8,
    });
    expect(V2_SKILLS.v2c_chief_afterimage.passive?.accuracyPct).toBe(20); // 매의 눈 — 명중(궁수 라인 정점)
    expect(V2_SKILLS.v2c_phantom_stealth.passive?.evasionPct).toBe(16); // 은신 — 회피(암살자·tier4 유일 회피축)
    expect(
      V2_SKILLS.v2c_venomlord_sovereign.passive
        ?.poisonedEnemyDefReductionPct,
    ).toBe(28); // 부식 III — 중독 적 방어 감소 정점
    expect(V2_SKILLS.v2c_rescueexpert_rescue.effects[0]).toMatchObject({
      kind: "heal",
      pctLostHp: 45,
    });
    expect(V2_SKILLS.v2c_rescueexpert_rescue.mpCost).toBe(0);
    expect(V2_SKILLS.v2c_rescueexpert_rescue.oncePerBattle).toBe(true);
    expect(V2_SKILLS.v2c_rescueexpert_support.passive).toMatchObject({
      healPowerPct: 20,
      maxHpPct: 10,
    });
    expect(V2_SKILLS.v2c_returner_survive.effects[0]).toMatchObject({
      kind: "heal",
      pctLostHp: 35,
    });
    expect(V2_SKILLS.v2c_returner_survive.mpCost).toBe(0);
    expect(V2_SKILLS.v2c_returner_survive.oncePerBattle).toBe(true);
    expect(V2_SKILLS.v2c_returner_undying.passive).toMatchObject({
      maxHpPct: 25,
      damageTakenReductionPct: 8,
    });
    expect(V2_SKILLS.v2c_crusader_judgment.effects.map((e) => e.kind)).toEqual([
      "damage",
      "heal",
      "selfBuffPct",
    ]);
    expect(V2_SKILLS.v2c_crusader_oath.passive).toMatchObject({
      defPct: 14,
      healPowerPct: 14,
      damageTakenReductionPct: 4,
    });
    expect(V2_SKILLS.v2c_runeknight_carve.effects.map((e) => e.kind)).toEqual([
      "damage",
      "damage",
      "enemyVuln",
    ]);
    expect(V2_SKILLS.v2c_runeknight_carve.effects[1]).toMatchObject({
      kind: "damage",
      scaling: "magic",
    });
    expect(V2_SKILLS.v2c_runeknight_inscription.passive).toMatchObject({
      statPct: { str: 14, int: 14 },
      critPct: 5,
    });
    expect(V2_SKILLS.v2c_crimsontemplar_judgment.effects.map((e) => e.kind)).toEqual([
      "hpCostDamage",
      "heal",
    ]);
    expect(V2_SKILLS.v2c_crimsontemplar_judgment.effects[0]).toMatchObject({
      kind: "hpCostDamage",
      pctCurrentHp: 9,
    });
    expect(V2_SKILLS.v2c_crimsontemplar_oath.passive).toMatchObject({
      berserkAtkPctPerLostHpPct: 0.45,
      healPowerPct: 16,
      damageTakenReductionPct: 5,
    });
    // 신궁 액티브 관통사 = 관통(방어 무시) 추가타.
    expect(V2_SKILLS.v2c_chief_strike.effects[0]).toMatchObject({ kind: "damage", pierceDamagePct: 20 });
    // 정예 기사 액티브 왕실 검술 = 처형딜, 적 HP 15%↓ 에서 ×2(오너 하향, 옛 30%).
    expect(V2_SKILLS.v2c_veteran_cleave.effects[0]).toMatchObject({
      kind: "executeDamage",
      hpThresholdPct: 15,
      bonusMult: 2.0,
    });
    // 광왕 액티브 혈전 = HP 소모 강타.
    expect(V2_SKILLS.v2c_warlord_bloodbath.effects[0]).toMatchObject({
      kind: "hpCostDamage",
      pctCurrentHp: 10,
    });
    // 대주술사 액티브 금단 의식 = 마법취약 스택 페이오프.
    expect(
      V2_SKILLS.v2c_archshaman_rite.effects.some(
        (e) => e.kind === "stackPayoffDamage" && e.tag === "magicVuln",
      ),
    ).toBe(true);
    // 암살자 액티브 기습 = 처형의 역(풀피 보너스·LUK 비례) 오프너.
    expect(V2_SKILLS.v2c_phantom_ambush.effects[0]).toMatchObject({ kind: "ambushDamage", scaling: "luk" });
    // 독왕 액티브 독왕진 = 중독 누적 + 중독 스택 페이오프.
    expect(
      V2_SKILLS.v2c_venomlord_plague.effects.some(
        (e) => e.kind === "dot" && e.tag === "poison",
      ),
    ).toBe(true);
    expect(
      V2_SKILLS.v2c_venomlord_plague.effects.some(
        (e) => e.kind === "stackPayoffDamage" && e.tag === "poison",
      ),
    ).toBe(true);
  });

  it("5차 직업 = 액티브 1 + 패시브 1", () => {
    const KIT: Record<string, [V2SkillId, V2SkillId]> = {
      swordmaster: ["v2c_swordmaster_cut", "v2c_swordmaster_focus"],
      ironknight: ["v2c_ironknight_guard", "v2c_ironknight_wall"],
      overlord: ["v2c_overlord_ruin", "v2c_overlord_throne"],
      arcanist: ["v2c_arcanist_burst", "v2c_arcanist_theory"],
      marksman: ["v2c_marksman_shot", "v2c_marksman_aim"],
      nightshade: ["v2c_nightshade_eclipse", "v2c_nightshade_cloak"],
      saint: ["v2c_saint_miracle", "v2c_saint_benediction"],
      plaguebringer: ["v2c_plaguebringer_outbreak", "v2c_plaguebringer_decay"],
      dragonfist: ["v2c_dragonfist_rupture", "v2c_dragonfist_footwork"],
      adamantmonk: ["v2c_adamantmonk_stance", "v2c_adamantmonk_body"],
      immortal: ["v2c_immortal_lifestrike", "v2c_immortal_heart"],
      transcendent: ["v2c_transcendent_mandala", "v2c_transcendent_harmony"],
      bloodlord: ["v2c_bloodlord_brand", "v2c_bloodlord_martyrdom"],
    };
    for (const [job, [active, passive]] of Object.entries(KIT)) {
      expect(skillsForJob(job), job).toEqual([active, passive]);
      expect(V2_SKILLS[active].category, active).not.toBe("passive");
      expect(V2_SKILLS[passive].category, passive).toBe("passive");
    }
    expect(V2_SKILLS.v2c_ironknight_wall.passive).toMatchObject({
      defPct: 18,
      thornsDefPct: 80,
    });
    expect(V2_SKILLS.v2c_overlord_ruin.effects.map((e) => e.kind)).toEqual([
      "hpCostDamage",
      "executeDamage",
    ]);
    expect(V2_SKILLS.v2c_overlord_ruin.effects[0]).toMatchObject({
      kind: "hpCostDamage",
      pctCurrentHp: 12,
    });
    expect(V2_SKILLS.v2c_overlord_throne.passive).toMatchObject({
      berserkAtkPctPerLostHpPct: 0.8,
      critDmgPct: 30,
      maxHpPct: 8,
    });
    expect(V2_SKILLS.v2c_nightshade_eclipse.effects.map((e) => e.kind)).toEqual([
      "ambushDamage",
      "executeDamage",
    ]);
    expect(V2_SKILLS.v2c_saint_miracle.effects.map((e) => e.kind)).toEqual([
      "heal",
      "shield",
      "selfBuffPct",
    ]);
    expect(V2_SKILLS.v2c_plaguebringer_decay.passive?.poisonedEnemyDefReductionPct).toBe(35);
    expect(V2_SKILLS.v2c_dragonfist_rupture.effects.map((e) => e.kind)).toEqual([
      "damage",
      "damage",
      "damage",
      "damage",
      "enemyDebuff",
      "selfBuffPct",
    ]);
    expect(V2_SKILLS.v2c_dragonfist_rupture.effects[0]).toMatchObject({
      kind: "damage",
      pierceDamagePct: 10,
    });
    expect(V2_SKILLS.v2c_dragonfist_footwork.passive).toMatchObject({
      statPct: { str: 18 },
      evasionPct: 16,
      accuracyPct: 8,
    });
    expect(V2_SKILLS.v2c_adamantmonk_stance.effects).toEqual([
      { kind: "shield", pctMaxHp: 14, turns: 3 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 10, turns: 3 },
    ]);
    expect(V2_SKILLS.v2c_adamantmonk_body.passive).toMatchObject({
      maxHpPct: 25,
      counterChancePct: 35,
    });
    expect(V2_SKILLS.v2c_immortal_lifestrike.effects[0]).toMatchObject({
      kind: "damage",
      scaling: "maxHp",
    });
    expect(V2_SKILLS.v2c_immortal_heart.passive).toMatchObject({
      maxHpPct: 30,
      damageTakenReductionPct: 6,
    });
    expect(V2_SKILLS.v2c_transcendent_mandala.effects[0]).toMatchObject({
      kind: "damage",
      scaling: "all",
    });
    expect(V2_SKILLS.v2c_transcendent_harmony.passive).toMatchObject({
      statPct: { str: 8, vit: 8, dex: 8, int: 8, spi: 8, luk: 8 },
      maxHpPct: 8,
      maxMpPct: 8,
    });
    expect(V2_SKILLS.v2c_bloodlord_brand.effects.map((e) => e.kind)).toEqual([
      "hpCostDamage",
      "executeDamage",
      "heal",
    ]);
    expect(V2_SKILLS.v2c_bloodlord_brand.effects[0]).toMatchObject({
      kind: "hpCostDamage",
      pctCurrentHp: 10,
    });
    expect(V2_SKILLS.v2c_bloodlord_brand.effects[1]).toMatchObject({
      kind: "executeDamage",
      hpThresholdPct: 30,
    });
    expect(V2_SKILLS.v2c_bloodlord_martyrdom.passive).toMatchObject({
      maxHpPct: 20,
      berserkAtkPctPerLostHpPct: 0.55,
      healPowerPct: 20,
      damageTakenReductionPct: 6,
    });
  });

  it("6차 직업 = 계열 컨셉을 확장한 액티브 + 패시브", () => {
    expect(skillsForJob("fortressknight")).toEqual([
      "v2c_fortressknight_ram",
      "v2c_fortressknight_citadel",
    ]);
    expect(V2_SKILLS.v2c_fortressknight_ram.category).toBe("attack");
    expect(V2_SKILLS.v2c_fortressknight_ram.effects).toEqual([
      { kind: "damage", statCoef: 1.8, baseFlat: 420, scaling: "def" },
      { kind: "enemyDelay", pct: 60 },
    ]);
    expect(V2_SKILLS.v2c_fortressknight_citadel.category).toBe("passive");
    expect(V2_SKILLS.v2c_fortressknight_citadel.passive).toMatchObject({
      defPct: 30,
      damageTakenReductionPct: 8,
      thornsDefPct: 120,
    });
    expect(skillsForJob("swordsaint")).toEqual([
      "v2c_swordsaint_flash",
      "v2c_swordsaint_transcendence",
    ]);
    expect(V2_SKILLS.v2c_swordsaint_flash.category).toBe("attack");
    expect(V2_SKILLS.v2c_swordsaint_flash.effects.map((e) => e.kind)).toEqual([
      "damage",
      "enemyDebuff",
      "enemyDelay",
    ]);
    expect(V2_SKILLS.v2c_swordsaint_transcendence.category).toBe("passive");
    expect(V2_SKILLS.v2c_swordsaint_transcendence.passive).toMatchObject({
      statPct: { str: 24 },
      critDmgPct: 35,
      accuracyPct: 10,
      spdOverflowToAtkPct: 35,
    });
    expect(skillsForJob("hegemon")).toEqual([
      "v2c_hegemon_annihilation",
      "v2c_hegemon_dominion",
    ]);
    expect(V2_SKILLS.v2c_hegemon_annihilation.effects.map((e) => e.kind)).toEqual([
      "hpCostDamage",
      "executeDamage",
      "enemyVuln",
    ]);
    expect(V2_SKILLS.v2c_hegemon_annihilation.effects[0]).toMatchObject({
      kind: "hpCostDamage",
      pctCurrentHp: 14,
    });
    expect(V2_SKILLS.v2c_hegemon_dominion.category).toBe("passive");
    expect(V2_SKILLS.v2c_hegemon_dominion.passive).toMatchObject({
      berserkAtkPctPerLostHpPct: 1.0,
      critDmgPct: 40,
      maxHpPct: 12,
    });
    expect(skillsForJob("celestialdragon")).toEqual([
      "v2c_celestialdragon_combo",
      "v2c_celestialdragon_breath",
    ]);
    expect(V2_SKILLS.v2c_celestialdragon_combo.category).toBe("attack");
    expect(V2_SKILLS.v2c_celestialdragon_combo.effects.map((e) => e.kind)).toEqual([
      "damage",
      "damage",
      "damage",
      "damage",
      "damage",
      "enemyVuln",
      "selfBuffPct",
      "enemyDelay",
    ]);
    expect(V2_SKILLS.v2c_celestialdragon_combo.effects[5]).toMatchObject({
      kind: "enemyVuln",
      pct: 20,
    });
    expect(V2_SKILLS.v2c_celestialdragon_combo.effects[7]).toMatchObject({
      kind: "enemyDelay",
      pct: 40,
    });
    expect(V2_SKILLS.v2c_celestialdragon_breath.category).toBe("passive");
    expect(V2_SKILLS.v2c_celestialdragon_breath.passive).toMatchObject({
      statPct: { str: 22, dex: 10 },
      evasionPct: 20,
      accuracyPct: 12,
      comboFinisherBonusPct: 30,
    });
    expect(skillsForJob("vajraarhat")).toEqual([
      "v2c_vajraarhat_seal",
      "v2c_vajraarhat_body",
    ]);
    expect(V2_SKILLS.v2c_vajraarhat_seal.category).toBe("buff");
    expect(V2_SKILLS.v2c_vajraarhat_seal.effects).toEqual([
      { kind: "shield", pctMaxHp: 18, turns: 3 },
      { kind: "selfBuffPct", target: "damageReduction", pct: 14, turns: 3 },
      { kind: "selfBuffPct", target: "reflectDamage", pct: 45, turns: 3 },
    ]);
    expect(V2_SKILLS.v2c_vajraarhat_body.category).toBe("passive");
    expect(V2_SKILLS.v2c_vajraarhat_body.passive).toMatchObject({
      maxHpPct: 32,
      damageTakenReductionPct: 8,
      counterChancePct: 30,
    });
    expect(
      aggregateEquippedPassives([
        "v2c_adamantmonk_body",
        "v2c_vajraarhat_body",
      ]).counterChancePct,
    ).toBe(54.5);
  });

  it("권룡(sensei) = 권룡연파(연격+방깎+취약) + 근력 III(힘%) — 연격형 재설계", () => {
    // 무인 재설계(2026-06-22) — 옛 절정 킷(반격+철신)을 투승으로 이전, 권룡은 공격형(권룡연파+근력 III)으로.
    //   v2c_sensei_combo/ironbody id 유지(세이브 호환·내용만 교체).
    expect(skillsForJob("sensei")).toEqual([
      "v2c_sensei_combo",
      "v2c_sensei_ironbody",
    ]);
    expect(V2_SKILLS.v2c_sensei_combo.category).toBe("attack");
    expect(V2_SKILLS.v2c_sensei_combo.effects.map((e) => e.kind)).toEqual([
      "damage",
      "damage",
      "damage",
      "enemyDebuff",
      "enemyVuln",
    ]);
    expect(V2_SKILLS.v2c_sensei_ironbody.category).toBe("passive");
    expect(V2_SKILLS.v2c_sensei_ironbody.passive?.statPct?.str).toBe(20);
  });

  it("투승(battlemonk) = 반격 + 철신(둘 다 패시브·옛 절정 킷 상속)", () => {
    // 권룡이 공격형이 되며 옛 절정 탱 킷(반격+철신)이 무승 계보 정점 투승으로 이동(신규 전용 id).
    expect(skillsForJob("battlemonk")).toEqual([
      "v2c_battlemonk_counter",
      "v2c_battlemonk_ironbody",
    ]);
    expect(V2_SKILLS.v2c_battlemonk_counter.category).toBe("passive");
    expect(V2_SKILLS.v2c_battlemonk_counter.passive?.counterChancePct).toBe(30);
    expect(V2_SKILLS.v2c_battlemonk_ironbody.passive?.maxHpPct).toBe(20);
  });

  it("신규 하이브리드 = 혈성기사/암흑사제 킷", () => {
    expect(skillsForJob("bloodtemplar")).toEqual([
      "v2c_bloodtemplar_stigma",
      "v2c_bloodtemplar_martyr",
    ]);
    expect(V2_SKILLS.v2c_bloodtemplar_stigma.effects[0]).toMatchObject({
      kind: "hpCostDamage",
      pctCurrentHp: 8,
    });
    expect(
      V2_SKILLS.v2c_bloodtemplar_stigma.effects.some(
        (e) => e.kind === "healFromDamage" && e.pct === 18,
      ),
    ).toBe(true);
    expect(V2_SKILLS.v2c_bloodtemplar_martyr.passive).toMatchObject({
      berserkAtkPctPerLostHpPct: 0.35,
      healPowerPct: 12,
    });

    expect(skillsForJob("darkpriest")).toEqual([
      "v2c_darkpriest_reap",
      "v2c_darkpriest_blessing",
    ]);
    expect(V2_SKILLS.v2c_darkpriest_reap.effects[0]).toMatchObject({
      kind: "damage",
      scaling: "luk",
    });
    expect(
      V2_SKILLS.v2c_darkpriest_reap.effects.some(
        (e) =>
          e.kind === "executeDamage" &&
          e.scaling === "luk" &&
          e.hpThresholdPct === 20 &&
          e.bonusMult === 2.4,
      ),
    ).toBe(true);
    expect(
      V2_SKILLS.v2c_darkpriest_reap.effects.some(
        (e) => e.kind === "healFromDamage" && e.pct === 14,
      ),
    ).toBe(true);
    expect(V2_SKILLS.v2c_darkpriest_blessing.passive).toMatchObject({
      healPowerPct: 18,
      critDmgPct: 20,
    });
  });

  it("모험가(none) = 착용형 패시브 2종, 없는 jobId = 빈 배열", () => {
    expect(skillsForJob("none")).toEqual([
      "v2c_none_toughness",
      "v2c_none_diligence",
    ]);
    expect(skillsForJob("nope")).toEqual([]);
  });

  it("모험가 패시브 — 강인함 HP+10%, 수련 숙달+1(착용 시)", () => {
    expect(V2_SKILLS.v2c_none_toughness.passive?.maxHpPct).toBe(10);
    expect(V2_SKILLS.v2c_none_diligence.passive?.profPerKillBonus).toBe(1);
    // 착용 패시브 숙달 보너스 합산 — 수련 장착 시 +1, 미장착/타 패시브 0.
    expect(equippedProfPerKillBonus(["v2c_none_diligence"])).toBe(1);
    expect(equippedProfPerKillBonus([])).toBe(0);
    expect(equippedProfPerKillBonus(["v2c_none_toughness"])).toBe(0);
    // 수련은 SP 슬롯 차지(spCost>0).
    expect(spCostOf(V2_SKILLS.v2c_none_diligence)).toBeGreaterThan(0);
  });
});

describe("직업 킷 — 액티브 스킬", () => {
  it("철포 = 받피감 버프(수도승·selfBuffPct damageReduction)", () => {
    const eff = V2_SKILLS.v2c_monk_palm.effects[0];
    expect(eff).toMatchObject({
      kind: "selfBuffPct",
      target: "damageReduction",
    });
  });

  it("하급 권법 = 단일 딜(견습 무인·옛 철포 자리)", () => {
    const eff = V2_SKILLS.v2c_martial_steelguard.effects[0];
    expect(eff).toMatchObject({ kind: "damage" });
  });

  it("마력탄 = 0코스트 100% 발동 마법 단일타", () => {
    const s = V2_SKILLS.v2c_mage_boltcast;
    expect(s.mpCost).toBe(0);
    expect(s.procChance).toBe(100);
    expect(s.effects[0]).toMatchObject({ kind: "damage", scaling: "magic" });
  });

  it("독침 = 정액 + HP비례 중독", () => {
    const dot = V2_SKILLS.v2c_rogue_poison.effects.find((e) => e.kind === "dot");
    expect(dot).toBeTruthy();
    if (dot && dot.kind === "dot") {
      expect(dot.flatPerStack).toBeGreaterThan(0);
      expect(dot.pctMaxHpPerStack).toBeGreaterThan(0);
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
      "v2c_battlemonk_ironbody", // maxHpPct 20 (철신 — 투승, 옛 절정서 상속)
      "v2c_acolyte_mana", // healPowerPct 20 (회복강화 — SPI PR-4, 옛 maxMpPct 리스킨)
    ]);
    expect(agg.statPct).toEqual({ vit: 10, str: 15 }); // % 스탯 누적
    expect(agg.maxHpPct).toBe(20);
    expect(agg.healPowerPct).toBe(20);
    expect(agg.maxMpPct).toBe(0); // 리스킨 후 maxMpPct 패시브는 카탈로그에 없음
  });

  it("aggregateEquippedPassives — 다양성 효과(치명/치명피해/회피/방어%/부식/광전/마법취약/마방) 합산", () => {
    // 명중(accuracyPct) 축은 신궁 "매의 눈"(tier4)으로, 흡혈(lifesteal)은 보류(무인 재설계 2026-06-22)라
    //   이 케이스엔 미포함. 회피 원천 = 권사 보법(v2c_boxer_fortitude, evasionPct 8).
    const agg = aggregateEquippedPassives([
      "v2c_assassin_fortune", // critPct 8
      "v2c_shadow_lethality3", // critDmgPct 25 (크리축 3차)
      "v2c_boxer_fortitude", // evasionPct 8 (보법)
      "v2c_guardian_bulwark3", // defPct 20 (방벽·순수 방어)
      "v2c_venomist_corrosion", // poisonedEnemyDefReductionPct 12 (중독 적 방어 약화)
      "v2c_berserker_madness3", // berserkAtkPctPerLostHpPct 0.45
      "v2c_shaman_omen3", // enemyMagicVulnPctPerStack 5
      "v2c_warder_ward", // magicDefPct 15 + 초반 마법 피해 감소
    ]);
    expect(agg.critPct).toBe(8);
    expect(agg.critDmgPct).toBe(25);
    expect(agg.evasionPct).toBe(8);
    expect(agg.defPct).toBe(20);
    expect(agg.poisonedEnemyDefReductionPct).toBe(12);
    expect(agg.berserkAtkPctPerLostHpPct).toBe(0.45);
    expect(agg.enemyMagicVulnPctPerStack).toBe(5);
    expect(agg.magicDefPct).toBe(15);
    expect(agg.openingMagicDamageReductionPct).toBe(10);
    expect(agg.openingMagicDamageReductionPhases).toBe(3);
    // 비스탯 효과만 골랐으므로 statPct 는 비어 있음.
    expect(agg.statPct).toEqual({});
  });

  it("aggregateEquippedPassives — 천룡의 호흡이 절초 보너스를 합산", () => {
    expect(
      aggregateEquippedPassives(["v2c_celestialdragon_breath"])
        .comboFinisherBonusPct,
    ).toBe(30);
    expect(aggregateEquippedPassives([]).comboFinisherBonusPct).toBe(0);
  });

  it("수호자(warden) 킷 — 수호의 방벽(보호막) + 가시 방벽(반사)", () => {
    expect(skillsForJob("warden")).toEqual([
      "v2c_warden_aegis",
      "v2c_warden_thorns",
    ]);
    // 액티브: 최대HP 10% 보호막
    expect(V2_SKILLS.v2c_warden_aegis.effects[0]).toMatchObject({
      kind: "shield",
      pctMaxHp: 10,
    });
    // 패시브: 피격 시 방어력 100% 반사("방어 계수만큼")
    expect(V2_SKILLS.v2c_warden_thorns.passive?.thornsDefPct).toBe(100);
    // aggregate 가 thornsDefPct 를 수집(미보유=0)
    expect(aggregateEquippedPassives(["v2c_warden_thorns"]).thornsDefPct).toBe(
      100,
    );
    expect(
      aggregateEquippedPassives(["v2c_guardian_bulwark3"]).thornsDefPct,
    ).toBe(0);
  });

  it("효과 패시브 맵(V2_JOB_PASSIVES)은 비어 있음 — 기본은 패시브 스킬로 이관", () => {
    expect(V2_JOB_PASSIVES).toEqual({});
    expect(jobPassive("warrior")).toEqual({});
  });
});
