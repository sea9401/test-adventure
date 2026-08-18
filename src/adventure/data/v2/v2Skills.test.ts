import { describe, it, expect } from "vitest";
import {
  LIMITED_RECOVERY_SKILL_IDS,
  V2_SKILLS,
  V2_STARTER_SKILL_IDS,
  parseV2SkillsState,
  emptyV2SkillsState,
  orderedLearnedSkills,
  describeV2Skill,
  v2SkillSelectLabel,
  v2SkillSearchText,
  smartDefaultConditionForSkill,
  smartDefaultPatternFromEquipped,
  aggregateEquippedPassives,
  equippedFarmBonuses,
  equippedMiningBonuses,
  equippedWoodcuttingBonuses,
  equippedWoodcuttingFailureReductionPct,
  equippedFishingBonuses,
  learnedGuildTrainingBonuses,
  isLifestyleSkill,
  spCostOf,
  rubricSpCost,
  skillPowerScore,
  v2SkillMpCostValue,
  type V2SkillId,
} from "./v2Skills";

describe("트레이너 상시 패시브", () => {
  it("학습 목록만으로 훈련장 보너스를 합산하고 중복은 한 번만 적용한다", () => {
    expect(
      learnedGuildTrainingBonuses([
        "v2c_healthtrainer_routine",
        "v2c_physicalcoach_conditioning",
        "v2c_mastertrainer_elitetraining",
        "v2c_championmaker_championprogram",
        "v2c_legendarytrainer_mentorship",
        "v2c_healthtrainer_routine",
      ]),
    ).toEqual({ rewardBonusPct: 30, weeklyBonusMastery: 40 });
    expect(learnedGuildTrainingBonuses([])).toEqual({
      rewardBonusPct: 0,
      weeklyBonusMastery: 0,
    });
    expect(describeV2Skill(V2_SKILLS.v2c_healthtrainer_routine)).toContain(
      "훈련장 보상 +3% (누적 지급)",
    );
  });
});

describe("HP 소모 공격 툴팁", () => {
  it("공통 명중 조건과 혈마군림의 보호막 포함 회복 기준을 안내한다", () => {
    const bloodDemon = V2_SKILLS.v2c_blooddemon_reign;
    expect(bloodDemon.description).toContain("명중 시 현재 HP 14%");
    expect(bloodDemon.description).toContain("보호막과 HP");
    expect(bloodDemon.description).toContain("실제로 준 피해의 20%");
    expect(describeV2Skill(bloodDemon)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("명중 시 HP 14% 소모"),
        expect.stringContaining("피해량 20% 회복"),
      ]),
    );
  });
});

describe("사제 회복 패시브 (SPI PR-4 — v2c_acolyte_mana 리스킨)", () => {
  it("v2c_acolyte_mana 는 회복강화(healPowerPct) 패시브 — 옛 마나(maxMpPct) 아님", () => {
    const p = V2_SKILLS.v2c_acolyte_mana?.passive;
    expect(p?.healPowerPct).toBe(20);
    expect(p?.maxMpPct ?? 0).toBe(0); // 리스킨으로 MP% 제거
    expect(V2_SKILLS.v2c_acolyte_mana?.name).toBe("회복");
  });
  it("aggregateEquippedPassives 가 healPowerPct 를 합산한다", () => {
    expect(aggregateEquippedPassives(["v2c_acolyte_mana"]).healPowerPct).toBe(20);
    expect(aggregateEquippedPassives([]).healPowerPct).toBe(0);
  });
});

describe("결계사 마법 방어 패시브", () => {
  it("결계술은 마법 방어력과 초반 마법 피해 감소를 제공한다", () => {
    const p = V2_SKILLS.v2c_warder_ward?.passive;
    expect(p).toMatchObject({
      magicDefPct: 15,
      openingMagicDamageReductionPct: 10,
      openingMagicDamageReductionPhases: 3,
    });
    expect(aggregateEquippedPassives(["v2c_warder_ward"])).toMatchObject({
      magicDefPct: 15,
      openingMagicDamageReductionPct: 10,
      openingMagicDamageReductionPhases: 3,
    });
  });

  it("결계사·진법사·봉마사 액티브는 보호막·받피감·봉쇄로 역할이 겹치지 않는다", () => {
    expect(V2_SKILLS.v2c_warder_barrier?.effects).toEqual([
      { kind: "shield", pctMaxHp: 8, turns: 3 },
    ]);
    expect(V2_SKILLS.v2c_ritualist_guardingarray?.effects).toEqual([
      { kind: "selfBuffPct", target: "damageReduction", pct: 14, turns: 3 },
    ]);
    expect(
      describeV2Skill(V2_SKILLS.v2c_ritualist_guardingarray),
    ).toContain("받는 피해 -14% (3행동)");
    expect(
      describeV2Skill(V2_SKILLS.v2c_ritualist_guardingarray),
    ).not.toContain("받는 피해 감소 +14% (3행동)");
    expect(V2_SKILLS.v2c_ritualist_wardcraft?.passive).toMatchObject({
      magicDefPct: 25,
      openingMagicDamageReductionPct: 15,
      openingMagicDamageReductionPhases: 4,
    });
    expect(V2_SKILLS.v2c_spellsealer_sealingfield?.effects).toEqual([
      { kind: "enemyDamageDown", pct: 12, turns: 3 },
      { kind: "enemySkillProcDown", pct: 22, turns: 3 },
    ]);
    expect(V2_SKILLS.v2c_spellsealer_sealingfield?.category).toBe("debuff");
    expect(V2_SKILLS.v2c_spellsealer_greatward?.passive).toMatchObject({
      magicDefPct: 35,
      openingMagicDamageReductionPct: 20,
      openingMagicDamageReductionPhases: 5,
    });
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_warder_barrier)).toMatchObject({
      kind: "all",
      conditions: expect.arrayContaining([{ kind: "self_shield", active: false }]),
    });
    expect(
      smartDefaultConditionForSkill(V2_SKILLS.v2c_ritualist_guardingarray),
    ).toEqual({ kind: "self_buff_pct", target: "damageReduction", active: false });
    expect(
      smartDefaultConditionForSkill(V2_SKILLS.v2c_spellsealer_sealingfield),
    ).toEqual({ kind: "enemy_debuff", target: "damageDown", active: false });
    expect(
      aggregateEquippedPassives([
        "v2c_warder_ward",
        "v2c_ritualist_wardcraft",
        "v2c_spellsealer_greatward",
      ]),
    ).toMatchObject({
      magicDefPct: 75,
      openingMagicDamageReductionPct: 45,
      openingMagicDamageReductionPhases: 5,
    });
  });
});

describe("흑월지배 회피 연계 패시브", () => {
  it("장착 집계와 상세 설명이 회피 후 다음 스킬 확정 치명타를 노출한다", () => {
    const passive = aggregateEquippedPassives(["v2c_blackmoon_dominion"]);
    expect(passive.skillCritAfterEvade).toBe(true);
    expect(passive.skillCritOverflow).toBe(true);
    expect(passive.spdPerLukCoef).toBe(0.75);
    expect(passive.atkPerLukCoef).toBe(0.95);
    expect(describeV2Skill(V2_SKILLS.v2c_blackmoon_dominion)).toContain(
      "회피 후 다음 직접 피해 스킬 확정 치명타",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_blackmoon_dominion)).toContain(
      "행운 ×0.75만큼 속도 증가",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_blackmoon_dominion)).toContain(
      "행운 ×0.95만큼 공격력 증가",
    );
  });
});

describe("가디언 방벽 패시브 (방어% — 방패 강타 방어기반과 시너지)", () => {
  it("v2c_guardian_bulwark3 = 방어 20%(받피감→방어% 전환)", () => {
    expect(V2_SKILLS.v2c_guardian_bulwark3?.passive?.defPct).toBe(20);
    expect(
      V2_SKILLS.v2c_guardian_bulwark3?.passive?.damageTakenReductionPct,
    ).toBeUndefined();
  });
  it("공용 방어와 결계사의 마법 전용 방어를 상세 표기에서 구분한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_guardian_bulwark3)).toContain(
      "물리·마법 방어력 +20%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_warder_ward)).toContain(
      "마법 방어력 +15%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_warder_ward)).not.toContain(
      "물리·마법 방어력 +15%",
    );
  });
  it("damageTakenReductionPct 어휘는 배선 보존(현재 미사용·aggregate 기본 0)", () => {
    expect(aggregateEquippedPassives([]).damageTakenReductionPct).toBe(0);
  });
});

describe("일검필살 공격 전념", () => {
  it("반사 피해 감소를 제거하고 상세 설명에서도 노출하지 않는다", () => {
    const passive = aggregateEquippedPassives([
      "v2c_swordsaint_transcendence",
    ]);
    expect(passive).not.toHaveProperty("reflectDamageTakenReductionPct");
    expect(
      describeV2Skill(V2_SKILLS.v2c_swordsaint_transcendence),
    ).not.toContain("받는 반사 피해 -20%");
  });
});

describe("원소 통달 패시브 칩 (상성 폐지 후 일반 마법 강화)", () => {
  it("describeV2Skill 가 지능·마법 피해 강화 칩을 낸다", () => {
    const chips = describeV2Skill(V2_SKILLS.v2c_elementalist_mastery);
    expect(chips.some((c) => c.includes("지능 +12%"))).toBe(true);
    expect(chips.some((c) => c.includes("마법 스킬 피해 +6%"))).toBe(true);
  });
});

describe("낚시 생활 패시브", () => {
  it("미끼 고르기와 물때 읽기는 장착형 낚시 보너스로 합산된다", () => {
    expect(
      equippedFishingBonuses([
        "v2c_survivor_baitcraft",
        "v2c_camper_tidereading",
        "v2c_angler_pointreading",
        "v2c_masterangler_bigcatchsense",
        "v2c_fullcatchking_bountyhaul",
        "v2c_seagod_deepcurrent",
      ]),
    ).toEqual({
      sizeBonusPct: 7,
      specialWeightPct: 45,
      rareSizeBonusPct: 7,
      bigCatchSizeBonusPct: 4,
    });
    expect(equippedFishingBonuses([])).toEqual({
      sizeBonusPct: 0,
      specialWeightPct: 0,
      rareSizeBonusPct: 0,
      bigCatchSizeBonusPct: 0,
    });
  });

  it("describeV2Skill 가 낚시 효과 칩을 낸다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_survivor_baitcraft)).toContain(
      "물고기 크기 +4%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_camper_tidereading)).toContain(
      "물때 한정 어종 등장률 +25%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_angler_pointreading)).toContain(
      "희귀 이상 물고기 크기 +3%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_masterangler_bigcatchsense)).toContain(
      "대물급 물고기 크기 +2%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_fullcatchking_bountyhaul)).toContain(
      "물고기 크기 +3%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_fullcatchking_bountyhaul)).toContain(
      "대물급 물고기 크기 +2%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_seagod_deepcurrent)).toContain(
      "물때 한정 어종 등장률 +20%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_seagod_deepcurrent)).toContain(
      "희귀 이상 물고기 크기 +4%",
    );
  });
});

describe("농부 생활 패시브", () => {
  it("농장 패시브는 수확량과 희귀 수확 보너스로 합산된다", () => {
    expect(
      equippedFarmBonuses([
        "v2c_farmer_seedselection",
        "v2c_horticulturist_soilreading",
        "v2c_harvestking_abundance",
      ]),
    ).toEqual({ yieldBonusPct: 22, rareChancePct: 6 });
    expect(equippedFarmBonuses([])).toEqual({
      yieldBonusPct: 0,
      rareChancePct: 0,
    });
  });

  it("describeV2Skill 가 농장 효과 칩을 낸다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_farmer_seedselection)).toContain(
      "농장 수확량 +10% (누적 지급)",
    );
    expect(
      describeV2Skill(V2_SKILLS.v2c_horticulturist_soilreading),
    ).toContain("희귀 수확 확률 +3%");
  });
});

describe("요리사 생활 패시브", () => {
  it("describeV2Skill 가 요리 효과 칩을 낸다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_cook_prepwork)).toContain(
      "요리 경험치 +5% (평균 적용)",
    );
    expect(
      describeV2Skill(V2_SKILLS.v2c_professionalcook_seasoning),
    ).toContain("정성작 확률 +8%");
    expect(
      describeV2Skill(V2_SKILLS.v2c_headchef_batchcooking),
    ).toContain("묶음 조리 일반 재료 -10% (누적 절약)");
    expect(
      describeV2Skill(V2_SKILLS.v2c_masterchef_heatcontrol),
    ).toContain("걸작 확률 +5%");
    expect(
      describeV2Skill(V2_SKILLS.v2c_legendarychef_secretrecipe),
    ).toContain("희귀 재료 보존 25%");
  });
});

describe("나무꾼 생활 패시브", () => {
  it("나무결 읽기는 장착 시 벌목 실패율을 상대적으로 낮춘다", () => {
    expect(
      equippedWoodcuttingFailureReductionPct(["v2c_lumberjack_woodreading"]),
    ).toBe(20);
    expect(equippedWoodcuttingFailureReductionPct([])).toBe(0);
    expect(describeV2Skill(V2_SKILLS.v2c_lumberjack_woodreading)).toContain(
      "벌목 실패율 -20%",
    );
  });

  it("상위 나무꾼 패시브는 시간·실패 구제·추가 원목으로 합산된다", () => {
    expect(
      equippedWoodcuttingBonuses([
        "v2c_lumberjack_woodreading",
        "v2c_foresttechnician_axecare",
        "v2c_masterlumberjack_recoverycut",
        "v2c_forestmaster_efficientwork",
        "v2c_legendarylumberjack_bountifulcut",
      ]),
    ).toEqual({
      failureReductionPct: 20,
      durationReductionPct: 18,
      failureRecoveryPct: 20,
      bonusLogChancePct: 30,
    });
    expect(describeV2Skill(V2_SKILLS.v2c_foresttechnician_axecare)).toContain(
      "벌목 시간 -8%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_masterlumberjack_recoverycut)).toContain(
      "벌목 실패 구제 20%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_forestmaster_efficientwork)).toContain(
      "벌목 시간 -10%",
    );
    expect(
      describeV2Skill(V2_SKILLS.v2c_legendarylumberjack_bountifulcut),
    ).toContain("추가 원목 확률 30%");
  });
});

describe("광부 생활 패시브", () => {
  it("광부 계열 패시브는 실패율·시간·실패 구제·추가 광석으로 합산된다", () => {
    expect(
      equippedMiningBonuses([
        "v2c_miner_veinreading",
        "v2c_miningtechnician_toolcare",
        "v2c_masterminer_recoverystroke",
        "v2c_minemaster_efficientmining",
        "v2c_legendaryminer_richvein",
      ]),
    ).toEqual({
      failureReductionPct: 20,
      durationReductionPct: 18,
      failureRecoveryPct: 20,
      bonusOreChancePct: 30,
    });
    expect(describeV2Skill(V2_SKILLS.v2c_miner_veinreading)).toContain(
      "채광 실패율 -20%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_miningtechnician_toolcare)).toContain(
      "채광 시간 -8%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_masterminer_recoverystroke)).toContain(
      "채광 실패 구제 20%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_legendaryminer_richvein)).toContain(
      "추가 광석 확률 30%",
    );
  });
});

describe("v2Skills 카탈로그", () => {
  it("부식과 맹독 패시브는 방어 감소와 중독 피해를 분리해 표시한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_venomist_corrosion)).toContain(
      "중독 적 방어 -6%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_venomist_virulence)).toContain(
      "중독 피해 +12%",
    );
  });

  it("모바일 선택창용 라벨에 스킬 이름과 모든 효과 정보를 포함한다", () => {
    const skill = V2_SKILLS.v2_skill_strike;
    const label = v2SkillSelectLabel(skill);
    expect(label).toContain(skill.name);
    for (const effect of describeV2Skill(skill)) {
      expect(label).toContain(effect);
    }
  });

  it("스킬 검색 색인은 이름뿐 아니라 설명과 효과 칩도 포함한다", () => {
    const corrosion = v2SkillSearchText(V2_SKILLS.v2c_venomist_corrosion);
    expect(corrosion).toContain("부식");
    expect(corrosion).toContain("독");
    expect(corrosion).toContain("중독 적 방어");

    const provoke = v2SkillSearchText(V2_SKILLS.v2c_warden_aegis);
    expect(provoke).toContain("도발");
    expect(provoke).toContain("즉시 시전자를 기본 공격 2회");
  });

  it("스타터 6종 모두 카탈로그에 정의되어 있다", () => {
    for (const id of V2_STARTER_SKILL_IDS) {
      expect(V2_SKILLS[id]).toBeDefined();
      expect(V2_SKILLS[id].tier).toBe(1);
    }
  });

  it("카탈로그 entry 의 id 와 key 가 일치", () => {
    for (const [key, def] of Object.entries(V2_SKILLS)) {
      expect(def.id).toBe(key);
    }
  });

  it("MP cost / cooldown 은 음수 아님", () => {
    for (const def of Object.values(V2_SKILLS)) {
      expect(def.mpCost).toBeGreaterThanOrEqual(0);
      expect(def.cooldown).toBeGreaterThanOrEqual(0);
    }
  });

  it("스타터 6종은 6개 스탯 각각 1개씩", () => {
    const stats = new Set(
      V2_STARTER_SKILL_IDS.map((id) => V2_SKILLS[id].stat),
    );
    expect(stats.size).toBe(6);
    expect(stats).toEqual(
      new Set(["str", "dex", "vit", "spd", "luk", "int"]),
    );
  });
});

describe("parseV2SkillsState", () => {
  it("undefined/null/string 등 비객체 → empty", () => {
    expect(parseV2SkillsState(undefined)).toEqual(emptyV2SkillsState());
    expect(parseV2SkillsState(null)).toEqual(emptyV2SkillsState());
    expect(parseV2SkillsState("garbage")).toEqual(emptyV2SkillsState());
  });

  it("valid id 만 남기고 unknown 거른다", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "unknown_id", "v2_skill_dash"],
      equipped: ["v2_skill_strike"],
    });
    expect(r.learned).toEqual(["v2_skill_strike", "v2_skill_dash"]);
    expect(r.equipped).toEqual(["v2_skill_strike"]);
  });

  it("중복 id 한 번만 보존", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "v2_skill_strike", "v2_skill_dash"],
      equipped: ["v2_skill_strike", "v2_skill_strike"],
    });
    expect(r.learned).toEqual(["v2_skill_strike", "v2_skill_dash"]);
    expect(r.equipped).toEqual(["v2_skill_strike"]);
  });

  it("learned 에 없는 id 는 equipped 에서 제거 (race 보정)", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike", "v2_skill_dash"],
    });
    expect(r.equipped).toEqual(["v2_skill_strike"]);
  });

  it("배운 생활 패시브가 저장된 장착 목록에서 빠져도 자동 장착한다", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "v2c_farmer_seedselection"],
      equipped: ["v2_skill_strike"],
    });

    expect(r.equipped).toEqual([
      "v2_skill_strike",
      "v2c_farmer_seedselection",
    ]);
  });

  it("equipped 순서 보존 (자동 발동 우선순위)", () => {
    const ids: V2SkillId[] = [
      "v2_skill_dash",
      "v2_skill_strike",
      "v2_skill_recover",
    ];
    const r = parseV2SkillsState({ learned: ids, equipped: ids });
    expect(r.equipped).toEqual(ids);
  });

  it("skillOrder 는 학습한 유효 id 만 표시 순서로 보존", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "v2_skill_dash", "v2_skill_recover"],
      equipped: ["v2_skill_strike"],
      skillOrder: [
        "v2_skill_dash",
        "unknown_id",
        "v2_skill_dash",
        "v2_skill_recover",
        "v2_skill_flurry",
      ],
    });
    expect(r.skillOrder).toEqual(["v2_skill_dash", "v2_skill_recover"]);
  });

  it("favoriteSkills 는 학습한 유효 id 만 즐겨찾기로 보존", () => {
    const r = parseV2SkillsState({
      learned: ["v2_skill_strike", "v2_skill_dash", "v2_skill_recover"],
      equipped: ["v2_skill_strike"],
      favoriteSkills: [
        "v2_skill_recover",
        "v2_skill_flurry",
        "v2_skill_recover",
        "unknown_id",
        "v2_skill_dash",
      ],
    });
    expect(r.favoriteSkills).toEqual(["v2_skill_recover", "v2_skill_dash"]);
  });

  it("orderedLearnedSkills 는 커스텀 순서 뒤에 누락 학습분을 붙인다", () => {
    const learned: V2SkillId[] = [
      "v2_skill_strike",
      "v2_skill_dash",
      "v2_skill_recover",
    ];
    expect(orderedLearnedSkills(learned, ["v2_skill_dash"])).toEqual([
      "v2_skill_dash",
      "v2_skill_strike",
      "v2_skill_recover",
    ]);
  });

  it("프리셋(C4) 라운드트립 — 검증 파싱 후 보존, 빈 라이브러리는 키 생략", () => {
    const withPresets = parseV2SkillsState({
      learned: ["v2_skill_strike"],
      equipped: ["v2_skill_strike"],
      presets: [
        {
          name: "보스용",
          pattern: {
            blocks: [
              { condition: { kind: "always" }, action: { kind: "skill", skillId: "v2_skill_strike" } },
            ],
          },
        },
      ],
    });
    expect(withPresets.presets).toHaveLength(1);
    expect(withPresets.presets?.[0].name).toBe("보스용");
    expect(withPresets.presets?.[0].pattern.blocks).toHaveLength(1);
    // 프리셋 없으면 키 자체 생략(하위호환).
    const none = parseV2SkillsState({ learned: [], equipped: [] });
    expect(none.presets).toBeUndefined();
  });
});

describe("스마트 기본 패턴 (유틸 스팸 방지)", () => {
  it("스킬 종류별 합리적 기본 조건", () => {
    // 공격(강타) → 항상.
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2_skill_strike)).toEqual({ kind: "always" });
    // 마나 회복(명상) → MP가 바닥날 때.
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_mage_meditate)).toEqual({
      kind: "self_mp", op: "below", pct: 20,
    });
    // 힐(기공 순환) → HP 낮을 때.
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_martial_chi)).toEqual({
      kind: "self_hp", op: "below", pct: 50,
    });
    // 보호막(마나 보호막) → HP가 내려갔고 기존 보호막이 없을 때.
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_mage_shield)).toEqual({
      kind: "all",
      conditions: [
        { kind: "self_hp", op: "below", pct: 70 },
        { kind: "self_shield", active: false },
      ],
    });
    // 회복+보호막 복합기 → 저HP이고 기존 보호막이 없을 때.
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_rescueexpert_rescue)).toEqual({
      kind: "all",
      conditions: [
        { kind: "self_hp", op: "below", pct: 50 },
        { kind: "self_shield", active: false },
      ],
    });
    // 스탯 버프(함성) → 그 버프 없을 때(재버프 낭비 방지).
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_warrior_warcry)).toEqual({
      kind: "self_buff", stat: "str", active: false,
    });
    // 파생버프(철포=받피감 selfBuffPct) → 그 버프 없을 때(만료 시 재시전·오프너 한계 해소).
    //   무인 재설계(2026-06-22): 철포가 수도승 monk_palm 으로 이전·steelguard 는 하급 권법(공격→항상).
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_monk_palm)).toEqual({
      kind: "self_buff_pct", target: "damageReduction", active: false,
    });
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_martial_steelguard)).toEqual({
      kind: "always",
    });
    // 지속 회복은 HP가 낮고 같은 상태 효과가 없을 때만 갱신한다.
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_eternal_cycle)).toEqual({
      kind: "all",
      conditions: [
        { kind: "self_hp", op: "below", pct: 60 },
        { kind: "self_buff_pct", target: "regen", active: false },
      ],
    });
    // 전투당 1회 보장 회피는 첫 턴에 사용하는 생존 오프너.
    expect(smartDefaultConditionForSkill(V2_SKILLS.v2c_shadow_shadowstep)).toEqual({
      kind: "turn", op: "atMost", value: 1,
    });
    expect(describeV2Skill(V2_SKILLS.v2c_shadow_shadowstep)).toContain(
      "다음 공격 1회 확정 회피",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_shadow_shadowstep)).toContain(
      "전투당 1회",
    );
  });

  it("명상은 기본 패턴에서 '항상' 이 아니다 (매 턴 발동 → 공격 안 함 버그 방지)", () => {
    const p = smartDefaultPatternFromEquipped(["v2c_mage_meditate", "v2_skill_strike"]);
    expect(p.blocks).toHaveLength(2);
    // 슬롯 순서(우선순위) 보존.
    expect(p.blocks[0].action).toEqual({ kind: "skill", skillId: "v2c_mage_meditate" });
    expect(p.blocks[1].action).toEqual({ kind: "skill", skillId: "v2_skill_strike" });
    // 명상은 조건부, 강타는 항상.
    expect(p.blocks[0].condition.kind).toBe("self_mp");
    expect(p.blocks[1].condition).toEqual({ kind: "always" });
  });

  it("그림자 도약은 장착 순서와 무관하게 기본 패턴의 첫 독립 행동이다", () => {
    const p = smartDefaultPatternFromEquipped([
      "v2c_shadow_assassinate",
      "v2c_shadow_shadowstep",
      "v2c_shadow_lethality3",
    ]);

    expect(p.blocks).toHaveLength(2);
    expect(p.blocks[0]).toEqual({
      condition: { kind: "turn", op: "atMost", value: 1 },
      action: { kind: "skill", skillId: "v2c_shadow_shadowstep" },
    });
    expect(p.blocks[1]).toEqual({
      condition: { kind: "always" },
      action: { kind: "skill", skillId: "v2c_shadow_assassinate" },
    });
  });

  it("순수 DoT 공격 스킬(출혈·중독)도 '항상' — 첫 턴만 발동하는 회귀 방지", () => {
    // dot 효과만 있고 직접 데미지 없는 공격기. damage 버킷에서 빠지면 opener(turn atMost 1)로
    //   잘못 분류돼 첫 턴 후 안 나간다(Codex BLOCK). dot 도 "적 피해"라 항상 발동.
    expect(smartDefaultConditionForSkill(V2_SKILLS.mob_rending_claw)).toEqual({ kind: "always" });
    expect(smartDefaultConditionForSkill(V2_SKILLS.mob_venom_bite)).toEqual({ kind: "always" });
  });

  it("카탈로그에 없는 id 는 안전하게 '항상'", () => {
    const p = smartDefaultPatternFromEquipped(["__nonexistent__"]);
    expect(p.blocks[0].condition).toEqual({ kind: "always" });
  });
});

describe("몬스터 상태이상 스킬 (PR-9)", () => {
  const MOB_SKILLS = [
    "mob_venom_bite",
    "mob_chilling_touch",
    "mob_rending_claw",
  ] as const;

  it("3종 monsterOnly + learn 없음(플레이어 미학습) + mpCost 0", () => {
    for (const id of MOB_SKILLS) {
      const s = V2_SKILLS[id];
      expect(s.monsterOnly, `${id} monsterOnly`).toBe(true);
      expect(s.learn, `${id} learn`).toBeUndefined();
      expect(s.mpCost, `${id} mp`).toBe(0);
      // 순수 상태이상 — damage effect 없음, dot/enemyDebuff 만.
      for (const e of s.effects) {
        expect(["dot", "enemyDebuff"]).toContain(e.kind);
      }
    }
  });

  it("스타터/플레이어 학습 목록에 안 섞임 (UI 누출 방지)", () => {
    for (const id of MOB_SKILLS) {
      expect(V2_STARTER_SKILL_IDS).not.toContain(id);
    }
    // 플레이어 학습 가능 스킬(learn 보유)에 monsterOnly 가 하나도 없어야.
    for (const s of Object.values(V2_SKILLS)) {
      if (s.monsterOnly) expect(s.learn).toBeUndefined();
    }
  });
});

describe("스킬 속성 전면 태깅", () => {
  it("원소 풀 스킬은 element 보유 / 그 외는 미부여 허용(캐릭터 속성 상속)", () => {
    // 스킬 재설계 — 공용/전문화 스킬은 의도적 elementless: 시전 시 캐릭터가 고른 속성 상속
    // (def.element ?? characterElement). "화염구"도 void 마법사가 쓰면 void 상성.
    // 원소 풀(v2_skill_elem_*)만 속성이 정체성이라 반드시 태깅(회귀 가드).
    for (const s of Object.values(V2_SKILLS)) {
      if (s.monsterOnly) continue;
      if (s.id.startsWith("v2_skill_elem_")) {
        expect(s.element, `${s.id} 원소 스킬인데 element 없음`).toBeTruthy();
      }
    }
  });

  it("힐/버프 전용 스킬엔 element 불필요 (데미지 없으면 미부여 허용)", () => {
    // 회복(v2_skill_recover) 은 데미지 없음 → element 없어도 됨.
    expect(V2_SKILLS.v2_skill_recover.effects.some((e) => e.kind === "damage")).toBe(false);
  });
});

describe("describeV2Skill — 상세 옵션 칩", () => {
  it("모든 스킬에서 예외 없이 문자열 배열 반환 + 'undefined' 미포함", () => {
    for (const def of Object.values(V2_SKILLS)) {
      const chips = describeV2Skill(def);
      expect(Array.isArray(chips)).toBe(true);
      for (const c of chips) {
        expect(typeof c).toBe("string");
        // 스탯 라벨 누락 등으로 칩에 "undefined" 가 새지 않아야(방어).
        expect(c.includes("undefined"), `${def.id}: ${c}`).toBe(false);
      }
    }
  });

  it("광전 계열 패시브는 기존 잃은 HP 비례 공격력 칩을 제거한다", () => {
    for (const id of [
      "v2c_berserker_madness3",
      "v2c_warlord_slaughter",
      "v2c_overlord_throne",
      "v2c_hegemon_dominion",
    ] as const) {
      expect(
        describeV2Skill(V2_SKILLS[id]).some((chip) =>
          chip.includes("잃은 HP 1%당 공격력"),
        ),
        id,
      ).toBe(false);
    }
  });

  it("혈전 툴팁은 정확한 피해 공식과 혈전 준비 획득을 함께 설명한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_warlord_bloodbath)).toEqual([
      "명중 시 현재 HP 15% 소모 (소모 후 HP로 피해 계산)",
      "기본 피해 공격력×1.1 + 힘×1.2",
      "잃은 HP 1%당 피해 +0.7% (최대 ×1.7 · 대련 추가분 60%)",
      "명중 시 혈전 준비 획득",
      "발동 50%",
      "MP 76",
    ]);
  });

  it("멸왕일도 툴팁은 혈전과 사망 극복 효과를 조건별로 설명한다", () => {
    const skill = V2_SKILLS.v2c_hegemon_annihilation;

    expect(skill.description).toBe(
      "잃은 HP가 많을수록 강해지는 패황의 최종 일격. 혈전과 사망 극복으로 더욱 강해진다.",
    );
    expect(describeV2Skill(skill)).toEqual([
      "기본 피해 공격력×2 + 힘×2.4",
      "잃은 HP 1%당 피해 +2% (최대 ×3 · 대련 추가분 60%)",
      "혈전 준비 시 광폭 계수 +25% · 확정 치명타",
      "사망 극복 시 1회 재충전 (전투당 최대 2회)",
      "사망 극복 발동 시: 잃은 HP 100% 취급 · 광폭 계수 ×1.5",
      "발동 40%",
      "MP 76",
      "전투당 1회",
    ]);
  });

  it("패황의 지배 툴팁은 계승 효과와 사망 극복 규칙을 수치로 설명한다", () => {
    const skill = V2_SKILLS.v2c_hegemon_dominion;

    expect(skill.description).toBe(
      "광기 계열의 모든 하위 효과를 계승한다. 치명 피해를 한 번 극복한 뒤 다음 공격을 강화하고 멸왕일도를 재충전한다.",
    );
    expect(describeV2Skill(skill)).toEqual([
      "HP 50% 이하: 공격 액티브 발동률 +10%p",
      "혈전 준비로 강화된 파멸일격·멸왕일도: 치명타 피해 +30%",
      "사망 극복: 전투당 1회 치명 피해 무효 · HP 40%로 회복",
      "사망 극복 발생 시: 다음 내 공격 종료까지 HP 40% 아래로 내려가지 않음",
      "사망 극복 발생 시: 다음 공격 액티브 스킬 100% 발동 · 잃은 HP 100% 취급 · 광폭 계수 ×1.5",
      "사망 극복 발생 시: 멸왕일도 1회 재충전",
      "광기 계열 중 1개만 장착",
    ]);
  });

  it("공격 스킬은 피해 배율 칩 + 속성 칩(무속성 제외)을 포함", () => {
    const chips = describeV2Skill(V2_SKILLS.v2_skill_strike); // 강타: 대지, coef 1.0
    expect(chips.some((c) => c.includes("공격력×1"))).toBe(true);
    expect(chips).toContain("속성 대지");
  });

  it("피해 계수는 공격 기반선과 특화 스탯을 구분해 명시한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_mage_boltcast)).toContain(
      "피해 마법 공격력×1.05 + 지능×0.4",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_shieldman_bash)).toContain(
      "피해 공격력×1.05 + 방어력×1.67",
    );
  });

  it("6차 순수형과 혼합형 모두 직접 스탯 계수 상향을 표시한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_swordsaint_flash)).toContain(
      "피해 공격력×1.3 + 힘×1.5",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_archmage_collapse)).toContain(
      "피해 마법 공격력×1.68 + 지능×1.27",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_heavenlybow_orbit)).toEqual(
      expect.arrayContaining([
        "피해 공격력×0.4 + 민첩×0.58",
        "피해 공격력×0.4 + 민첩×0.71",
      ]),
    );
  });

  it("다단 스킬의 공격 계수는 소수 둘째 자리까지 반올림해 표시한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_warrior_flurry)).toContain(
      "피해 공격력×0.36 + 힘×0.19",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_ranger_ambush)).toContain(
      "피해 공격력×0.4 + 민첩×0.12",
    );

    for (const skill of Object.values(V2_SKILLS)) {
      for (const chip of describeV2Skill(skill)) {
        expect(chip, `${skill.id}: ${chip}`).not.toMatch(/\d\.\d{3,}/);
      }
    }
  });

  it("다단 스킬은 툴팁 첫 칩에 기본 공격 횟수를 명시한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_nightshade_eclipse)[0]).toBe(
      "2회 공격",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_heavenlybow_orbit)[0]).toBe(
      "3회 공격",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_mage_boltcast)).not.toContain(
      "1회 공격",
    );
  });

  it("월식 설명은 두 타격과 각 HP 조건을 구분한다", () => {
    expect(V2_SKILLS.v2c_nightshade_eclipse.description).toBe(
      "두 번 연속 공격한다. 1타는 적 HP 90% 이상일 때 PvE 5배·PvP 4배, 2타는 35% 이하일 때 3배 피해를 준다.",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_nightshade_eclipse)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("적 HP 90%↑ 시 PvE ×5 · PvP ×4"),
        expect.stringContaining("적 HP 35%↓ 시 ×3"),
      ]),
    );
  });

  it("발동률 상향 보정이 DEX·LUK 특화 계수를 이중으로 낮추지 않는다", () => {
    const directStatCoefs = (id: keyof typeof V2_SKILLS) =>
      V2_SKILLS[id].effects.flatMap((effect) =>
        "statCoef" in effect &&
        (effect.scaling === "dex" || effect.scaling === "luk")
          ? [effect.statCoef]
          : [],
      );

    expect(directStatCoefs("v2c_assassin_ambush")).toEqual([0.2]);
    expect(directStatCoefs("v2c_ranger_ambush")).toEqual([0.1, 0.1, 0.1]);
    expect(directStatCoefs("v2c_shadow_assassinate")).toEqual([0.22]);
    expect(directStatCoefs("v2c_chief_strike")).toEqual([0.35]);
    expect(directStatCoefs("v2c_phantom_ambush")).toEqual([0.14]);
    expect(directStatCoefs("v2c_marksman_shot")).toEqual([0.42, 0.42]);
    expect(directStatCoefs("v2c_nightshade_eclipse")).toEqual([0.22, 0.26]);
    expect(directStatCoefs("v2c_heavenlybow_orbit")).toEqual([0.5, 0.5, 0.62]);
    expect(directStatCoefs("v2c_blackmoon_flurry")).toEqual([0.55, 0.46, 0.62]);

    // 일반 마법 계수는 기존 차수별 발동률 보정을 계속 받는다.
    expect(V2_SKILLS.v2c_sage_bolt.effects[0]).toMatchObject({
      statCoef: 1.55,
      scaling: "magic",
    });
  });

  it("차수 흐름 위에 직업별 발동 템포 차이를 둔다", () => {
    const representatives = [
      ["v2c_warrior_strike", 75],
      ["v2c_shieldman_bash", 70],
      ["v2c_paladin_cleave", 65],
      ["v2c_veteran_cleave", 54],
      ["v2c_swordmaster_cut", 51],
      ["v2c_fortressknight_ram", 48],
    ] as const;

    expect(representatives.map(([id]) => V2_SKILLS[id].procChance)).toEqual(
      representatives.map(([, procChance]) => procChance),
    );
    expect(
      describeV2Skill(V2_SKILLS.v2c_warrior_strike).some((chip) =>
        chip.includes("공격력×1.08 + 힘×0.58"),
      ),
    ).toBe(true);
    expect(
      describeV2Skill(V2_SKILLS.v2c_fortressknight_ram).some((chip) =>
        chip.includes("공격력×1.2 + 방어력×2.36"),
      ),
    ).toBe(true);

    // 같은 2차라도 직업 성향과 개별 스킬 성향이 합쳐져 발동률이 다르다.
    expect([
      V2_SKILLS.v2c_caster_bolt.procChance,
      V2_SKILLS.v2c_squire_cleave.procChance,
      V2_SKILLS.v2c_shieldman_bash.procChance,
      V2_SKILLS.v2c_boxer_combo.procChance,
    ]).toEqual([63, 68, 70, 74]);
    // 6차도 한 방형·균형형·제어형·연타형이 40~51%로 갈린다.
    expect([
      V2_SKILLS.v2c_archmage_collapse.procChance,
      V2_SKILLS.v2c_absolute_unity.procChance,
      V2_SKILLS.v2c_fortressknight_ram.procChance,
      V2_SKILLS.v2c_heavenlybow_orbit.procChance,
    ]).toEqual([40, 45, 48, 51]);

    // 같은 견습 병사 안에서도 일반기·연타기·제어기가 별도 메타데이터를 가진다.
    expect([
      [V2_SKILLS.v2c_warrior_strike.tempo, V2_SKILLS.v2c_warrior_strike.procChance],
      [V2_SKILLS.v2c_warrior_flurry.tempo, V2_SKILLS.v2c_warrior_flurry.procChance],
      [V2_SKILLS.v2c_warrior_sunder.tempo, V2_SKILLS.v2c_warrior_sunder.procChance],
    ]).toEqual([
      ["balanced", 75],
      ["rapid", 77],
      ["control", 76],
    ]);
  });

  it("디버프 스킬은 적 스탯 감소 칩 + MP 칩", () => {
    // 파쇄 = 병사 계열(×1.0) tier 2 → 기준풀 600 × 7% × 1.4 = 58.8 → "MP 59".
    const chips = describeV2Skill(V2_SKILLS.v2c_warrior_sunder);
    expect(chips.some((c) => c.startsWith("적 활력 −"))).toBe(true);
    expect(chips).toContain("MP 59");
  });

  it("액티브 스킬은 100% 발동도 확률 칩으로 표시", () => {
    const chips = describeV2Skill(V2_SKILLS.v2c_ironknight_guard);
    expect(chips).toContain("발동 100%");
    expect(chips).toContain(
      "철벽 반사 3회 · 받는 피해 -30% · 방어력의 180% 반사",
    );
  });

  it("회복 스킬은 계수·피해량 회복·전투당 1회를 표시한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_acolyte_smite)).toContain(
      "회복 잃은 체력 6% + 마법 공격력×0.5 +50~50 (회복량 보정 적용)",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_darkpriest_reap)).toContain(
      "피해량 14% 회복 (회복량 보정 미적용)",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_blooddemon_reign)).toContain(
      "피해량 20% 회복 (회복량 보정 미적용)",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_survivor_firstaid)).toContain(
      "회복 잃은 체력 20% (회복량 보정 적용)",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_survivor_firstaid)).toContain(
      "전투당 1회",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_survivor_firstaid)).toContain(
      "원정당 1회 · 대련 효과 50%",
    );
  });

  it("혈성기사 계보 HP 소모기는 저체력 추가 피해 기준 하한을 표시한다", () => {
    for (const id of [
      "v2c_bloodtemplar_stigma",
      "v2c_bloodlord_brand",
      "v2c_blooddemon_reign",
    ] as const) {
      expect(describeV2Skill(V2_SKILLS[id])).toEqual(
        expect.arrayContaining([
          expect.stringContaining("추가 피해 기준 현재 HP 최소 50%"),
        ]),
      );
    }
  });

  it("원정 제한 회복기 목록은 무자원·전투당 1회 회복기만 포함한다", () => {
    for (const skillId of LIMITED_RECOVERY_SKILL_IDS) {
      const skill = V2_SKILLS[skillId];
      expect(skill.mpCost, skillId).toBe(0);
      expect(skill.oncePerBattle, skillId).toBe(true);
      expect(
        skill.effects.some((effect) => effect.kind === "heal"),
        skillId,
      ).toBe(true);
    }
  });

  it("DoT/쿨다운 — 몹 독니는 지속피해 + 쿨 칩", () => {
    const chips = describeV2Skill(V2_SKILLS.mob_venom_bite);
    expect(chips.some((c) => c.includes("중독") && c.includes("지속피해"))).toBe(
      true,
    );
    expect(chips).toContain("쿨 3행동");
  });

  it("독 계열 복합기의 계수 피해를 중독 스택보다 먼저 표시한다", () => {
    const poisonComboIds = [
      "v2c_venomist_toxiccloud",
      "v2c_venomancer_miasma",
      "v2c_venomlord_plague",
      "v2c_plaguebringer_outbreak",
      "v2c_myriadvenom_mutation",
    ] as const;

    for (const id of poisonComboIds) {
      const chips = describeV2Skill(V2_SKILLS[id]);
      const damageIndex = chips.findIndex((chip) => chip.startsWith("피해 "));
      const poisonIndex = chips.findIndex((chip) =>
        chip.startsWith("중독 지속피해"),
      );

      expect(damageIndex, `${id}: 계수 피해`).toBeGreaterThanOrEqual(0);
      expect(poisonIndex, `${id}: 중독 스택`).toBeGreaterThan(damageIndex);
    }
  });

  it("MP 0·무속성이면 MP·속성 칩 없음", () => {
    // 몹 독니(카탈로그 mpCost 0, element 없음, 인자 미전달) → MP·속성 칩 모두 없음.
    const chips = describeV2Skill(V2_SKILLS.mob_venom_bite);
    expect(chips.some((c) => c.startsWith("MP"))).toBe(false);
    expect(chips.some((c) => c.startsWith("속성"))).toBe(false);
  });

  it("MP 칩 = 고정 절대값 — 계열 차등 + 차수 스케일", () => {
    // fixedMpCost 가 있으면 절대값을 우선 사용하고, 없으면 기존 공식 비용을 사용한다.
    expect(describeV2Skill(V2_SKILLS.v2c_mage_fireball)).toContain("MP 90"); // 고비용 주문
    expect(describeV2Skill(V2_SKILLS.v2c_warrior_strike)).toContain("MP 42"); // 병사 t1
    // 같은 병사 계열에서 차수 스케일 t1(42) < t2(600×7%×1.4=58.8→59):
    expect(describeV2Skill(V2_SKILLS.v2c_warrior_sunder)).toContain("MP 59");
    // 같은 t2 에서 도적(×0.7·41) < 병사(59) — 계열 차등 재확인:
    expect(describeV2Skill(V2_SKILLS.v2c_assassin_ambush)).toContain("MP 41");
    expect(describeV2Skill(V2_SKILLS.v2c_mage_boltcast)).not.toContain("MP 40");
  });
});

describe("spCostOf — SP 로드아웃 코스트 (코어루프)", () => {
  it("명시 할인은 루브릭 산정 뒤 정수만 적용하고 최소 1 SP를 보장한다", () => {
    const strike = V2_SKILLS.v2_skill_strike;
    const oneCost = V2_SKILLS.v2c_none_diligence;

    expect(spCostOf({ ...strike, spCostDiscount: 1 })).toBe(3);
    expect(spCostOf({ ...strike, spCostDiscount: -5 })).toBe(4);
    expect(spCostOf({ ...strike, spCostDiscount: 0.9 })).toBe(4);
    expect(spCostOf({ ...oneCost, spCostDiscount: 99 })).toBe(1);
  });

  it("광전사–패황 계보는 단발 필살 역할과 광기 배타 단계를 데이터로 선언한다", () => {
    expect(V2_SKILLS.v2c_berserker_bloodslash.effects).toEqual([
      {
        kind: "missingHpDamage",
        attackCoef: 1,
        statCoef: 1,
        missingHpCoef: 0.4,
        selfCurrentHpCostPct: 10,
        scaling: "physical",
      },
    ]);
    expect(V2_SKILLS.v2c_warlord_bloodbath.effects).toEqual([
      {
        kind: "missingHpDamage",
        attackCoef: 1.1,
        statCoef: 1.2,
        missingHpCoef: 0.7,
        selfCurrentHpCostPct: 15,
        scaling: "physical",
      },
    ]);
    expect(V2_SKILLS.v2c_overlord_ruin).toMatchObject({
      name: "파멸일격",
      effects: [
        {
          kind: "missingHpDamage",
          attackCoef: 1.5,
          statCoef: 1.8,
          missingHpCoef: 1.4,
          scaling: "physical",
        },
      ],
    });
    expect(V2_SKILLS.v2c_hegemon_annihilation).toMatchObject({
      name: "멸왕일도",
      oncePerBattle: true,
      effects: [
        {
          kind: "missingHpDamage",
          attackCoef: 2,
          statCoef: 2.4,
          missingHpCoef: 2,
          scaling: "physical",
        },
      ],
    });
    expect(V2_SKILLS.v2c_berserker_bloodslash.defaultPattern).toEqual({
      priority: 100,
      condition: { kind: "self_hp", op: "above", pct: 70 },
    });
    expect(V2_SKILLS.v2c_warlord_bloodbath.defaultPattern).toEqual({
      priority: 200,
      condition: {
        kind: "all",
        conditions: [
          { kind: "self_hp", op: "below", pct: 70 },
          { kind: "self_buff_pct", target: "berserkerFinisher", active: false },
        ],
      },
    });
    expect(V2_SKILLS.v2c_overlord_ruin.defaultPattern).toEqual({
      priority: 300,
      condition: {
        kind: "all",
        conditions: [
          { kind: "self_hp", op: "below", pct: 50 },
          { kind: "self_buff_pct", target: "berserkerFinisher", active: true },
        ],
      },
    });
    expect(V2_SKILLS.v2c_hegemon_annihilation.defaultPattern).toEqual({
      priority: 400,
      condition: {
        kind: "any",
        conditions: [
          { kind: "self_buff_pct", target: "berserkerDeathOvercome", active: true },
          { kind: "self_hp", op: "below", pct: 25 },
        ],
      },
    });

    expect(V2_SKILLS.v2c_overlord_ruin.effects).toHaveLength(1);
    expect(V2_SKILLS.v2c_hegemon_annihilation.effects).toHaveLength(1);
    expect(V2_SKILLS.v2c_overlord_throne.passive).toEqual({});
    expect(V2_SKILLS.v2c_hegemon_dominion.passive).toEqual({});

    const madnessRanks = [
      ["v2c_berserker_madness3", 1],
      ["v2c_warlord_slaughter", 2],
      ["v2c_overlord_throne", 3],
      ["v2c_hegemon_dominion", 4],
    ] as const;
    for (const [skillId, exclusiveRank] of madnessRanks) {
      expect(V2_SKILLS[skillId]).toMatchObject({
        exclusiveGroup: "berserker_madness",
        exclusiveRank,
      });
    }

    expect(spCostOf(V2_SKILLS.v2c_berserker_bloodslash)).toBe(6);
    expect(spCostOf(V2_SKILLS.v2c_warlord_bloodbath)).toBe(7);
    expect(spCostOf(V2_SKILLS.v2c_overlord_ruin)).toBe(10);
    expect(spCostOf(V2_SKILLS.v2c_hegemon_annihilation)).toBe(13);
    expect(spCostOf(V2_SKILLS.v2c_berserker_madness3)).toBe(5);
    expect(spCostOf(V2_SKILLS.v2c_warlord_slaughter)).toBe(7);
    expect(spCostOf(V2_SKILLS.v2c_overlord_throne)).toBe(14);
    expect(spCostOf(V2_SKILLS.v2c_hegemon_dominion)).toBe(15);
    expect(spCostOf(V2_SKILLS.v2c_archmage_theory)).toBe(15);
    expect(
      describeV2Skill(V2_SKILLS.v2c_hegemon_dominion).join(" "),
    ).not.toContain("받는 반사 피해");
    expect(
      describeV2Skill(V2_SKILLS.v2c_archmage_theory).join(" "),
    ).not.toContain("받는 반사 피해");
    expect(
      [
        "v2c_berserker_bloodslash",
        "v2c_warlord_bloodbath",
        "v2c_overlord_ruin",
        "v2c_hegemon_annihilation",
      ].map((skillId) => ({
        mp: v2SkillMpCostValue(V2_SKILLS[skillId as V2SkillId]),
        proc: V2_SKILLS[skillId as V2SkillId].procChance,
      })),
    ).toEqual([
      { mp: 76, proc: 56 },
      { mp: 76, proc: 50 },
      { mp: 76, proc: 44 },
      { mp: 76, proc: 40 },
    ]);
    expect(
      [
        "v2c_berserker_bloodslash",
        "v2c_warlord_bloodbath",
        "v2c_overlord_ruin",
        "v2c_hegemon_annihilation",
        "v2c_hegemon_dominion",
      ].reduce(
        (sum, skillId) =>
          sum + spCostOf(V2_SKILLS[skillId as V2SkillId]),
        0,
      ),
    ).toBe(51);
  });

  it("코스트는 성능(power)에 비례 — 강타 스타터(dmg 1.0)=4", () => {
    // 강타(attack, dmg 1.0·proc100) = 루브릭 4. 차수가 아니라 effects power 로 도출.
    expect(spCostOf(V2_SKILLS.v2_skill_strike)).toBe(4);
  });

  it("약한 유틸은 싸다 — 회복 스타터=3, 함성=2", () => {
    // 회복(heal 1회) = 3, 함성(짧은 버프) = 2 — 강타(4)보다 싼 예산 옵션.
    expect(spCostOf(V2_SKILLS.v2_skill_recover)).toBe(3);
    expect(spCostOf(V2_SKILLS.v2c_warrior_warcry)).toBe(2);
  });

  it("단계형 근력과 필살은 효과가 오를 때 SP도 함께 오른다", () => {
    expect(
      [
        "v2c_warrior_might",
        "v2c_squire_might",
        "v2c_sensei_ironbody",
      ].map((id) => spCostOf(V2_SKILLS[id as V2SkillId])),
    ).toEqual([2, 3, 4]);
    expect(spCostOf(V2_SKILLS.v2c_shadow_lethality3)).toBe(4); // 치명타 피해 +25%
    expect(spCostOf(V2_SKILLS.v2c_veteran_lethal)).toBe(5); // 치명타 피해 +30%
  });

  it("치명타 피해는 회피보다 비싸게, 회피 단계는 완만하게 책정한다", () => {
    expect(spCostOf(V2_SKILLS.v2c_shadow_lethality3)).toBe(4); // 치명타 피해 +25%
    expect(spCostOf(V2_SKILLS.v2c_veteran_lethal)).toBe(5); // 치명타 피해 +30%
    expect(spCostOf(V2_SKILLS.v2c_boxer_fortitude)).toBe(2); // 회피도 +8%
    expect(spCostOf(V2_SKILLS.v2c_brawler_fortitude3)).toBe(3); // 회피 +12%
    expect(spCostOf(V2_SKILLS.v2c_phantom_stealth)).toBe(3); // 회피도 +16%
  });

  it("조건부 대항축인 명중과 속도 전환을 성능에 맞게 SP로 청구한다", () => {
    expect(V2_SKILLS.v2c_chief_afterimage.passive?.accuracyPct).toBe(30);
    expect(spCostOf(V2_SKILLS.v2c_chief_afterimage)).toBe(3);
    expect(V2_SKILLS.v2c_marksman_aim.passive?.accuracyPct).toBe(24);
    expect(V2_SKILLS.v2c_marksman_aim.passive?.spdToAtkMaxPct).toBeUndefined();
    expect(spCostOf(V2_SKILLS.v2c_marksman_aim)).toBe(5);
    expect(V2_SKILLS.v2c_heavenlybow_starpath.passive?.accuracyPct).toBe(30);
    expect(V2_SKILLS.v2c_heavenlybow_starpath.passive?.skillCritDmgPct).toBe(30);
    expect(V2_SKILLS.v2c_heavenlybow_starpath.passive?.spdToAtkMaxPct).toBe(30);
    expect(V2_SKILLS.v2c_heavenlybow_starpath.passive?.skillCritOverflow).toBeUndefined();
    expect(spCostOf(V2_SKILLS.v2c_heavenlybow_starpath)).toBe(14);
  });

  it("속도 비례 공격력 전환은 검 계보가 아니라 6차 천궁에만 있다", () => {
    const sword = aggregateEquippedPassives([
      "v2c_swordmaster_focus",
      "v2c_swordsaint_transcendence",
    ]);
    const bow = aggregateEquippedPassives([
      "v2c_marksman_aim",
      "v2c_heavenlybow_starpath",
    ]);

    expect(sword.spdToAtkMaxPct).toBe(0);
    expect(bow.spdToAtkMaxPct).toBe(30);
  });

  it("일검필살은 방어 효과 없이 검성의 공격 능력을 모두 강화한다", () => {
    const skill = V2_SKILLS.v2c_swordsaint_transcendence;
    const passive = aggregateEquippedPassives([skill.id]);

    expect(skill.name).toBe("일검필살");
    expect(skill.passive?.statPct).toEqual({ str: 24 });
    expect(skill.passive?.critDmgPct).toBe(35);
    expect(passive.singleHitPhysicalSkillDamagePct).toBe(30);
    expect(passive.accuracyPct).toBe(15);
    expect(passive).not.toHaveProperty("reflectDamageTakenReductionPct");
    expect(spCostOf(skill)).toBe(15);
    expect(describeV2Skill(skill)).toContain("단일 타격 물리 스킬 피해 +30%");
  });

  it("성도 조준은 흑월의 치명 오버플로 대신 고정 스킬 치명 피해를 제공한다", () => {
    const passive = aggregateEquippedPassives(["v2c_heavenlybow_starpath"]);
    expect(passive.skillCritDmgPct).toBe(30);
    expect(passive.skillCritOverflow).toBe(false);
    expect(describeV2Skill(V2_SKILLS.v2c_heavenlybow_starpath)).toContain(
      "스킬 치명타 피해 +30%",
    );
  });

  it("액티브 효율 보정 — 높은 발동률·낮은 MP 비용일수록 같은 효과의 SP가 높다", () => {
    const base = V2_SKILLS.v2_skill_strike;
    const lowProc = { ...base, procChance: 30 };
    const highProc = { ...base, procChance: 100 };
    const strong = {
      ...base,
      effects: [{ kind: "damage" as const, statCoef: 3, baseFlat: 0 }],
    };
    const free = { ...strong, mpCost: 0 };
    const expensive = { ...strong, fixedMpCost: 180 };

    expect(rubricSpCost(highProc)).toBeGreaterThan(rubricSpCost(lowProc));
    expect(rubricSpCost(free)).toBeGreaterThan(rubricSpCost(strong));
    expect(rubricSpCost(expensive)).toBeLessThan(rubricSpCost(strong));
  });

  it("명시 spCost override 는 루브릭 위로만(max) 적용", () => {
    // 강타 루브릭 = 4. override 7 > 4 → 7. override 0/소수는 무시→루브릭. 5.9→floor 5(>4).
    expect(spCostOf({ ...V2_SKILLS.v2_skill_strike, spCost: 7 })).toBe(7);
    expect(spCostOf({ ...V2_SKILLS.v2_skill_strike, spCost: 0 })).toBe(4);
    expect(spCostOf({ ...V2_SKILLS.v2_skill_strike, spCost: 5.9 })).toBe(5);
  });

  it("생활 스킬은 SP 0, 나머지 스킬은 SP 1 이상이다", () => {
    for (const def of Object.values(V2_SKILLS)) {
      const c = spCostOf(def);
      expect(Number.isFinite(c), def.id).toBe(true);
      if (isLifestyleSkill(def)) {
        expect(c, def.id).toBe(0);
      } else {
        expect(c, def.id).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("농사·낚시·요리·벌목·채광·훈련 효과를 생활 스킬로 자동 분류한다", () => {
    const lifestyleIds: V2SkillId[] = [
      "v2c_survivor_baitcraft",
      "v2c_healthtrainer_routine",
      "v2c_farmer_seedselection",
      "v2c_cook_prepwork",
      "v2c_lumberjack_woodreading",
      "v2c_miner_veinreading",
    ];
    for (const id of lifestyleIds) {
      expect(isLifestyleSkill(V2_SKILLS[id]), id).toBe(true);
      expect(spCostOf(V2_SKILLS[id]), id).toBe(0);
    }
    expect(isLifestyleSkill(V2_SKILLS.v2_skill_strike)).toBe(false);
    expect(isLifestyleSkill(V2_SKILLS.v2c_none_diligence)).toBe(false);
  });

  it("저비용·1~4차 압축은 유지하고 5·6차 고성능 스킬은 원시 비용을 쓴다", () => {
    expect(spCostOf(V2_SKILLS.v2_skill_strike)).toBe(4);
    expect(spCostOf(V2_SKILLS.v2c_absolute_unity)).toBe(8);
    expect(spCostOf(V2_SKILLS.v2c_celestialdragon_combo)).toBe(11);
    expect(
      Math.max(...Object.values(V2_SKILLS).map((def) => spCostOf(def))),
    ).toBe(19);
  });

  it("5·6차만 고가 SP 압축을 제거하고 1~4차·조합형 상한은 유지한다", () => {
    expect(spCostOf(V2_SKILLS.v2c_spellsealer_greatward)).toBe(10);
    expect(spCostOf(V2_SKILLS.v2c_elementallord_surge)).toBe(16);
    expect(spCostOf(V2_SKILLS.v2c_blackmoon_dominion)).toBe(17);
    expect(spCostOf(V2_SKILLS.v2c_hegemon_dominion)).toBe(15);
    expect(spCostOf(V2_SKILLS.v2c_primordialmage_return)).toBe(16);
    expect(spCostOf(V2_SKILLS.v2c_primordialmage_amplification)).toBe(9);
  });

  it("🔑 트립와이어 — 자원·발동률까지 우월한 스킬이 더 싸지는 가격 역전을 막는다", () => {
    expect(spCostOf(V2_SKILLS.v2c_ranger_ambush)).toBeGreaterThanOrEqual(
      spCostOf(V2_SKILLS.v2c_warrior_flurry),
    );
    expect(spCostOf(V2_SKILLS.v2c_mage_boltcast)).toBeGreaterThan(
      spCostOf(V2_SKILLS.v2c_caster_bolt),
    );
    expect(spCostOf(V2_SKILLS.v2c_warder_barrier)).toBeLessThan(
      spCostOf(V2_SKILLS.v2c_ironman_brace),
    );
    expect(spCostOf(V2_SKILLS.v2c_mage_meditate)).toBe(2);
  });

  it("다단기는 전투에서 제거된 legacy 고정 피해를 타수만큼 SP로 중복 청구하지 않는다", () => {
    expect([
      spCostOf(V2_SKILLS.v2c_marksman_shot),
      spCostOf(V2_SKILLS.v2c_nightshade_eclipse),
      spCostOf(V2_SKILLS.v2c_heavenlybow_orbit),
      spCostOf(V2_SKILLS.v2c_blackmoon_flurry),
    ]).toEqual([5, 10, 10, 12]);
  });

  it("플레이어 피해에서 사용하지 않는 legacy 고정 피해는 SP를 올리지 않는다", () => {
    const base = V2_SKILLS.v2_skill_strike;
    const zeroFlat = {
      ...base,
      effects: [{ kind: "damage" as const, statCoef: 1, baseFlat: 0 }],
    };
    const ghostFlat = {
      ...zeroFlat,
      effects: [{ kind: "damage" as const, statCoef: 1, baseFlat: 999_999 }],
    };

    expect(skillPowerScore(ghostFlat)).toBe(skillPowerScore(zeroFlat));
    expect(rubricSpCost(ghostFlat)).toBe(rubricSpCost(zeroFlat));
  });

  it("몬스터 고정 피해는 실제 전투에서 쓰이므로 SP power에도 남긴다", () => {
    const base = {
      ...V2_SKILLS.v2_skill_strike,
      monsterOnly: true,
      effects: [{ kind: "damage" as const, statCoef: 1, baseFlat: 0 }],
    };
    const stronger = {
      ...base,
      effects: [{ kind: "damage" as const, statCoef: 1, baseFlat: 280 }],
    };

    expect(skillPowerScore(stronger)).toBeGreaterThan(skillPowerScore(base));
  });

  it("보호막 turns는 만료되지 않는 엔진 동작에 맞춰 과금하지 않는다", () => {
    const base = V2_SKILLS.v2c_warder_barrier;
    const short = {
      ...base,
      effects: [{ kind: "shield" as const, pctMaxHp: 8, turns: 1 }],
    };
    const long = {
      ...base,
      effects: [{ kind: "shield" as const, pctMaxHp: 8, turns: 99 }],
    };
    const larger = {
      ...base,
      effects: [{ kind: "shield" as const, pctMaxHp: 16, turns: 1 }],
    };

    expect(skillPowerScore(long)).toBe(skillPowerScore(short));
    expect(skillPowerScore(larger)).toBeGreaterThan(skillPowerScore(short));
  });

  it("관통 피해와 누락됐던 고유 패시브는 SP power에 반영한다", () => {
    const attack = V2_SKILLS.v2c_chief_strike;
    const withoutPierce = {
      ...attack,
      effects: attack.effects.map((effect) =>
        effect.kind === "damage"
          ? { ...effect, pierceDamagePct: 0 }
          : effect,
      ),
    };
    const blackmoon = V2_SKILLS.v2c_blackmoon_dominion;
    const withoutHooks = {
      ...blackmoon,
      passive: {
        ...blackmoon.passive,
        atkPerLukCoef: 0,
        spdPerLukCoef: 0,
        skillCritOverflow: false,
        skillCritAfterEvade: false,
      },
    };

    expect(skillPowerScore(attack)).toBeGreaterThan(
      skillPowerScore(withoutPierce),
    );
    expect(skillPowerScore(blackmoon)).toBeGreaterThan(
      skillPowerScore(withoutHooks),
    );
  });

  it("초반 마법 피해 감소의 지속 구간과 마법취약 발동률을 반영한다", () => {
    const ward = V2_SKILLS.v2c_warder_ward;
    const shortWard = {
      ...ward,
      passive: { ...ward.passive, openingMagicDamageReductionPhases: 1 },
    };
    const omen = V2_SKILLS.v2c_shaman_omen3;
    const lowChance = {
      ...omen,
      passive: { ...omen.passive, enemyMagicVulnApplyChancePct: 50 },
    };

    expect(skillPowerScore(ward)).toBeGreaterThan(skillPowerScore(shortWard));
    expect(skillPowerScore(omen)).toBeGreaterThan(skillPowerScore(lowChance));
  });

  it("선행 스킬이 필요한 장착 시너지는 본체에 추가 효과의 절반만 청구한다", () => {
    const base = V2_SKILLS.v2_skill_strike;
    const utilityEffect = {
      kind: "enemyVuln" as const,
      pct: 10,
      turns: 3,
    };
    const direct = {
      ...base,
      effects: [...base.effects, utilityEffect],
    };
    const conditional = {
      ...base,
      equippedSynergies: [
        {
          requiredSkillId: "v2c_warrior_might" as const,
          effects: [utilityEffect],
        },
      ],
    };
    const directDelta = skillPowerScore(direct) - skillPowerScore(base);
    const conditionalDelta = skillPowerScore(conditional) - skillPowerScore(base);

    expect(conditionalDelta).toBeCloseTo(directDelta * 0.5, 8);
  });

  it("선행 패시브가 필요한 속성 강화도 기본 변형 대비 증분의 절반만 청구한다", () => {
    const base = V2_SKILLS.v2_skill_strike;
    const utilityEffect = {
      kind: "enemyVuln" as const,
      pct: 10,
      turns: 3,
    };
    const direct = {
      ...base,
      effects: [...base.effects, utilityEffect],
    };
    const conditional = {
      ...base,
      elementEffectSynergies: [
        {
          requiredSkillId: "v2c_warrior_might" as const,
          elementEffects: {
            fire: [...base.effects, utilityEffect],
          },
        },
      ],
    };
    const directDelta = skillPowerScore(direct) - skillPowerScore(base);
    const conditionalDelta = skillPowerScore(conditional) - skillPowerScore(base);

    expect(conditionalDelta).toBeCloseTo(directDelta * 0.5, 8);
  });

  it("🔑 트립와이어 — 전투 스킬은 명시 할인 이상으로 underprice 금지", () => {
    // override 는 루브릭 "위로만"(아웃라이어 너프) 허용하고, 합의된 소량의
    // 명시 할인만 예외로 허용한다. 새 스킬/오버라이드가 그 바닥을 뚫으면 실패한다.
    for (const def of Object.values(V2_SKILLS)) {
      if (isLifestyleSkill(def)) continue;
      const discount = Math.max(0, Math.floor(def.spCostDiscount ?? 0));
      const floor = Math.max(1, rubricSpCost(def) - discount);
      expect(
        spCostOf(def),
        `${def.id} 가 할인 반영 루브릭(${floor}) 미만으로 underprice 됨`,
      ).toBeGreaterThanOrEqual(floor);
    }
  });
});

describe("레거시 시그니처 id 제거 (P4 은퇴 + 카탈로그 청소)", () => {
  // 구 직업 시그니처(검무·폭풍 화살 등 requireClass 스킬)는 카탈로그에서 제거됐다.
  // 옛 세이브에 박혀있어도 parseV2SkillsState 가 유효 id 가 아니라 안전하게 걸러낸다.
  const REMOVED_SIG = "v2_skill_blade_dance"; // 제거된 레거시 시그니처 id 예.

  it("parseV2SkillsState — 제거된 시그니처 id 는 learned·equipped 에서 모두 탈락, 유효 스킬은 보존", () => {
    const valid = "v2c_warrior_strike"; // 살아있는 공용 스킬
    const parsed = parseV2SkillsState({
      learned: [REMOVED_SIG, valid],
      equipped: [REMOVED_SIG, valid], // 옛 세이브: 제거된 시그니처가 장착돼 있던 상태
    });
    expect(parsed.learned).toEqual([valid]);
    expect(parsed.equipped).toEqual([valid]);
  });

  it("idempotent — 유효 공용 스킬만 있는 equipped 는 그대로", () => {
    const valid = "v2c_mage_fireball";
    const parsed = parseV2SkillsState({ learned: [valid], equipped: [valid] });
    expect(parsed.equipped).toEqual([valid]);
  });
});

describe("태초술사 공명 개편", () => {
  it("근원공명은 강화된 지능·정신·마법 운용 효과를 9 SP에 제공한다", () => {
    const resonance = V2_SKILLS.v2c_primordialmage_resonance;

    expect(resonance.passive).toMatchObject({
      statPct: { int: 24, spi: 12 },
      magicSkillDamagePct: 16,
      maxMpPct: 20,
    });
    expect(spCostOf(resonance)).toBe(9);
  });

  it("원초 증폭은 기존 효과를 유지하면서 9 SP를 사용한다", () => {
    const amplification = V2_SKILLS.v2c_primordialmage_amplification;

    expect(amplification.passive).toEqual({
      equipmentMagicSkillCritConversion: true,
    });
    expect(spCostOf(amplification)).toBe(9);
  });

  it("태초회귀는 근원공명과 오원소 폭주를 함께 요구하는 직접 피해 촉매를 가진다", () => {
    const catalyst = V2_SKILLS.v2c_primordialmage_return.equippedSynergies?.find(
      (synergy) =>
        synergy.requiredSkillIds?.includes("v2c_primordialmage_resonance") &&
        synergy.requiredSkillIds.includes("v2c_elementallord_surge"),
    );

    expect(catalyst?.effects).toEqual([
      { kind: "damage", statCoef: 0.28, baseFlat: 110, scaling: "magic" },
    ]);
  });
});

describe("삼중 결계 스킬 안내", () => {
  it("패시브 단계별 충전량·감소율과 만법불침 재전개를 상세 칩에 표시한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_grandwarder_tripleward)).toContain(
      "삼중 결계 각 1회 · 직접 피해 PvE -45% / PvP -30%",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_lawguardian_domain)).toEqual(
      expect.arrayContaining([
        "삼중 결계 각 3회 · 직접 피해 PvE -60% / PvP -40%",
        "결계 소모 시 영역 안정 +1 (받는 피해 -4%, 최대 3중첩)",
      ]),
    );
    expect(describeV2Skill(V2_SKILLS.v2c_lawguardian_inviolable)).toContain(
      "삼중 결계 전부 재전개",
    );
  });
});

describe("변이 자원 스킬 안내와 기본 패턴", () => {
  it("중량의 생성·증폭·소모 규칙만 상세 칩에 표시한다", () => {
    expect(describeV2Skill(V2_SKILLS.v2c_golem_rocksmash)).toContain(
      "중량 +1 (최대 3)",
    );
    expect(describeV2Skill(V2_SKILLS.v2c_golem_tectoniccollapse)).toContain(
      "중량 전부 소모 · 스택당 최종 피해 +20%",
    );

    const legacySplitMetadata = {
      ...V2_SKILLS.v2c_golem_rocksmash,
      splitGain: 1,
    };
    expect(describeV2Skill(legacySplitMetadata).join(" ")).not.toContain("분열체");
  });

  it("스마트 기본 패턴은 중량 3에 지각 붕괴를 사용한다", () => {
    expect(V2_SKILLS.v2c_golem_tectoniccollapse.defaultPattern).toEqual({
      priority: 500,
      condition: { kind: "self_resource", resource: "weight", op: "atLeast", value: 3 },
    });
  });
});
