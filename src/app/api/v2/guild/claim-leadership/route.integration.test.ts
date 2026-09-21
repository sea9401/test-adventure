import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const harness = vi.hoisted(() => ({
  db: null as ReturnType<typeof drizzle> | null,
  user: vi.fn(),
}));
vi.mock("@/db", () => ({ db: {
  transaction: (run: Parameters<ReturnType<typeof drizzle>["transaction"]>[0]) => harness.db!.transaction(run),
} }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: harness.user }));
vi.mock("@/lib/server/resolveActor", () => ({
  resolveActor: async () => ({ name: "승계자", className: "모험가", title: null }),
}));
import { POST } from "./route";

// Dedicated test DB only. Tables live in a unique schema, removed after the suite.
const databaseUrl = process.env.GUILD_LEADERSHIP_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
integration("길드장 승계 PostgreSQL 트랜잭션", () => {
  const schema = `guild_claim_${process.pid}`;
  const admin = new Pool({ connectionString: databaseUrl });
  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema} -c statement_timeout=5000`,
    application_name: schema,
  });
  const request = (expectedMasterId = "old-master") => new Request("http://test", {
    method: "POST", body: JSON.stringify({ expectedMasterId }),
  });

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    // Minimal real tables for the route and its real activity writer.
    await pool.query(`
      CREATE TABLE guilds (id int PRIMARY KEY, master_id text NOT NULL, disbanded_at timestamp);
      CREATE TABLE guild_members (guild_id int REFERENCES guilds(id), user_id text UNIQUE, role text NOT NULL, PRIMARY KEY (guild_id, user_id));
      CREATE TABLE presence (user_id text PRIMARY KEY, name text NOT NULL, class_name text NOT NULL, title text, last_seen_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE guild_activity_log (id serial PRIMARY KEY, guild_id int NOT NULL, type text NOT NULL, actor_user_id text, target_user_id text, meta jsonb, created_at timestamp NOT NULL DEFAULT now());
    `);
    harness.db = drizzle(pool);
  });
  beforeEach(async () => {
    harness.user.mockReset().mockResolvedValue("applicant");
    await pool.query(`
      TRUNCATE guild_members, guilds, presence, guild_activity_log;
      INSERT INTO guilds VALUES (7, 'old-master', NULL);
      INSERT INTO guild_members VALUES (7, 'old-master', 'master'), (7, 'applicant', 'member'), (7, 'second', 'manager');
      INSERT INTO presence (user_id, name, class_name, last_seen_at) VALUES
        ('old-master', '전임자', '모험가', now() - interval '4 days'),
        ('applicant', '승계자', '모험가', now() - interval '4 days');
    `);
  });
  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });

  // Wait on PostgreSQL's actual lock state, without relying on arbitrary sleeps.
  async function waitForBlockedQuery() {
    await vi.waitFor(async () => {
      const result = await admin.query(
        "SELECT pid FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'",
        [schema],
      );
      expect(result.rowCount).toBeGreaterThan(0);
    }, { timeout: 3000, interval: 10 });
  }

  it("동시 신청 중 하나만 성공하고 새 길드장은 곧바로 다시 승계할 수 없다", async () => {
    harness.user.mockResolvedValueOnce("applicant").mockResolvedValueOnce("second");
    const responses = await Promise.all([POST(request()), POST(request())]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const { rows: [guild] } = await pool.query("SELECT master_id FROM guilds WHERE id = 7");
    const { rows: members } = await pool.query("SELECT user_id, role FROM guild_members ORDER BY user_id");
    expect(members.filter((m) => m.role === "master")).toEqual([{ user_id: guild.master_id, role: "master" }]);
    expect(members.find((m) => m.user_id === "old-master")?.role).toBe("member");
    expect((await pool.query("SELECT * FROM guild_activity_log")).rowCount).toBe(1);
    harness.user.mockResolvedValue(guild.master_id === "applicant" ? "second" : "applicant");
    const retry = await POST(request(guild.master_id));
    expect(retry.status).toBe(409);
    expect(await retry.json()).toMatchObject({ error: "master_active" });
  });

  it("접속 갱신이 진행 중이면 기다린 뒤 복귀한 길드장의 승계를 막는다", async () => {
    const connection = await pool.connect();
    let pending: Promise<Response> | undefined;
    try {
      await connection.query("BEGIN");
      await connection.query("UPDATE presence SET last_seen_at = now() WHERE user_id = 'old-master'");
      pending = POST(request());
      await waitForBlockedQuery();
      await connection.query("COMMIT");
      const response = await pending;
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "master_active" });
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
      await pending;
    }
  });

  it("길드 잠금 대기 중 추방되면 승계를 거절한다", async () => {
    const connection = await pool.connect();
    let pending: Promise<Response> | undefined;
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT id FROM guilds WHERE id = 7 FOR UPDATE");
      pending = POST(request());
      await waitForBlockedQuery();
      await connection.query("DELETE FROM guild_members WHERE user_id = 'applicant'");
      await connection.query("COMMIT");
      const response = await pending;
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "no_guild" });
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
      await pending;
    }
  });

  it("활동 기록 저장 실패 시 역할과 접속 기록 변경도 전부 롤백한다", async () => {
    await pool.query("ALTER TABLE guild_activity_log ADD CONSTRAINT reject_claim CHECK (type <> 'leadership_claim')");
    try {
      await expect(POST(request())).rejects.toThrow();
      expect((await pool.query("SELECT master_id FROM guilds WHERE id = 7")).rows[0].master_id).toBe("old-master");
      expect((await pool.query("SELECT user_id FROM guild_members WHERE role = 'master'")).rows).toEqual([{ user_id: "old-master" }]);
      expect((await pool.query("SELECT user_id FROM presence WHERE last_seen_at > now() - interval '3 days'")).rowCount).toBe(0);
      expect((await pool.query("SELECT * FROM guild_activity_log")).rowCount).toBe(0);
    } finally {
      await pool.query("ALTER TABLE guild_activity_log DROP CONSTRAINT reject_claim");
    }
  });
});
