import { describe, expect, it } from "vitest";
import {
  addGuildWorkshopWeeklyProgress,
  claimGuildWorkshopWeeklyQuest,
  guildWorkshopWeeklyQuestViews,
  parseGuildWorkshopWeeklyState,
} from "./guildWorkshopWeekly";

describe("guild workshop weekly quests", () => {
  it("resets stale week state lazily", () => {
    expect(
      parseGuildWorkshopWeeklyState(
        {
          weekKey: "2026-W25",
          craftCount: 99,
          qualityCount: 9,
          claimed: ["weekly_craft_20"],
        },
        "2026-W26",
      ),
    ).toEqual({
      weekKey: "2026-W26",
      craftCount: 0,
      qualityCount: 0,
      claimed: [],
    });
  });

  it("builds quest views from craft and quality progress", () => {
    const views = guildWorkshopWeeklyQuestViews({
      weekKey: "2026-W26",
      craftCount: 20,
      qualityCount: 2,
      claimed: [],
    });
    expect(views.find((q) => q.id === "weekly_craft_20")?.canClaim).toBe(true);
    expect(views.find((q) => q.id === "weekly_quality_3")?.complete).toBe(
      false,
    );
  });

  it("increments progress and claims once", () => {
    const base = {
      weekKey: "2026-W26",
      craftCount: 0,
      qualityCount: 0,
      claimed: [],
    };
    const progressed = addGuildWorkshopWeeklyProgress(base, true);
    expect(progressed.craftCount).toBe(1);
    expect(progressed.qualityCount).toBe(1);
    expect(
      claimGuildWorkshopWeeklyQuest(progressed, "weekly_craft_20").claimed,
    ).toEqual(["weekly_craft_20"]);
  });
});
