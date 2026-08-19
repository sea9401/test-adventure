import { describe, expect, it } from "vitest";
import { applyHuntProficiency } from "./huntProficiency";

describe("applyHuntProficiency", () => {
  it("레벨업이 없으면 승리를 계속해도 스탯 성장분을 올리지 않는다", () => {
    const result = applyHuntProficiency({
      won: true,
      depth: 1,
      charSave: { class: "warrior" },
      proficiencyRaw: {
        growthScaleVersion: 1,
        postCapGrowthProgress: 99,
        grown: { str: 10 },
      },
      equippedSkills: [],
      proficiencyChancePct: 0,
      levelsGained: 0,
      rng: () => 0.1,
    });

    expect(result.masteryGained).toBe(1);
    expect(result.statGains).toEqual({});
    expect(result.nextProficiency?.grown).toEqual({ str: 10 });
    expect(result.nextProficiency).not.toHaveProperty("postCapGrowthProgress");
  });

  it.each(["beastkin", "golem"])(
    "변이 전문 직업 %s은 사냥 승리 후 저장된 직업 숙련도를 누적으로 반환한다",
    (specChoice) => {
      const result = applyHuntProficiency({
        won: true,
        depth: 1,
        charSave: { class: "mutant", specChoice },
        proficiencyRaw: {},
        equippedSkills: [],
        proficiencyChancePct: 0,
        levelsGained: 0,
        rng: () => 0.1,
      });

      expect(result.masteryGained).toBe(1);
      expect(result.masteryAfter).toBe(1);
      expect(result.nextProficiency?.groups.mutant?.cumLevel).toBe(1);
      expect(result.nextProficiency?.jobCumLevel?.[specChoice]).toBe(1);
    },
  );
});
