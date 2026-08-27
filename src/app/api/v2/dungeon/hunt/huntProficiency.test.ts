import { describe, expect, it } from "vitest";
import { computeStatFloors } from "@/adventure/data/v2/statGrowth";
import { parseProficiency } from "@/adventure/data/v2/proficiency";
import { applyHuntProficiency } from "./huntProficiency";
import { v2LevelGrowthHpMp } from "@/lib/server/derivePlayerCombatV2";

describe("applyHuntProficiency", () => {
  it("신형 생애는 오른 레벨마다 실제 HP·MP를 굴려 기록과 표시값을 함께 갱신한다", () => {
    const result = applyHuntProficiency({
      won: false,
      depth: 1,
      charSave: { class: "warrior", level: 1 },
      proficiencyRaw: {
        lifeResourceGrowth: {
          version: 1,
          rolledLevel: 1,
          baseHp: 120,
          baseMp: 65,
          gainedHp: 0,
          gainedMp: 0,
        },
      },
      equippedSkills: [],
      proficiencyChancePct: 0,
      levelsGained: 2,
      rng: () => 0,
    });

    expect(result).toMatchObject({ hpGain: 16, mpGain: 6 });
    expect(result.nextProficiency?.lifeResourceGrowth).toMatchObject({
      rolledLevel: 3,
      gainedHp: 16,
      gainedMp: 6,
    });
  });

  it("레거시 생애는 기록을 만들지 않고 기존 표시 계산을 유지한다", () => {
    const result = applyHuntProficiency({
      won: false,
      depth: 1,
      charSave: { class: "warrior", level: 1 },
      proficiencyRaw: {},
      equippedSkills: [],
      proficiencyChancePct: 0,
      levelsGained: 2,
      rng: () => 0,
    });
    const expected = v2LevelGrowthHpMp({
      levelsGained: 2,
      strGained: result.statGains.str ?? 0,
      vitGained: result.statGains.vit ?? 0,
      intGained: result.statGains.int ?? 0,
    });

    expect(result).toMatchObject({ hpGain: expected.hp, mpGain: expected.mp });
    expect(result.nextProficiency?.lifeResourceGrowth).toBeUndefined();
  });

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
    expect(result.masteryJobId).toBe("warrior");
    expect(result.statGains).toEqual({});
    expect(result.nextProficiency?.grown).toEqual({ str: 10 });
    expect(result.nextProficiency).not.toHaveProperty("postCapGrowthProgress");
  });

  it("100레벨 사냥은 숙련도 경계를 넘어도 스탯 저점을 올리지 않는다", () => {
    const proficiencyRaw = {
      growthScaleVersion: 1,
      groups: {
        mage: { cultivations: 0, tier: 1, cumLevel: 1799 },
      },
    };
    const floorBefore = computeStatFloors(parseProficiency(proficiencyRaw));

    const result = applyHuntProficiency({
      won: true,
      depth: 84,
      charSave: { class: "mage", level: 100, specChoice: "archmage" },
      proficiencyRaw,
      equippedSkills: [],
      proficiencyChancePct: 0,
      levelsGained: 0,
      rng: () => 0.5,
    });

    expect(result.nextProficiency?.groups.mage?.cumLevel).toBe(1800);
    expect(result.nextProficiency?.statFloorLevels.mage).toBe(199);
    expect(computeStatFloors(result.nextProficiency!)).toEqual(floorBefore);
  });

  it("실제 레벨 상승분은 스탯 저점 성장치에 누적한다", () => {
    const result = applyHuntProficiency({
      won: false,
      depth: 1,
      charSave: { class: "warrior", level: 2 },
      proficiencyRaw: {},
      equippedSkills: [],
      proficiencyChancePct: 0,
      levelsGained: 1,
      rng: () => 0.1,
    });

    expect(result.nextProficiency?.statFloorLevels.warrior).toBe(1);
    expect(result.nextProficiency?.groups.warrior?.cumLevel ?? 0).toBe(0);
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
      expect(result.masteryJobId).toBe(specChoice);
      expect(result.masteryAfter).toBe(1);
      expect(result.nextProficiency?.groups.mutant?.cumLevel).toBe(1);
      expect(result.nextProficiency?.jobCumLevel?.[specChoice]).toBe(1);
    },
  );

  it("패배와 생활 직업은 사냥 직업 숙련 대상 ID를 반환하지 않는다", () => {
    // Break caught: a loss or a fishing job creates a job.victory mastery event.
    const base = {
      depth: 1,
      proficiencyRaw: {},
      equippedSkills: [],
      proficiencyChancePct: 0,
      levelsGained: 0,
      rng: () => 0.1,
    } as const;

    expect(applyHuntProficiency({
      ...base,
      won: false,
      charSave: { class: "warrior" },
    }).masteryJobId).toBeNull();
    expect(applyHuntProficiency({
      ...base,
      won: true,
      charSave: { class: "survivor", specChoice: "fisher" },
    }).masteryJobId).toBeNull();
  });

  it("압축 희귀 탐사의 보상 승리 수만큼 숙달과 직업 숙련도를 적립한다", () => {
    // Break caught: a 30-roll expedition grants only one proficiency reward.
    const result = applyHuntProficiency({
      won: true,
      depth: 84,
      charSave: { class: "warrior" },
      proficiencyRaw: {},
      equippedSkills: [],
      proficiencyChancePct: 0,
      levelsGained: 0,
      rewardWins: 30,
      rng: () => 0.5,
    });

    expect(result.proficiencyGained).toBe(150);
    expect(result.masteryGained).toBe(30);
    expect(result.masteryAfter).toBe(30);
    expect(result.nextProficiency?.groups.warrior?.cumLevel).toBe(30);
  });
});
