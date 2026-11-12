import { describe, expect, it } from "vitest";
import { emptyProficiency, effectiveCultivateProfile } from "./proficiency";
import {
  V2_JOB_CATALOG,
  LEGACY_CLASS_SPEC_BY_JOB,
  jobIdFromLegacy,
  isJobUnlocked,
} from "./v2JobCatalog";
import { skillsForJob } from "./v2SkillsByJob";
import { elementalSkillsForClass } from "./classes";
import { aggregateEquippedPassives, V2_SKILLS, spCostOf } from "./v2Skills";

const LINES = [
  ["electromancer", "lightningmage", 18000, 5, "mage"],
  ["thundersovereign", "electromancer", 35000, 6, "mage"],
  ["spellswordmaster", "runeknight", 18000, 5, "warrior"],
  ["spellswordemperor", "spellswordmaster", 35000, 6, "warrior"],
] as const;

describe("전격 마법사·룬 기사 단일 계보", () => {
  it.each(LINES)("%s는 직전 직업 숙련도로만 해금한다", (id, parent, threshold, tier) => {
    const job = V2_JOB_CATALOG[id];
    expect(job).toBeDefined();
    expect(job.tier).toBe(tier);
    expect(job.unlock.prereqs).toEqual({ [parent]: threshold });
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold - 1 } })).toBe(false);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold } })).toBe(true);
    expect(
      isJobUnlocked(job, {
        ...emptyProficiency(),
        jobCumLevel: { elementallord: 999999, transcendent: 999999, firemage: 999999, crusader: 999999 },
      }),
    ).toBe(false);
  });

  it.each(LINES)("%s를 저장·교관·수행에 연결한다", (id, _parent, _threshold, _tier, legacyClass) => {
    expect(LEGACY_CLASS_SPEC_BY_JOB[id]).toEqual({ class: legacyClass, spec: id });
    expect(jobIdFromLegacy(legacyClass, id)).toBe(id);
    const kit = skillsForJob(id);
    expect(kit).toHaveLength(3);
    expect(elementalSkillsForClass(legacyClass, id)).toEqual(kit);
    expect(effectiveCultivateProfile(legacyClass, id)).toEqual(V2_JOB_CATALOG[id].cultivateProfile);
    expect(aggregateEquippedPassives(kit, id)).toEqual(aggregateEquippedPassives(kit, "warrior"));
    for (const skillId of kit) expect(V2_SKILLS[skillId]).toBeDefined();
  });

  it("수행 합과 직업 보너스 합이 같은 차수 계보와 같다", () => {
    const sum = (record: Partial<Record<string, number>>) =>
      Object.values(record).reduce<number>((total, value) => total + (value ?? 0), 0);
    expect(sum(V2_JOB_CATALOG.electromancer.cultivateProfile)).toBe(sum(V2_JOB_CATALOG.pyromancer.cultivateProfile));
    expect(sum(V2_JOB_CATALOG.thundersovereign.cultivateProfile)).toBe(sum(V2_JOB_CATALOG.infernomancer.cultivateProfile));
    expect(V2_JOB_CATALOG.electromancer.jobBonus).toEqual(V2_JOB_CATALOG.pyromancer.jobBonus);
    expect(V2_JOB_CATALOG.thundersovereign.jobBonus).toEqual(V2_JOB_CATALOG.infernomancer.jobBonus);
    expect(sum(V2_JOB_CATALOG.spellswordmaster.cultivateProfile)).toBe(5);
    expect(sum(V2_JOB_CATALOG.spellswordemperor.cultivateProfile)).toBe(6);
    expect(sum(V2_JOB_CATALOG.spellswordmaster.jobBonus)).toBe(sum(V2_JOB_CATALOG.swordmaster.jobBonus));
    expect(sum(V2_JOB_CATALOG.spellswordemperor.jobBonus)).toBe(40);
  });

  it("기존 원소군주·초월자 해금 조건은 그대로다", () => {
    expect(Object.keys(V2_JOB_CATALOG.elementallord.unlock.prereqs)).toContain("lightningmage");
    expect(Object.keys(V2_JOB_CATALOG.transcendent.unlock.prereqs).sort()).toEqual(["crusader", "runeknight"]);
  });
});

describe("전격 계보 스킬 정의", () => {
  it("전격 주문 세 개만 전격 주문으로 표시한다", () => {
    const lightningSpells = Object.values(V2_SKILLS)
      .filter((skill) => skill.lightningMageSpell)
      .map((skill) => skill.id)
      .sort();
    expect(lightningSpells).toEqual([
      "v2c_electromancer_chain",
      "v2c_lightningmage_thunderbolt",
      "v2c_thundersovereign_descent",
    ]);
  });

  it("연쇄 뇌격은 2연타이고 취약 대상 치명타 보너스를 가진다", () => {
    const chain = V2_SKILLS.v2c_electromancer_chain;
    expect(chain.effects.filter((effect) => effect.kind === "damage")).toHaveLength(2);
    expect(chain.vulnerableTargetCritChancePct).toBe(25);
  });

  it("만뢰 강림은 취약을 걸고 취약 대상에게만 관통한다", () => {
    const descent = V2_SKILLS.v2c_thundersovereign_descent;
    expect(descent.effects).toContainEqual({ kind: "enemyVuln", pct: 18, turns: 3 });
    expect(descent.vulnerableTargetPiercePct).toBe(20);
    expect(descent.effects.some((effect) => effect.kind === "damage" && (effect.pierceDamagePct ?? 0) > 0)).toBe(false);
  });

  it("패시브는 능력치 중첩 없이 전격 전용 효과만 준다", () => {
    expect(V2_SKILLS.v2c_electromancer_capacitor.passive).toEqual({ skillCritDmgPct: 20 });
    expect(V2_SKILLS.v2c_electromancer_conduction.passive).toEqual({
      vulnDurationBonusTurns: 1,
      lightningSpellMpCostReductionPct: 20,
    });
    expect(V2_SKILLS.v2c_thundersovereign_heart.passive).toEqual({ lightningCritHastePct: 20 });
    expect(V2_SKILLS.v2c_thundersovereign_thunderclap.passive).toEqual({ skillCritDmgPct: 30 });
    const passive = aggregateEquippedPassives(
      [
        "v2c_electromancer_capacitor",
        "v2c_electromancer_conduction",
        "v2c_thundersovereign_heart",
        "v2c_thundersovereign_thunderclap",
      ],
      "warrior",
    );
    expect(passive.statPct).toEqual({});
    expect(passive).toMatchObject({
      magicSkillDamagePct: 0,
      skillCritDmgPct: 50,
      vulnDurationBonusTurns: 1,
      lightningSpellMpCostReductionPct: 20,
      lightningCritHastePct: 20,
    });
  });
});

describe("룬 기사 계보 스킬 정의", () => {
  it("룬 연격은 물리·마법·물리 3연타다", () => {
    const scalings = V2_SKILLS.v2c_spellswordmaster_flurry.effects
      .filter((effect) => effect.kind === "damage")
      .map((effect) => (effect.kind === "damage" ? (effect.scaling ?? "physical") : null));
    expect(scalings).toEqual(["physical", "magic", "physical"]);
  });

  it("마검 해방은 물리와 마법 두 타 모두 관통하고 취약을 건다", () => {
    const release = V2_SKILLS.v2c_spellswordemperor_release;
    const hits = release.effects.filter((effect) => effect.kind === "damage");
    expect(hits.map((effect) => (effect.kind === "damage" ? (effect.scaling ?? "physical") : null))).toEqual([
      "physical",
      "magic",
    ]);
    expect(hits.every((effect) => effect.kind === "damage" && effect.pierceDamagePct === 15)).toBe(true);
    expect(release.effects).toContainEqual({ kind: "enemyVuln", pct: 14, turns: 3 });
  });

  it("패시브는 힘·지능과 양쪽 방어 감소를 함께 준다", () => {
    expect(V2_SKILLS.v2c_spellswordmaster_dualmark.passive).toEqual({
      statPct: { str: 16, int: 16 },
      physicalSkillDamagePct: 6,
      magicSkillDamagePct: 6,
    });
    expect(V2_SKILLS.v2c_spellswordmaster_fissure.passive).toEqual({
      enemyPhysicalDefReductionPct: 8,
      enemyMagicDefReductionPct: 8,
    });
    expect(V2_SKILLS.v2c_spellswordemperor_unity.passive).toEqual({
      statPct: { str: 20, int: 20 },
      critPct: 6,
    });
    expect(V2_SKILLS.v2c_spellswordemperor_rift.passive).toEqual({
      enemyPhysicalDefReductionPct: 12,
      enemyMagicDefReductionPct: 12,
    });
  });

  it("방어 감소는 갑주 간파와 남은 방어력 기준으로 겹친다", () => {
    const passive = aggregateEquippedPassives(
      ["v2c_spellswordemperor_rift", "v2c_swordmaster_armorinsight2"],
      "warrior",
    );
    expect(passive.enemyPhysicalDefReductionPct).toBeCloseTo(21.68, 2);
    expect(passive.enemyMagicDefReductionPct).toBe(12);
  });
});

describe("신규 12개 스킬 공통", () => {
  const ids = [...LINES.map(([id]) => id)].flatMap((id) => skillsForJob(id));

  it("학습 비용은 5차 8,000·6차 12,000이고 SP가 1 이상이다", () => {
    expect(ids).toHaveLength(12);
    for (const id of ids) {
      const skill = V2_SKILLS[id];
      expect(skill.learnCost).toBe(/electromancer|spellswordmaster/.test(id) ? 8000 : 12000);
      expect(spCostOf(skill)).toBeGreaterThanOrEqual(1);
      expect(skill.detail?.mechanics.length ?? 0).toBeGreaterThan(0);
    }
  });
});
