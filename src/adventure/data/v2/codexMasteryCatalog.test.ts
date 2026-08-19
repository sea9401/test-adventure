import { describe, expect, it } from "vitest";
import {
  codexMasteryBudgetReport,
  createCodexMasteryCatalog,
} from "./codexMasteryCatalog";
import type { CodexMasteryEntryDefinition } from "./codexMasteryTypes";

const definition = (entryId: string): CodexMasteryEntryDefinition => ({
  category: "fish",
  entryId,
  label: entryId,
  thresholds: {
    bronze: 5, silver: 30, gold: 150,
    platinum: 500, diamond: 1_500, legendary: 5_000,
  },
  scoreWeightMilli: 1_000,
  seals: { giant: { pointUnits: 4 } },
});

describe("codex mastery catalog", () => {
  it("provides immutable keyed lookup and deterministic category lists", () => {
    const sourceDefinition = definition("fish:a");
    const catalog = createCodexMasteryCatalog([
      definition("fish:b"),
      sourceDefinition,
    ]);
    const storedDefinition = catalog.get("fish", "fish:a");
    expect(storedDefinition?.label).toBe("fish:a");
    expect(catalog.list("fish").map((entry) => entry.entryId)).toEqual([
      "fish:a", "fish:b",
    ]);
    expect(Object.isFrozen(storedDefinition)).toBe(true);
    expect(Object.isFrozen(storedDefinition?.thresholds)).toBe(true);
    expect(Object.isFrozen(storedDefinition?.seals)).toBe(true);
    expect(Object.isFrozen(storedDefinition?.seals.giant)).toBe(true);
    expect(Object.isFrozen(catalog.list("fish"))).toBe(true);
    expect(Object.isFrozen(catalog.list())).toBe(true);

    sourceDefinition.label = "mutated label";
    sourceDefinition.thresholds.bronze = 999;
    sourceDefinition.seals.giant.pointUnits = 2;
    expect(catalog.get("fish", "fish:a")).toMatchObject({
      label: "fish:a",
      thresholds: { bronze: 5 },
      seals: { giant: { pointUnits: 4 } },
    });
  });

  it("rejects duplicate category/entry keys", () => {
    expect(() => createCodexMasteryCatalog([
      definition("fish:a"), definition("fish:a"),
    ])).toThrow("duplicate codex mastery entry");
  });

  it("reports legendary standard-stage budget without seal points", () => {
    const report = codexMasteryBudgetReport(
      createCodexMasteryCatalog([definition("fish:a")]),
    );
    expect(report.fish).toEqual({ entries: 1, scoreMilli: 22_000 });
  });
});
