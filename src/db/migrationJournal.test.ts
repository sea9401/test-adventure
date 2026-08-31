import journal from "../../drizzle/meta/_journal.json";
import { describe, expect, it } from "vitest";
import {
  validateDangerousMigrations,
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

  it("rejects a new DROP TABLE or DROP COLUMN without an explicit reason", () => {
    const entries = structuredClone(journal.entries);
    entries.push({
      idx: entries.length,
      version: "7",
      when: entries.at(-1)!.when + 1,
      tag: "0165_remove_legacy_data",
      breakpoints: true,
    });

    expect(
      validateDangerousMigrations(
        { entries },
        {
          "0165_remove_legacy_data.sql":
            'DROP TABLE "legacy_events";\nALTER TABLE "users" DROP COLUMN "legacy_flag";',
        },
      ),
    ).toEqual([
      expect.stringContaining("0165_remove_legacy_data"),
    ]);
  });

  it("accepts a reviewed destructive migration with a meaningful reason", () => {
    const entries = structuredClone(journal.entries);
    entries.push({
      idx: entries.length,
      version: "7",
      when: entries.at(-1)!.when + 1,
      tag: "0165_remove_legacy_data",
      breakpoints: true,
    });

    expect(
      validateDangerousMigrations(
        { entries },
        {
          "0165_remove_legacy_data.sql":
            "-- ops: allow-destructive reason=expand-contract 완료 후 레거시 이벤트 제거\n" +
            'DROP TABLE "legacy_events";',
        },
      ),
    ).toEqual([]);
  });

  it("does not treat comments or historical destructive migrations as new risks", () => {
    const entries = structuredClone(journal.entries);
    entries.push({
      idx: entries.length,
      version: "7",
      when: entries.at(-1)!.when + 1,
      tag: "0165_document_cleanup",
      breakpoints: true,
    });

    expect(
      validateDangerousMigrations(
        { entries },
        {
          "0067_drop_fiefdom_tables.sql": 'DROP TABLE "fiefdoms";',
          "0165_document_cleanup.sql":
            "-- DROP TABLE은 이전 절차 설명에만 등장합니다.\nSELECT 'DROP COLUMN is text';",
        },
      ),
    ).toEqual([]);
  });
});
