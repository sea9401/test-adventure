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
  seals: {},
});

describe("codex mastery catalog", () => {
  it("provides immutable keyed lookup and deterministic category lists", () => {
    const catalog = createCodexMasteryCatalog([
      definition("fish:b"),
      definition("fish:a"),
    ]);
    expect(catalog.get("fish", "fish:a")?.label).toBe("fish:a");
    expect(catalog.list("fish").map((entry) => entry.entryId)).toEqual([
      "fish:a", "fish:b",
    ]);
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
