import { readdirSync, readFileSync } from "node:fs";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";
import {
  PRESERVED_TABLES,
  RESET_CONFIRMATION,
  RESET_TABLES,
  buildResetTablePlan,
  parseResetArgs,
  quoteIdentifier,
  validateTableCoverage,
} from "../../scripts/reset-game-progress-plan.mjs";

describe("reset game progress plan", () => {
  const allTables = [...PRESERVED_TABLES, ...RESET_TABLES];

  function schemaTableNames(): string[] {
    return [...new Set(
      Object.values(schema)
        .filter((value) => is(value, PgTable))
        .map((table) => getTableName(table)),
    )].sort();
  }

  function currentMigrationTableNames(): string[] {
    const tables = new Set<string>();
    const migrationFiles = readdirSync("drizzle")
      .filter((file) => /^\d{4}.*\.sql$/.test(file))
      .sort();
    for (const file of migrationFiles) {
      const migration = readFileSync(`drizzle/${file}`, "utf8");
      for (const match of migration.matchAll(
        /CREATE TABLE(?: IF NOT EXISTS)?\s+"([^"]+)"/g,
      )) {
        tables.add(match[1]);
      }
      for (const match of migration.matchAll(
        /DROP TABLE(?: IF EXISTS)?\s+"([^"]+)"/g,
      )) {
        tables.delete(match[1]);
      }
    }
    return [...tables].sort();
  }

  it("classifies every table exactly once", () => {
    expect(validateTableCoverage(allTables)).toEqual([...allTables].sort());
  });

  it("classifies every schema and current-migration table in preview and execute plans", () => {
    // Break caught: a new migration can evade the self-derived classification fixture.
    const migrationTables = currentMigrationTableNames();
    expect(schemaTableNames().filter((table) => !migrationTables.includes(table)))
      .toEqual([]);

    const preview = parseResetArgs(["--expect-database", "reset_preview"]);
    const execute = parseResetArgs([
      "--expect-database", "reset_preview",
      "--expect-users", "0",
      "--expect-auth-accounts", "0",
      "--expect-password-accounts", "0",
      "--expect-google-accounts", "0",
      "--expect-deleted-google-users", "0",
      "--expect-coupon-codes", "0",
      "--expect-inbox-rows", "0",
      "--maintenance-flag", "/tmp/maintenance.on",
      "--confirm", RESET_CONFIRMATION,
      "--execute",
    ]);
    expect(buildResetTablePlan(migrationTables, preview)).toMatchObject({
      execute: false,
      resetTables: expect.arrayContaining([
        "codex_mastery_progress",
        "codex_mastery_summary",
        "codex_trophy_history",
      ]),
    });
    expect(buildResetTablePlan(migrationTables, execute)).toMatchObject({
      execute: true,
      resetTables: expect.arrayContaining([
        "codex_mastery_progress",
        "codex_mastery_summary",
        "codex_trophy_history",
      ]),
    });
  });

  it("retains Kakao/password identity tables while resetting game and market data", () => {
    expect(PRESERVED_TABLES).toEqual(
      expect.arrayContaining(["users", "accounts", "password_credentials"]),
    );
    expect(RESET_TABLES).toContain("saves_kv");
    expect(RESET_TABLES).toEqual(expect.arrayContaining([
      "codex_mastery_progress",
      "codex_mastery_summary",
      "codex_trophy_history",
    ]));
    expect(RESET_TABLES).toEqual(
      expect.arrayContaining([
        "marketplace_bids_v2",
        "marketplace_inbox",
        "marketplace_listings_v2",
      ]),
    );
    expect(RESET_TABLES).not.toContain("password_credentials");
  });

  it("rejects unclassified and missing tables", () => {
    expect(() => validateTableCoverage([...allTables, "future_table"])).toThrow(
      /unclassified: future_table/,
    );
    expect(() => validateTableCoverage(allTables.filter((name) => name !== "users"))).toThrow(
      /missing: users/,
    );
  });

  it("escapes SQL identifiers", () => {
    expect(quoteIdentifier('odd"name')).toBe('"odd""name"');
  });

  it("defaults to a non-mutating preview", () => {
    expect(parseResetArgs(["--expect-database", "reset_preview"])).toMatchObject({
      execute: false,
      expectDatabase: "reset_preview",
    });
  });

  it("requires every destructive execution guard", () => {
    expect(() =>
      parseResetArgs([
        "--expect-database",
        "reset_preview",
        "--execute",
        "--confirm",
        RESET_CONFIRMATION,
      ]),
    ).toThrow(/maintenance-flag/);

    expect(() =>
      parseResetArgs([
        "--expect-database",
        "reset_preview",
        "--expect-users",
        "2",
        "--expect-auth-accounts",
        "2",
        "--expect-coupon-codes",
        "50",
        "--expect-inbox-rows",
        "35",
        "--maintenance-flag",
        "/tmp/maintenance.on",
        "--confirm",
        RESET_CONFIRMATION,
        "--execute",
      ]),
    ).toThrow(/expect-password-accounts/);

    expect(() =>
      parseResetArgs([
        "--expect-database",
        "reset_preview",
        "--expect-users",
        "2",
        "--expect-auth-accounts",
        "2",
        "--expect-password-accounts",
        "1",
        "--expect-google-accounts",
        "1",
        "--expect-deleted-google-users",
        "1",
        "--expect-coupon-codes",
        "50",
        "--maintenance-flag",
        "/tmp/maintenance.on",
        "--confirm",
        RESET_CONFIRMATION,
        "--execute",
      ]),
    ).toThrow(/expect-inbox-rows/);

    expect(
      parseResetArgs([
        "--expect-database",
        "reset_preview",
        "--expect-users",
        "2",
        "--expect-auth-accounts",
        "2",
        "--expect-password-accounts",
        "1",
        "--expect-google-accounts",
        "1",
        "--expect-deleted-google-users",
        "1",
        "--expect-coupon-codes",
        "50",
        "--expect-inbox-rows",
        "35",
        "--maintenance-flag",
        "/tmp/maintenance.on",
        "--confirm",
        RESET_CONFIRMATION,
        "--execute",
      ]),
    ).toMatchObject({
      execute: true,
      expectUsers: 2,
      expectAuthAccounts: 2,
      expectPasswordAccounts: 1,
      expectGoogleAccounts: 1,
      expectDeletedGoogleUsers: 1,
      expectCouponCodes: 50,
      expectInboxRows: 35,
    });
  });
});
