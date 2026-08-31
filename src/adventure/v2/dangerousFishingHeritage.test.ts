import { describe, expect, it } from "vitest";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";
import {
  emptyFishingProgression,
  fishingLevelXpThreshold,
} from "./fishingProgression";
import {
  DANGEROUS_FISHING_ASSIST_CAP_PCT,
  dangerousFishingEncounterModifiers,
  dangerousFishingHeritage,
  dangerousFishingRealtimeProjection,
  dangerousRealtimeLevelBonuses,
} from "./dangerousFishingHeritage";

function progressionAtLevel(level: number) {
  return {
    ...emptyFishingProgression(),
    xp: fishingLevelXpThreshold(level),
  };
}

describe("기존 낚시 성장의 위험 해역 효용", () => {
  it("낚시 레벨 15에 해금하고 레벨 50 조작 보조도 10%를 넘지 않는다", () => {
    expect(
      dangerousFishingHeritage({
        fishingProgression: progressionAtLevel(14),
        proficiency: emptyProficiency(),
        currentJobId: "mage",
        equippedSkillIds: [],
      }),
    ).toMatchObject({ unlocked: false, fishingLevel: 14, levelAssistPct: 0 });

    expect(
      dangerousFishingHeritage({
        fishingProgression: progressionAtLevel(15),
        proficiency: emptyProficiency(),
        currentJobId: "mage",
        equippedSkillIds: [],
      }),
    ).toMatchObject({ unlocked: true, fishingLevel: 15, levelAssistPct: 0 });

    const capped = dangerousFishingHeritage({
      fishingProgression: progressionAtLevel(50),
      proficiency: emptyProficiency(),
      currentJobId: "mage",
      equippedSkillIds: [],
    });
    expect(capped.levelAssistPct).toBe(10);
    expect(capped.levelAssistPct).toBeLessThanOrEqual(
      DANGEROUS_FISHING_ASSIST_CAP_PCT,
    );
    expect(dangerousRealtimeLevelBonuses(capped.fishingLevel)).toEqual({
      reelEfficiencyPct: 0,
      tensionControlPct: 0,
    });
  });

  it("레벨 100은 기존 보조를 유지하고 실시간 조우에만 새 끝단 보정을 더한다", () => {
    const heritage = dangerousFishingHeritage({
      fishingProgression: progressionAtLevel(100),
      proficiency: emptyProficiency(),
      currentJobId: "mage",
      equippedSkillIds: [],
    });

    expect(heritage.levelAssistPct).toBe(10);
    expect(dangerousRealtimeLevelBonuses(heritage.fishingLevel)).toEqual({
      reelEfficiencyPct: 12,
      tensionControlPct: 8,
    });
  });

  it("현재 직업이 달라도 이력상 최고 낚시 계보를 누적 적용한다", () => {
    const proficiency = {
      ...emptyProficiency(),
      jobHistory: ["fisher", "angler", "masterangler", "fullcatchking"],
    };
    const heritage = dangerousFishingHeritage({
      fishingProgression: progressionAtLevel(30),
      proficiency,
      currentJobId: "mage",
      equippedSkillIds: [],
    });

    expect(heritage.highestFishingJobId).toBe("fullcatchking");
    expect(heritage.lineage).toMatchObject({
      telegraphSteps: 1,
      targetReadingPct: 5,
      staminaBonusPct: 6,
      cargoProtectionPct: 10,
      deepTraceBonusPct: 0,
    });
  });

  it("장착한 낚시 패시브를 대응 보너스로 바꾸되 합산 상한을 지킨다", () => {
    const heritage = dangerousFishingHeritage({
      fishingProgression: progressionAtLevel(50),
      proficiency: {
        ...emptyProficiency(),
        jobHistory: ["seagod"],
      },
      currentJobId: "warrior",
      equippedSkillIds: [
        "v2c_camper_tidereading",
        "v2c_angler_pointreading",
        "v2c_masterangler_bigcatchsense",
        "v2c_fullcatchking_bountyhaul",
        "v2c_seagod_deepcurrent",
      ],
    });
    const modifiers = dangerousFishingEncounterModifiers(heritage, {
      rodId: "starter_rod",
      reelId: "starter_reel",
      lineId: "starter_line",
    });

    expect(heritage.passives).toEqual({
      traceBonusPct: 5,
      targetReadingPct: 4,
      staminaBonusPct: 4,
      cargoProtectionPct: 5,
      sizeBonusPct: 2,
      deepTraceBonusPct: 8,
    });
    expect(modifiers.targetReadingPct).toBeLessThanOrEqual(10);
    expect(modifiers.cargoProtectionPct).toBeLessThanOrEqual(15);
    expect(modifiers.traceBonusPct).toBeLessThanOrEqual(20);
    expect(modifiers.sizeBonusPct).toBeLessThanOrEqual(5);
    expect(modifiers.assistance.maxTensionBonus).toBeGreaterThan(0);
    expect(modifiers.assistance.staminaDamageBonus).toBeGreaterThan(0);
  });

  it("실시간 조우는 기존 계보 투영에서 내재 장비·보조 수치만 한 번 스냅샷한다", () => {
    const heritage = dangerousFishingHeritage({
      fishingProgression: progressionAtLevel(50),
      proficiency: {
        ...emptyProficiency(),
        jobHistory: ["seagod"],
      },
      currentJobId: "mage",
      equippedSkillIds: [
        "v2c_masterangler_bigcatchsense",
        "v2c_fullcatchking_bountyhaul",
      ],
    });
    const projected = dangerousFishingRealtimeProjection(
      dangerousFishingEncounterModifiers(heritage, {
        rodId: "leviathan_rod",
        reelId: "maelstrom_reel",
        lineId: "abyss_chain_line",
      }),
    );

    expect(projected).toEqual({
      maxTensionBonus: 31,
      reelPowerBonus: 7,
      staminaDamageBonus: 12,
      tensionControlBonus: 5,
      slackTolerance: 1,
      telegraphSteps: 1,
      cargoProtectionPct: 15,
    });
  });
});
