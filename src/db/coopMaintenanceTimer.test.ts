import { describe, expect, it } from "vitest";
import {
  coopBossPauseMilliseconds,
  parseMaintenanceTimestamp,
  resumeBossTimers,
} from "../../scripts/coop-maintenance-timer.mjs";

const STARTED_AT = "2026-08-04T01:00:00.000Z";
const RESUMED_AT = "2026-08-04T01:30:00.000Z";

describe("coop maintenance timer", () => {
  it("pauses an already-active boss for the full maintenance window", () => {
    expect(
      coopBossPauseMilliseconds({
        startedAt: STARTED_AT,
        resumedAt: RESUMED_AT,
        spawnedAt: "2026-08-04T00:00:00.000Z",
        expiresAt: "2026-08-04T02:00:00.000Z",
      }),
    ).toBe(30 * 60 * 1_000);
  });

  it("only pauses a boss spawned after maintenance began from its spawn time", () => {
    expect(
      coopBossPauseMilliseconds({
        startedAt: STARTED_AT,
        resumedAt: RESUMED_AT,
        spawnedAt: "2026-08-04T01:10:00.000Z",
        expiresAt: "2026-08-04T01:20:00.000Z",
      }),
    ).toBe(20 * 60 * 1_000);
  });

  it("does not revive bosses expired before maintenance or already defeated", () => {
    const base = {
      startedAt: STARTED_AT,
      resumedAt: RESUMED_AT,
      spawnedAt: "2026-08-03T23:00:00.000Z",
      expiresAt: "2026-08-04T00:59:59.999Z",
    };
    expect(coopBossPauseMilliseconds(base)).toBe(0);
    expect(
      coopBossPauseMilliseconds({
        ...base,
        expiresAt: "2026-08-04T02:00:00.000Z",
        defeatedAt: "2026-08-04T01:05:00.000Z",
      }),
    ).toBe(0);
  });

  it("does not add time when maintenance is resumed twice", () => {
    expect(
      coopBossPauseMilliseconds({
        startedAt: RESUMED_AT,
        resumedAt: RESUMED_AT,
        spawnedAt: "2026-08-04T00:00:00.000Z",
        expiresAt: "2026-08-04T02:00:00.000Z",
      }),
    ).toBe(0);
  });

  it("consumes the DB pause marker transactionally so resume is idempotent", async () => {
    let markerExists = true;
    let extensionQueries = 0;
    let extensionSql = "";
    const client = {
      async query(sql: string) {
        if (sql.includes("SELECT value") && sql.includes("FOR UPDATE")) {
          return markerExists
            ? { rowCount: 1, rows: [{ value: { startedAt: STARTED_AT } }] }
            : { rowCount: 0, rows: [] };
        }
        if (sql.includes("WITH pause AS")) {
          extensionQueries += 1;
          extensionSql = sql;
          return { rowCount: 2, rows: [{ id: "boss-1" }, { id: "boss-2" }] };
        }
        if (sql.includes("DELETE FROM ops_settings")) markerExists = false;
        return { rowCount: 0, rows: [] };
      },
    };

    const first = await resumeBossTimers(client, new Date(RESUMED_AT));
    const second = await resumeBossTimers(client, new Date(RESUMED_AT));

    expect(first).toEqual({
      resumed: true,
      extendedBosses: 2,
      pausedMilliseconds: 30 * 60 * 1_000,
    });
    expect(second).toEqual({
      resumed: false,
      extendedBosses: 0,
      pausedMilliseconds: 0,
    });
    expect(extensionQueries).toBe(1);
    expect(extensionSql).toContain("last_regen_at");
  });

  it("rejects invalid timestamps", () => {
    expect(() => parseMaintenanceTimestamp("not-a-date")).toThrow(
      "must be a valid ISO timestamp",
    );
  });
});
