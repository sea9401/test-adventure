import journal from "../../drizzle/meta/_journal.json";
import { describe, expect, it } from "vitest";
import {
  validateMigrationFiles,
  validateMigrationJournal,
} from "../../scripts/check-migrations.mjs";

describe("migration journal validation", () => {
  it("accepts the current journal with its fixed legacy exceptions", () => {
    expect(validateMigrationJournal(journal)).toEqual([]);
  });

  it("rejects a newly introduced non-increasing timestamp", () => {
    const entries = structuredClone(journal.entries);
    const previous = entries.at(-1)!;
    entries.push({
      idx: entries.length,
      version: previous.version,
      when: previous.when - 1,
      tag: "0126_new_out_of_order_migration",
      breakpoints: previous.breakpoints,
    });

    expect(validateMigrationJournal({ entries })).toContainEqual(
      expect.stringContaining("0126_new_out_of_order_migration"),
    );
  });

  it("detects SQL files missing from either side of the journal", () => {
    expect(
      validateMigrationFiles(
        { entries: [{ tag: "0000_first" }] },
        ["0001_untracked.sql"],
      ),
    ).toEqual(["missing 0000_first.sql", "untracked 0001_untracked.sql"]);
  });
});
