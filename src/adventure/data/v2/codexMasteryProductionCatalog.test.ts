import { describe, expect, it } from "vitest";
import { FISH_IDS } from "./fish";
import { V2_EQUIPMENT } from "./v2Equipment";
import { MAX_FRONTIER_DEPTH, dungeonThemeCatalog } from "./dungeon";
import { V2_JOB_LIST } from "./v2JobCatalog";
import { COOKING_PUBLIC_RECIPES } from "@/adventure/v2/cooking/catalog";
import { LIFE_FIELD_RECORD_CATALOG } from "@/adventure/v2/lifeFieldRecords";
import {
  CODEX_MASTERY_BUDGET_REPORT,
  CODEX_MASTERY_CATALOG,
  CODEX_MASTERY_CATALOG_VERSION,
  CODEX_MASTERY_MONSTER_NAME_TO_ENTRY_ID,
} from "./codexMasteryProductionCatalog";

const ids = (category: Parameters<typeof CODEX_MASTERY_CATALOG.list>[0]) =>
  CODEX_MASTERY_CATALOG.list(category).map((entry) => entry.entryId);

describe("production codex mastery catalog", () => {
  it("includes trainable tier-zero jobs while excluding the unadvanced adventurer", () => {
    expect(CODEX_MASTERY_CATALOG.get("job", "survivor")?.label).toBe("생존자");
    expect(CODEX_MASTERY_CATALOG.get("job", "mutant")?.label).toBe("변이자");
    expect(CODEX_MASTERY_CATALOG.get("job", "none")).toBeNull();
  });

  it("covers every authoritative version-1 source entry exactly once", () => {
    const monsterIds = [
      ...new Set(
        dungeonThemeCatalog(MAX_FRONTIER_DEPTH).flatMap((theme) =>
          theme.enemies.map((enemy) => enemy.key),
        ),
      ),
    ].sort();

    expect(CODEX_MASTERY_CATALOG_VERSION).toBe(1);
    expect(ids("fish")).toEqual([...FISH_IDS].sort());
    expect(ids("monster")).toEqual(monsterIds);
    expect(ids("equipment")).toEqual(Object.keys(V2_EQUIPMENT).sort());
    expect(ids("cooking")).toEqual(COOKING_PUBLIC_RECIPES.map((recipe) => recipe.id).sort());
    expect(ids("life")).toEqual(LIFE_FIELD_RECORD_CATALOG.map((entry) => entry.id).sort());
    expect(ids("job")).toEqual(
      V2_JOB_LIST.filter((job) => job.id !== "none").map((job) => job.id).sort(),
    );
  });

  it("uses the approved count thresholds for representative profiles", () => {
    expect(CODEX_MASTERY_CATALOG.get("fish", "crucian_carp")?.thresholds).toEqual({
      bronze: 5, silver: 30, gold: 150, platinum: 500, diamond: 1_500, legendary: 5_000,
    });
    expect(CODEX_MASTERY_CATALOG.get("fish", "platinum_carp")?.thresholds).toEqual({
      bronze: 1, silver: 3, gold: 10, platinum: 20, diamond: 50, legendary: 100,
    });
    expect(CODEX_MASTERY_CATALOG.get("job", "warrior")?.thresholds).toEqual({
      bronze: 50, silver: 250, gold: 1_000, platinum: 2_500, diamond: 5_000, legendary: 10_000,
    });

    const environment = LIFE_FIELD_RECORD_CATALOG.find((entry) => entry.kind === "environment")!;
    expect(CODEX_MASTERY_CATALOG.get("life", environment.id)?.thresholds).toEqual({
      bronze: 1, silver: 5, gold: 15, platinum: 30, diamond: 60, legendary: 120,
    });
    const rareDiscovery = LIFE_FIELD_RECORD_CATALOG.find(
      (entry) => entry.kind === "discovery" && entry.rare,
    )!;
    expect(CODEX_MASTERY_CATALOG.get("life", rareDiscovery.id)?.thresholds).toEqual({
      bronze: 1, silver: 2, gold: 3, platinum: 5, diamond: 10, legendary: 20,
    });
  });

  it("keeps published mastery rules for recipes that survived the cooking overhaul", () => {
    expect(CODEX_MASTERY_CATALOG.get("cooking", "egg_salad_sandwich")).toMatchObject({
      thresholds: {
        bronze: 1,
        silver: 10,
        gold: 50,
        platinum: 100,
        diamond: 250,
        legendary: 500,
      },
      scoreWeightMilli: 10_101,
      compatibleScoreWeightsMilli: [4_545],
    });
  });

  it("keeps published v1 weights stable while category catalogs grow", () => {
    for (const [category, report] of Object.entries(CODEX_MASTERY_BUDGET_REPORT)) {
      if (category === "job" || category === "cooking") continue;
      expect(report.scoreMilli).toBeGreaterThanOrEqual(9_900_000);
      expect(report.scoreMilli).toBeLessThanOrEqual(10_100_000);
      expect(report.entries).toBeGreaterThan(0);
    }

    const jobEntries = V2_JOB_LIST.filter((job) => job.id !== "none").length;
    expect(CODEX_MASTERY_CATALOG.get("job", "warrior")).toMatchObject({
      scoreWeightMilli: 3_392,
      compatibleScoreWeightsMilli: [3_294],
    });
    expect(CODEX_MASTERY_BUDGET_REPORT.job).toEqual({
      entries: jobEntries,
      scoreMilli: jobEntries * 22 * 3_392,
    });
    expect(CODEX_MASTERY_BUDGET_REPORT.cooking).toEqual({
      entries: COOKING_PUBLIC_RECIPES.length,
      scoreMilli: COOKING_PUBLIC_RECIPES.length * 22 * 10_101,
    });
  });

  it("maps legacy monster display names to one stable mastery entry", () => {
    expect(CODEX_MASTERY_MONSTER_NAME_TO_ENTRY_ID.get("멧토끼")).toBe("박쥐");
    expect(new Set(CODEX_MASTERY_MONSTER_NAME_TO_ENTRY_ID.values()).size).toBe(
      CODEX_MASTERY_CATALOG.list("monster").length,
    );
  });

  it("freezes generated definitions and exposes server-provable seals", () => {
    const fish = CODEX_MASTERY_CATALOG.get("fish", "crucian_carp")!;
    expect(Object.isFrozen(fish)).toBe(true);
    const job = CODEX_MASTERY_CATALOG.get("job", "warrior")!;
    expect(Object.isFrozen(job.compatibleScoreWeightsMilli)).toBe(true);
    expect(Object.keys(fish.seals)).toEqual([
      "giant", "legendary_print", "night_catch",
    ]);
    expect(CODEX_MASTERY_CATALOG.get("cooking", "rustic_bread")?.seals).toMatchObject({
      careful: { pointUnits: 2 },
      masterpiece: { pointUnits: 4 },
    });
  });
});
