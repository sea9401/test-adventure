import { describe, expect, it } from "vitest";
import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import { floorPowerGate } from "@/adventure/data/v2/dungeonLadder";
import { derivePowerScore } from "@/adventure/data/v2/power";
import { V2_STAT_KEYS } from "@/adventure/data/v2/v2StatKeys";
import { derivePlayerCombatV2FromSaves } from "./derivePlayerCombatV2";
import { powerInputFromPlayer } from "./playerPowerInput";
import {
  REVIEW_ADMIN_OP_TARGETS,
  buildReviewAdminOpPreset,
} from "./reviewAdminOpPreset";

const character = {
  class: "mage",
  specChoice: null,
  level: 20,
  exp: 55,
  hp: 1,
  mp: 2,
  gold: 30,
  bankedGold: 40,
  fame: 5,
  frontierDepth: 4,
  questMarker: "preserve",
};

describe("buildReviewAdminOpPreset", () => {
  it("심의 목표값을 적용하면서 관련 없는 캐릭터와 인벤토리 필드를 보존한다", () => {
    const result = buildReviewAdminOpPreset({
      characterRaw: character,
      proficiencyRaw: {},
      inventoryRaw: { hpCharges: 3, mpCharges: 4, custom: true },
      nowMs: 1234,
    });

    expect(result).not.toBeNull();
    expect(result?.character).toMatchObject({
      class: "mage",
      specChoice: null,
      level: 100,
      exp: 0,
      gold: 1_000_000_000,
      bankedGold: 1_000_000_000,
      fame: 1_000_000,
      frontierDepth: MAX_FRONTIER_DEPTH,
      questMarker: "preserve",
      stamina: { current: 2_000, lastUpdatedAt: 1234 },
    });
    expect(result?.inventory).toMatchObject({
      hpCharges: 100_000,
      mpCharges: 100_000,
      custom: true,
    });
  });

  it("모든 능력치와 현재 직업 숙련도를 올리고 높은 기존 값은 보존한다", () => {
    const result = buildReviewAdminOpPreset({
      characterRaw: { ...character, level: 100, exp: 77, gold: 2_000_000_000 },
      proficiencyRaw: {
        points: 2_000_000,
        groups: {
          mage: { cultivations: 7, tier: 2, cumLevel: 9 },
          warrior: { cultivations: 3, tier: 4, cumLevel: 88 },
        },
        caps: { int: 3500 },
        grown: { int: 3600 },
        growthScaleVersion: 1,
        jobCumLevel: { mage: 10, archmage: 99 },
        jobHistory: ["archmage"],
        reincarnations: 4,
      },
      inventoryRaw: { hpCharges: 200_000 },
      nowMs: 1234,
    });

    expect(result?.character).toMatchObject({
      level: 100,
      exp: 77,
      gold: 2_000_000_000,
    });
    expect(result?.inventory.hpCharges).toBe(200_000);
    expect(result?.proficiency.points).toBe(2_000_000);
    expect(result?.proficiency.groups.mage).toMatchObject({
      cultivations: 7,
      tier: 5,
      cumLevel: 1_000_000,
    });
    expect(result?.proficiency.groups.warrior).toEqual({
      cultivations: 3,
      tier: 4,
      cumLevel: 88,
    });
    expect(result?.proficiency.caps.int).toBe(3500);
    expect(result?.proficiency.grown.int).toBe(3600);
    for (const stat of V2_STAT_KEYS) {
      expect(result?.proficiency.caps[stat]).toBeGreaterThanOrEqual(3_000);
      expect(result?.proficiency.grown[stat]).toBeGreaterThanOrEqual(3_000);
    }
    expect(result?.proficiency.jobCumLevel).toMatchObject({
      mage: 1_000_000,
      archmage: 99,
    });
    expect(result?.proficiency.jobHistory).toEqual(["archmage"]);
    expect(result?.proficiency.reincarnations).toBe(100);
  });

  it("같은 시각에 재적용해도 같은 결과를 내고 직업 없는 캐릭터는 거절한다", () => {
    const first = buildReviewAdminOpPreset({
      characterRaw: character,
      proficiencyRaw: {},
      inventoryRaw: {},
      nowMs: 1234,
    });
    const second =
      first &&
      buildReviewAdminOpPreset({
        characterRaw: first.character,
        proficiencyRaw: first.proficiency,
        inventoryRaw: first.inventory,
        nowMs: 1234,
      });

    expect(second).toEqual(first);
    expect(
      buildReviewAdminOpPreset({
        characterRaw: { ...character, class: "none" },
        proficiencyRaw: {},
        inventoryRaw: {},
        nowMs: 1234,
      }),
    ).toBeNull();
    expect(REVIEW_ADMIN_OP_TARGETS.level).toBe(100);
  });

  it("장비와 스킬이 없어도 가장 불리한 기본 직업이 최종 권장 전투력의 1.5배를 넘는다", () => {
    const result = buildReviewAdminOpPreset({
      characterRaw: { ...character, class: "rogue", specChoice: null },
      proficiencyRaw: {},
      inventoryRaw: {},
      nowMs: 1234,
    });
    expect(result).not.toBeNull();
    const combat = derivePlayerCombatV2FromSaves({
      character: result?.character,
      equipmentSave: {},
      proficiencyRaw: result?.proficiency,
      skillsRaw: {},
    });
    expect(combat).not.toBeNull();
    const power = derivePowerScore(
      powerInputFromPlayer(
        combat!.player,
        combat!.maxHp,
        combat!.player.maxMp,
      ),
    );
    expect(power).toBeGreaterThanOrEqual(
      Math.ceil(floorPowerGate(MAX_FRONTIER_DEPTH) * 1.5),
    );
  });
});
