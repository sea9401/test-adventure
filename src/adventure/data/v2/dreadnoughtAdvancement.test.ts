import { describe, expect, it } from "vitest";
import { effectiveCultivateProfile } from "./proficiency";
import { V2_JOB_CATALOG, LEGACY_CLASS_SPEC_BY_JOB, jobIdFromLegacy } from "./v2JobCatalog";
import { tier7AdvancementStatus } from "./tier7Advancement";
import { skillsForJob } from "./v2SkillsByJob";
import { elementalSkillsForClass } from "./classes";
import { aggregateEquippedPassives, V2_SKILLS, spCostOf } from "./v2Skills";

const ready = {
  targetJobId: "dreadnought", currentJobId: "fortressknight", currentLevel: 100,
  jobCumLevel: { fortressknight: 100_000, vajraarhat: 100_000 },
  jobHistory: [], materials: { v2_storm_origin_fragment: 30 },
};

describe("드레드노트 전직과 장착", () => {
  it("두 선행 6차 직업과 기존 최초 해금 조건을 요구한다", () => {
    expect(V2_JOB_CATALOG.dreadnought).toMatchObject({
      name: "드레드노트", tier: 7,
      unlock: { prereqs: { fortressknight: 100_000, vajraarhat: 100_000 } },
    });
    expect(tier7AdvancementStatus(ready)?.firstUnlockReady).toBe(true);
    for (const parent of ["fortressknight", "vajraarhat"]) {
      expect(tier7AdvancementStatus({ ...ready, jobCumLevel: { ...ready.jobCumLevel, [parent]: 99_999 } })?.failure).toBe("tier7_prerequisite_proficiency");
      expect(tier7AdvancementStatus({ ...ready, currentJobId: parent })?.firstUnlockReady).toBe(true);
    }
    expect(tier7AdvancementStatus({ ...ready, currentLevel: 99 })?.failure).toBe("level_too_low");
    expect(tier7AdvancementStatus({ ...ready, materials: {} })?.failure).toBe("tier7_material_shortage");
  });

  it("저장·교관·수행에 연결하고 신규 세 스킬은 총 36 SP다", () => {
    expect(LEGACY_CLASS_SPEC_BY_JOB.dreadnought).toEqual({ class: "warrior", spec: "dreadnought" });
    expect(jobIdFromLegacy("warrior", "dreadnought")).toBe("dreadnought");
    expect(effectiveCultivateProfile("warrior", "dreadnought")).toEqual({ vit: 4, str: 2, spi: 1 });
    const kit = skillsForJob("dreadnought");
    expect(kit.map(id => V2_SKILLS[id].name)).toEqual(["시즈 브레이커", "리액티브 아머", "끝없는 진군"]);
    expect(elementalSkillsForClass("warrior", "dreadnought")).toEqual(kit);
    expect(kit.map(id => spCostOf(V2_SKILLS[id]))).toEqual([14, 12, 10]);
  });

  it("계승 반격에 10%p를 더하고 다른 직업에서도 장착 효과를 유지한다", () => {
    const kit = skillsForJob("dreadnought");
    const equipped = [...kit, "v2c_vajraarhat_body" as const];
    const aggregate = aggregateEquippedPassives(equipped, "dreadnought");
    expect(aggregate).toMatchObject({ defPct: 20, maxHpPct: 52, counterChancePct: 40, counterImpactGain: 1, fortressImpactHealPctPerStack: 2 });
    expect(aggregateEquippedPassives(equipped, "warrior")).toEqual(aggregate);
    expect(aggregateEquippedPassives(kit).counterChancePct).toBe(10);
  });
});
