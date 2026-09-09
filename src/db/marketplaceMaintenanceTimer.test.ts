import { describe, expect, it } from "vitest";
import { resumeBossTimers } from "../../scripts/coop-maintenance-timer.mjs";

const start = "2026-09-09T00:00:00.000Z";
const end = "2026-09-09T00:10:00.000Z";

describe("점검 경매 시간 보존", () => {
  it("보스와 경매 연장을 한 트랜잭션으로 처리하고 두 번 실행해도 한 번만 연장한다", async () => {
    let marker = true;
    const queries: string[] = [];
    const client = { async query(sql: string) {
      queries.push(sql);
      if (sql.includes("SELECT value") && sql.includes("FOR UPDATE")) return {rowCount: marker ? 1 : 0, rows: marker ? [{value: {startedAt: start}}] : []};
      if (sql.includes("UPDATE marketplace_listings_v2")) return {rowCount: 3, rows: []};
      if (sql.includes("DELETE FROM ops_settings")) marker = false;
      return {rowCount: 0, rows: []};
    }};
    expect(await resumeBossTimers(client, new Date(end))).toMatchObject({extendedAuctions: 3});
    await resumeBossTimers(client, new Date(end));
    const updates = queries.filter(q => q.includes("UPDATE marketplace_listings_v2"));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain("bid_ends_at > pause.started_at");
    expect(updates[0]).toContain("bid_resolved_at IS NULL");
    expect(updates[0]).toContain("GREATEST(pause.started_at, listing.created_at)");
    expect(updates[0]).toContain("expires_at = listing.expires_at + eligible.paused_for");
  });
  it("경매 연장에 실패하면 점검 기록 삭제 전에 전체를 롤백한다", async () => {
    const queries: string[] = [];
    const client = { async query(sql: string) {
      queries.push(sql);
      if (sql.includes("SELECT value") && sql.includes("FOR UPDATE")) return {rowCount: 1, rows: [{value: {startedAt: start}}]};
      if (sql.includes("UPDATE marketplace_listings_v2")) throw new Error("DB failure");
      return {rowCount: 0, rows: []};
    }};
    await expect(resumeBossTimers(client, new Date(end))).rejects.toThrow("DB failure");
    expect(queries.at(-1)).toBe("ROLLBACK");
    expect(queries.some(q => q.includes("DELETE FROM ops_settings"))).toBe(false);
  });
});
