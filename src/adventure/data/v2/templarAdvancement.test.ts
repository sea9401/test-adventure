import { afterEach, describe, expect, it, vi } from "vitest";
import { V2_JOB_CATALOG, TIER5_UNLOCK_CUMLEVEL, TIER6_UNLOCK_CUMLEVEL, isJobUnlocked, jobIdFromLegacy, LEGACY_CLASS_SPEC_BY_JOB } from "./v2JobCatalog";
import { addPoints, applyCultivation, emptyProficiency } from "./proficiency";
import { skillsForJob } from "./v2SkillsByJob";
import { elementalSkillsForClass, type V2Class } from "./classes";
import { aggregateEquippedPassives } from "./v2Skills";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "../../v2/combat/engine-pvp";
import type { PlayerCombat } from "../../v2/combat/engine";

afterEach(() => vi.restoreAllMocks());

describe.each([
  { id: "radiantknight", parent: "crusader", tier: 5, threshold: TIER5_UNLOCK_CUMLEVEL, growth: { str: 2, vit: 2, spi: 1 } },
  { id: "dawnpaladin", parent: "radiantknight", tier: 6, threshold: TIER6_UNLOCK_CUMLEVEL, growth: { str: 2, vit: 2, spi: 2 } },
])("성기사 $tier 차", ({ id, parent, tier, threshold, growth }) => {
  it("직전 직업 숙련도로 해금되며 다른 계열 숙련도로 우회할 수 없다", () => {
    const job = V2_JOB_CATALOG[id];
    expect(job).toBeDefined();
    expect(job.tier).toBe(tier);
    expect(isJobUnlocked(job, emptyProficiency())).toBe(false);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold - 1, runeknight: 999999 } })).toBe(false);
    expect(isJobUnlocked(job, { ...emptyProficiency(), jobCumLevel: { [parent]: threshold } })).toBe(true);
  });

  it("저장 직업을 복원하고 학습 화면에 전용 스킬을 노출한다", () => {
    const legacy = LEGACY_CLASS_SPEC_BY_JOB[id];
    expect(legacy).toBeDefined();
    expect(jobIdFromLegacy(legacy.class, legacy.spec)).toBe(id);
    const kit = skillsForJob(id);
    expect(kit).toHaveLength(2);
    expect(elementalSkillsForClass(legacy.class as V2Class, legacy.spec)).toEqual(kit);
    const passive = aggregateEquippedPassives(kit);
    expect(passive.statPct.spi).toBe(20);
  });

  it("전사로 저장해도 수행 시 힘·활력·정신이 성장한다", () => {
    const result = applyCultivation(addPoints(emptyProficiency(), "warrior", 10000), "warrior", undefined, undefined, id);
    expect(result?.next.caps).toMatchObject(growth);
    expect(result?.next.caps.dex).toBeUndefined();
  });

  it("5차는 성역을 준비하고 6차는 모은 성력으로 공격한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const fighter: PlayerCombat = { hp: 400, maxHp: 2000, atk: 300, def: 50, spd: 60, evasionPct: 0, attackCount: 1, accuracyPct: 100, maxMp: 10000, mp: 10000, classTier: tier };
    const kit = skillsForJob(id);
    const initial = initialBattleStatePvP(fighter, { ...fighter, hp: 2000 }, id, "상대", { learned: [...kit], equipped: [...kit] });
    if (tier === 6) initial.p1.stacks.holyPower = { power: 40, sanctuaryTurns: 0 };
    const result = castV2SkillOnAttackerTurnPvP(initial, "p1").state;
    if (tier === 5) {
      expect(result.p2.hp).toBe(initial.p2.hp);
      expect(result.p1.stacks.holyPower?.sanctuaryTurns).toBe(4);
    } else {
      expect(result.p2.hp).toBeLessThan(initial.p2.hp);
      expect(result.p1.stacks.holyPower?.power).toBe(0);
    }
  });
});
