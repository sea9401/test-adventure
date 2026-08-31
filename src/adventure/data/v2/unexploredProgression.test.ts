import { describe, expect, it } from "vitest";
import { getLevelTable } from "@/lib/leveling";
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
  it("makes point 1 free and charges a rising cost through point 30", () => {
    expect(explorationPointCost(1)).toBe(0);
    expect(explorationPointCost(31)).toBe(0);
    const costs = Array.from({ length: 29 }, (_, index) =>
      explorationPointCost(index + 2),
    );
    expect(costs.every((cost) => cost > 0)).toBe(true);
    expect(costs.slice(0, -1).every((cost, index) => cost < costs[index + 1])).toBe(true);
  });

  it("costs exactly five current level-1-to-100 loops in total", () => {
    const totalLoopXp = getLevelTable().at(-1)?.cumulative ?? 0;
    expect(unexploredTotalXpCost()).toBe(totalLoopXp * 5);
    expect(
      Array.from({ length: 29 }, (_, index) =>
        explorationPointCost(index + 2),
      ).reduce((sum, cost) => sum + cost, 0),
    ).toBe(totalLoopXp * 5);
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
    const completed = parseUnexploredSave({ xpPoints: 30, explorationXp: 99 });
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

  it("awards all five boss achievements after defeating all three personal bosses", () => {
    expect(
      unexploredAchievementCandidates({
        defeatedBossIds: [
          "tracking_weapon",
          "toxic_blood_lord",
          "glacial_colossus",
          "lake_sovereign",
        ],
      }),
    ).toEqual([
      "first_personal_boss",
      "defeat_tracking_weapon",
      "defeat_toxic_blood_lord",
      "defeat_glacial_colossus",
      "defeat_all_personal_bosses",
    ]);
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
