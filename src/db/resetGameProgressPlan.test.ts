import { describe, expect, it } from "vitest";
import {
  PARTIAL_RESET_TABLES,
  PRESERVED_TABLES,
  RESET_CONFIRMATION,
  RESET_TABLES,
  parseResetArgs,
  quoteIdentifier,
  validateTableCoverage,
} from "../../scripts/reset-game-progress-plan.mjs";

describe("reset game progress plan", () => {
  const allTables = [...PRESERVED_TABLES, ...RESET_TABLES, ...PARTIAL_RESET_TABLES];

  it("classifies every table exactly once", () => {
    expect(validateTableCoverage(allTables)).toEqual([...allTables].sort());
  });

  it("resets v2 marketplace listings and their bid history", () => {
    expect(RESET_TABLES).toEqual(
      expect.arrayContaining(["marketplace_bids_v2", "marketplace_listings_v2"]),
    );
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

    expect(
      parseResetArgs([
        "--expect-database",
        "reset_preview",
        "--expect-users",
        "2",
        "--expect-coupon-codes",
        "50",
        "--expect-coupon-notices",
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
      expectCouponCodes: 50,
      expectCouponNotices: 35,
    });
  });
});
