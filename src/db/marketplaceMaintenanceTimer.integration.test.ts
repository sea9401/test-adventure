import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { recordPauseStart, resumeBossTimers } from "../../scripts/coop-maintenance-timer.mjs";

// 전용 로컬 DB만 사용한다. 모든 표는 세션 TEMP TABLE이라 다른 데이터에 닿지 않는다.
const connectionString = process.env.MAINTENANCE_TEST_DATABASE_URL;
describe.skipIf(!connectionString)("PostgreSQL 경매 점검 시간 보존", () => {
  let client: pg.Client;
  const start = "2026-09-09T00:00:00.000Z";
  const end = new Date("2026-09-09T00:10:00.000Z");
  beforeAll(async () => {
    client = new pg.Client({connectionString});
    await client.connect();
    await client.query("SET TIME ZONE 'Asia/Seoul'");
    await client.query(`
      CREATE TEMP TABLE ops_settings (key text PRIMARY KEY, value jsonb, updated_by_email text, updated_at timestamptz);
      CREATE TEMP TABLE coop_boss_sessions (id text PRIMARY KEY, spawned_at timestamp, expires_at timestamp, defeated_at timestamp, last_regen_at timestamp);
      CREATE TEMP TABLE marketplace_listings_v2 (id integer PRIMARY KEY, status text DEFAULT 'active', auction_mode_version integer DEFAULT 1, bid_resolved_at timestamp, created_at timestamp, bid_ends_at timestamp, expires_at timestamp);
    `);
  });
  afterAll(async () => { await client?.end(); });
  it("점검 시작 전 남은 시간을 복원하며 종료된 경매를 되살리지 않는다", async () => {
    await client.query(`INSERT INTO marketplace_listings_v2 (id, created_at, bid_ends_at, expires_at) VALUES
      (1, '2026-09-08 23:00', '2026-09-09 00:01', '2026-09-09 00:01:00.001'),
      (2, '2026-09-08 23:00', '2026-09-09 00:00', '2026-09-09 00:00:00.001'),
      (3, '2026-09-09 00:04', '2026-09-09 00:05', '2026-09-09 00:05:00.001'),
      (4, '2026-09-08 23:00', '2026-09-09 00:05', '2026-09-09 00:05:00.001'),
      (5, '2026-09-08 23:00', '2026-09-09 00:05', '2026-09-09 00:05:00.001');
      UPDATE marketplace_listings_v2 SET status = 'sold' WHERE id = 4;
      UPDATE marketplace_listings_v2 SET bid_resolved_at = '2026-09-09 00:01' WHERE id = 5;
    `);
    await recordPauseStart(client, start);
    await recordPauseStart(client, "2026-09-09T00:02:00Z");
    const result = await resumeBossTimers(client, end);
    expect(result.extendedAuctions).toBe(2);
    const rows = (await client.query(`SELECT id, to_char(bid_ends_at, 'HH24:MI:SS.MS') AS deadline,
       extract(epoch from expires_at - bid_ends_at) AS gap FROM marketplace_listings_v2 ORDER BY id`)).rows;
    expect(rows.map(r => r.deadline)).toEqual(["00:11:00.000", "00:00:00.000", "00:11:00.000", "00:05:00.000", "00:05:00.000"]);
    expect(rows.every(r => Number(r.gap) === 0.001)).toBe(true);
    expect((await resumeBossTimers(client, end)).resumed).toBe(false);
  });
  it("연장 실패 시 보스 연장도 롤백하고 일시정지 기록을 보존한다", async () => {
    await client.query("TRUNCATE marketplace_listings_v2, coop_boss_sessions");
    await client.query(`INSERT INTO coop_boss_sessions VALUES ('boss', '2026-09-08 23:00', '2026-09-09 00:30', NULL, NULL)`);
    await recordPauseStart(client, start);
    await client.query("ALTER TABLE marketplace_listings_v2 RENAME TO unavailable_auctions");
    await expect(resumeBossTimers(client, end)).rejects.toThrow();
    expect((await client.query("SELECT count(*) FROM ops_settings")).rows[0].count).toBe("1");
    expect((await client.query("SELECT to_char(expires_at, 'HH24:MI') AS expiry FROM coop_boss_sessions")).rows[0].expiry).toBe("00:30");
    await client.query("ALTER TABLE unavailable_auctions RENAME TO marketplace_listings_v2");
    expect((await resumeBossTimers(client, end)).extendedBosses).toBe(1);
  });
});
