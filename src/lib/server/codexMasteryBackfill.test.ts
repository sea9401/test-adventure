import { describe, expect, it } from "vitest";
import { emptyCodexMasteryProgress } from "@/adventure/data/v2/codexMastery";
import { CODEX_MASTERY_CATALOG } from "@/adventure/data/v2/codexMasteryProductionCatalog";
import {
  deriveCodexMasteryBackfillTargets,
  previewCodexMasteryBackfill,
  type CodexMasteryBackfillSource,
} from "./codexMasteryBackfill";

const source = (): CodexMasteryBackfillSource => ({
  fishingCodex: {
    fish: {
      carp: {
        registered: true,
        caughtEver: true,
        totalCaught: 30,
        bestSize: 82,
        firstCaughtAt: Date.parse("2026-01-01T00:00:00.000Z"),
        bestCaughtAt: Date.parse("2026-02-01T00:00:00.000Z"),
      },
      forged_fish: { registered: true, totalCaught: 999_999 },
    },
  },
  adventureLog: {
    monsters: {
      "멧토끼": { encountered: true, kills: 12 },
      "없는 몬스터": { encountered: true, kills: 999_999 },
    },
  },
  equipmentCodex: {
    registeredIds: ["v2_iron_sword", "forged_equipment"],
  },
  cooking: {
    discoveredRecipeIds: ["rustic_bread", "forged_recipe"],
  },
  lifeFieldRecords: {
    version: 1,
    records: {
      "region:fishing:village_pier": { count: 100, firstAt: 1, lastAt: 2 },
      "environment:fishing_active_school": { count: 50, firstAt: 1, lastAt: 2 },
      "discovery:fishing_migrating_school": { count: 3, firstAt: 1, lastAt: 2 },
      forged_record: { count: 999_999, firstAt: 1, lastAt: 2 },
    },
  },
  proficiency: {
    groups: { warrior: { tier: 1, cultivations: 0, cumLevel: 60 } },
    jobCumLevel: { squire: 300, forged_job: 999_999 },
    masteryScaleVersion: 2,
    growthScaleVersion: 1,
  },
});

describe("codex mastery historical backfill", () => {
  it("derives only authoritative absolute targets from legacy saves", () => {
    // Break caught: unknown IDs or global totals are guessed into permanent mastery progress.
    const targets = deriveCodexMasteryBackfillTargets(source());
    const byKey = new Map(
      targets.map((target) => [`${target.category}:${target.entryId}`, target]),
    );

    expect(byKey.get("fish:carp")).toMatchObject({
      targetCount: 30,
      discovered: true,
      bestValue: 82,
    });
    expect(byKey.get("monster:박쥐")).toMatchObject({
      targetCount: 12,
      discovered: true,
    });
    expect(byKey.get("equipment:v2_iron_sword")).toMatchObject({
      targetCount: 0,
      discovered: true,
    });
    expect(byKey.get("cooking:rustic_bread")).toMatchObject({
      targetCount: 0,
      discovered: true,
    });
    expect(byKey.get("life:region:fishing:village_pier")).toMatchObject({
      targetCount: 100,
      discovered: true,
    });
    expect(byKey.get("life:discovery:fishing_migrating_school")).toMatchObject({
      targetCount: 3,
      discovered: true,
    });
    expect(byKey.get("job:warrior")).toMatchObject({
      targetCount: 60,
      discovered: true,
    });
    expect(byKey.get("job:squire")).toMatchObject({
      targetCount: 300,
      discovered: true,
    });
    expect([...byKey.keys()].some((key) => key.includes("forged"))).toBe(false);
  });

  it("does not guess distinct observation days from an old environment count", () => {
    // Break caught: legacy per-action counts are treated as distinct KST days and over-award tiers.
    const environment = deriveCodexMasteryBackfillTargets(source()).find(
      (target) => target.entryId === "environment:fishing_active_school",
    );
    expect(environment).toMatchObject({
      category: "life",
      targetCount: 0,
      discovered: true,
    });
  });

  it("previews only positive deltas over already-recorded progress", () => {
    // Break caught: dry-run reports the full historical target instead of the apply-time delta.
    const existingFish = {
      ...emptyCodexMasteryProgress("fish", "carp"),
      count: 5,
      bestValue: 90,
      currentTier: "bronze" as const,
      scoreMilli: CODEX_MASTERY_CATALOG.get("fish", "carp")!.scoreWeightMilli * 2,
      tierAchievedAt: {},
    };
    const preview = previewCodexMasteryBackfill(
      deriveCodexMasteryBackfillTargets(source()),
      [existingFish],
      new Date("2026-08-20T00:00:00.000Z"),
    );
    const fish = preview.entries.find(
      (entry) => entry.category === "fish" && entry.entryId === "carp",
    );

    expect(fish).toMatchObject({
      previousCount: 5,
      targetCount: 30,
      nextCount: 30,
      newStages: ["silver"],
    });
    expect(fish?.nextBestValue).toBe(90);
    expect(preview.changedEntries).toBeGreaterThan(0);
    expect(preview.scoreDeltaMilli).toBeGreaterThan(0);
  });

  it("returns deterministic catalog order and no changes for empty sources", () => {
    const targets = deriveCodexMasteryBackfillTargets(source());
    expect(targets).toEqual([...targets].sort((left, right) =>
      left.category.localeCompare(right.category) ||
      left.entryId.localeCompare(right.entryId),
    ));

    expect(previewCodexMasteryBackfill(
      deriveCodexMasteryBackfillTargets({}),
      [],
      new Date("2026-08-20T00:00:00.000Z"),
    )).toMatchObject({
      entries: [],
      changedEntries: 0,
      scoreDeltaMilli: 0,
    });
  });
});
