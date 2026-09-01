import { describe, expect, it } from "vitest";
import { emptyUnexploredSave, parseUnexploredSave } from "./unexploredState";
import {
  explorationPointCost,
  grantExplorationXp,
  grantUnexploredAchievements,
  unexploredAchievementCandidates,
  unexploredTotalXpCost,
  withFirstExplorationPoint,
} from "./unexploredProgression";

describe("unexplored exploration XP", () => {
  it("첫 포인트는 무료이고 2포인트부터 3,000승으로 시작해 완만하게 증가한다", () => {
    expect(explorationPointCost(1)).toBe(0);
    expect(explorationPointCost(31)).toBe(0);
    const costs = Array.from({ length: 29 }, (_, index) =>
      explorationPointCost(index + 2),
    );
    expect(costs[0]).toBe(3_000);
    expect(costs.at(-1)).toBe(12_656);
    expect(costs.every((cost) => cost > 0)).toBe(true);
    expect(costs.slice(0, -1).every((cost, index) => cost < costs[index + 1])).toBe(true);
  });

  it("30포인트까지 총 200,000승을 요구하고 합의한 중간 누적치를 지킨다", () => {
    expect(unexploredTotalXpCost()).toBe(200_000);
    expect(
      Array.from({ length: 29 }, (_, index) =>
        explorationPointCost(index + 2),
      ).reduce((sum, cost) => sum + cost, 0),
    ).toBe(200_000);

    const cumulativeAt = (point: number) =>
      Array.from({ length: point - 1 }, (_, index) =>
        explorationPointCost(index + 2),
      ).reduce((sum, cost) => sum + cost, 0);
    expect(cumulativeAt(5)).toBe(12_588);
    expect(cumulativeAt(10)).toBe(32_477);
    expect(cumulativeAt(20)).toBe(95_349);
    expect(cumulativeAt(30)).toBe(200_000);
  });

  it("persists the free first point before reincarnation", () => {
    const saved = withFirstExplorationPoint(emptyUnexploredSave());
    expect(saved.xpPoints).toBe(1);
    expect(withFirstExplorationPoint(saved)).toEqual(saved);
  });

  it("spends max-level overflow across multiple points and keeps the remainder", () => {
    const second = explorationPointCost(2);
    const third = explorationPointCost(3);
    const result = grantExplorationXp(
      emptyUnexploredSave(),
      second + third + 17,
    );

    expect(result.save.xpPoints).toBe(3);
    expect(result.save.explorationXp).toBe(17);
    expect(result.pointsGained).toBe(3);
    expect(result.acceptedXp).toBe(second + third + 17);
    expect(result.discardedXp).toBe(0);
  });

  it("discards overflow once all 30 XP points are earned", () => {
    const completed = parseUnexploredSave({
      xpPoints: 30,
      explorationXp: 99,
      explorationProgressVersion: 2,
    });
    const result = grantExplorationXp(completed, 12345);

    expect(result.save).toMatchObject({ xpPoints: 30, explorationXp: 0 });
    expect(result.pointsGained).toBe(0);
    expect(result.acceptedXp).toBe(0);
    expect(result.discardedXp).toBe(12444);
  });
});

describe("unexplored achievements", () => {
  it("ignores standard co-op bosses and derives achievements from personal boss IDs", () => {
    expect(
      unexploredAchievementCandidates({
        defeatedBossIds: [
          "mountain_chief",
          "tracking_weapon",
          "tracking_weapon",
        ],
        unexploredHuntWon: true,
        specialMonsterKilled: true,
        summonStoneCrafted: true,
        activePoolCount: 3,
      }),
    ).toEqual([
      "first_personal_boss",
      "defeat_tracking_weapon",
      "first_unexplored_hunt",
      "first_special_kill",
      "first_summon_stone_craft",
      "activate_two_pools",
      "activate_three_pools",
    ]);
  });

  it("requires all five personal bosses for conquest and grants both new boss achievements", () => {
    expect(
      unexploredAchievementCandidates({
        defeatedBossIds: [
          "tracking_weapon",
          "toxic_blood_lord",
          "glacial_colossus",
        ],
      }),
    ).not.toContain("defeat_all_personal_bosses");
    expect(
      unexploredAchievementCandidates({
        defeatedBossIds: [
          "tracking_weapon",
          "toxic_blood_lord",
          "glacial_colossus",
          "invincible_fortress",
          "skyward_crystal_eye",
          "lake_sovereign",
        ],
      }),
    ).toEqual([
      "first_personal_boss",
      "defeat_tracking_weapon",
      "defeat_toxic_blood_lord",
      "defeat_glacial_colossus",
      "defeat_invincible_fortress",
      "defeat_skyward_crystal_eye",
      "defeat_all_personal_bosses",
    ]);
  });

  it("retains a previously saved conquest achievement", () => {
    expect(parseUnexploredSave({
      achievementIds: ["defeat_all_personal_bosses"],
    }).achievementIds).toEqual(["defeat_all_personal_bosses"]);
  });

  it("adds achievements once and never removes prior achievements", () => {
    const initial = parseUnexploredSave({
      achievementIds: ["activate_three_pools"],
    });
    const first = grantUnexploredAchievements(initial, [
      "activate_two_pools",
      "activate_three_pools",
    ]);
    const second = grantUnexploredAchievements(first.save, [
      "activate_two_pools",
    ]);

    expect(first.addedIds).toEqual(["activate_two_pools"]);
    expect(first.save.achievementIds).toEqual([
      "activate_three_pools",
      "activate_two_pools",
    ]);
    expect(second.addedIds).toEqual([]);
    expect(second.save).toEqual(first.save);
  });
});
