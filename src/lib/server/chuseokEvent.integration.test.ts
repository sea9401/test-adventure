import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { readFile } from "node:fs/promises";
import { createChuseokEventService } from "./chuseokEvent";
import { lockSaveForUpdate } from "./savesKv";
import type { GuildRaidBattleResult } from "./guildRaidBattle";

const url = process.env.CHUSEOK_TEST_DATABASE_URL;
describe.skipIf(!url)("추석 이벤트 PostgreSQL 트랜잭션", () => {
  const pool = new Pool({ connectionString: url });
  let now = Date.parse("2026-09-22T18:00:00+09:00");
  let damage = 60_000_000;
  let start: string | undefined = "2026-09-22T18:00:00+09:00";
  const service = createChuseokEventService({
    database: drizzle(pool), now: () => now, startsAt: () => start,
    simulate: async ({ tx, userId }) => {
      await lockSaveForUpdate(tx, userId, "character.v2", {});
      return { damageDealt: damage, replay: {}, playerName: userId, damageTaken: 0, diedEarly: false, turns: 10 } as GuildRaidBattleResult;
    },
  });
  beforeEach(async () => {
    // This suite requires a dedicated local test database, never a deployed DB.
    if (!url || new URL(url).pathname !== "/chuseok_test" || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("dedicated local chuseok_test database required");
    await pool.query("DELETE FROM chuseok_events");
    await pool.query("DELETE FROM users WHERE id IN ('chuseok-a', 'chuseok-b', 'chuseok-c')");
    for (const id of ["chuseok-a", "chuseok-b", "chuseok-c"]) {
      await pool.query("INSERT INTO users(id,email) VALUES ($1,$2)", [id, `${id}@test.invalid`]);
      await pool.query("INSERT INTO saves_kv(user_id,key,value) VALUES ($1,'character.v2','{}'),($1,'character-profile.v2', $2)", [id, { name: id, gender: "male1" }]);
    }
    now = Date.parse("2026-09-22T18:00:00+09:00");
    damage = 60_000_000;
    start = "2026-09-22T18:00:00+09:00";
  });
  afterAll(async () => { await pool.end(); });

  it("동시 첫 출석 요청 중 한 번만 회복약을 지급한다", async () => {
    const results = await Promise.all([service.attend("chuseok-a"), service.attend("chuseok-a")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await pool.query("SELECT value FROM saves_kv WHERE user_id='chuseok-a' AND key='stamina-potions.v1'")).rows[0].value.count).toBe(5);
    now = Date.parse("2026-09-23T00:00:00+09:00");
    expect(await service.attend("chuseok-a")).toMatchObject({ ok: true, reward: 5 });
  });
  it.each([
    { attackDamage: 60_000_000, remainingHp: 480_000_000 },
    { attackDamage: 100_000_000, remainingHp: 400_000_000 },
  ])("동시 첫 공격 $attackDamage 피해를 합치고 출석만 한 사용자를 제외한 참여자 모두에게 보상한다", async ({ attackDamage, remainingHp }) => {
    damage = attackDamage;
    await service.attend("chuseok-c");
    const results = await Promise.all([service.attack("chuseok-a", "request-a"), service.attack("chuseok-b", "request-b")]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await service.read("chuseok-a")).raid).toMatchObject({ stage: 2, hp: remainingHp, myDamage: attackDamage, participantCount: 2 });
    expect((await pool.query("SELECT user_id, payload->>'staminaPotions' AS count FROM marketplace_inbox ORDER BY user_id")).rows).toEqual([{ user_id: "chuseok-a", count: "15" }, { user_id: "chuseok-b", count: "15" }]);
  });
  it("같은 공격 재시도는 피해·횟수·우편을 중복 반영하지 않는다", async () => {
    damage = 600_000_000;
    const results = await Promise.all([service.attack("chuseok-a", "request-a"), service.attack("chuseok-a", "request-a")]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toMatchObject({ ok: true, stagesCleared: 2, stage: 3, hp: 1_000_000_000 });
    expect((await service.read("chuseok-a")).raid.attacksRemaining).toBe(2);
    expect((await pool.query("SELECT payload->>'staminaPotions' AS count FROM marketplace_inbox")).rows).toEqual([{ count: "30" }]);
  });
  it("늦게 참여한 유저도 이전 단계와 이번 공격으로 처치한 단계 보상을 모두 받는다", async () => {
    damage = 100_000_000;
    await service.attack("chuseok-a", "request-a");
    damage = 500_000_000;
    await service.attack("chuseok-b", "request-b");
    expect((await pool.query("SELECT user_id, SUM((payload->>'staminaPotions')::int)::int AS count FROM marketplace_inbox GROUP BY user_id ORDER BY user_id")).rows).toEqual([{ user_id: "chuseok-a", count: 30 }, { user_id: "chuseok-b", count: 30 }]);
  });
  it("새 처치 없는 동시 첫 참여와 재시도에도 이전 두 단계 보상을 한 번만 지급한다", async () => {
    damage = 600_000_000;
    await service.attack("chuseok-a", "request-a");
    await service.attend("chuseok-b");
    damage = 10;
    const results = await Promise.all([
      service.attack("chuseok-b", "request-b"),
      service.attack("chuseok-c", "request-c"),
      service.attack("chuseok-b", "request-b"),
    ]);
    expect(results.every((r) => r.ok && r.stagesCleared === 0)).toBe(true);
    expect(results[0]).toEqual(results[2]);
    await service.attack("chuseok-b", "request-b2");
    expect((await pool.query("SELECT user_id, payload->>'staminaPotions' AS count FROM marketplace_inbox ORDER BY user_id")).rows).toEqual([
      { user_id: "chuseok-a", count: "30" }, { user_id: "chuseok-b", count: "30" }, { user_id: "chuseok-c", count: "30" },
    ]);
    expect((await service.read("chuseok-b")).raid).toMatchObject({ stage: 3, hp: 999_999_970, myDamage: 20, attacksRemaining: 1 });
  });
  it("소급 우편 실패도 첫 참여를 롤백하여 재시도 때 누락분을 지급한다", async () => {
    damage = 100_000_000;
    await service.attack("chuseok-a", "request-a");
    damage = 10;
    await pool.query("ALTER TABLE marketplace_inbox ADD CONSTRAINT chuseok_test_fail_mail CHECK (user_id <> 'chuseok-b')");
    try {
      await expect(service.attack("chuseok-b", "request-b")).rejects.toThrow();
      expect((await service.read("chuseok-b")).raid).toMatchObject({ stage: 2, hp: 500_000_000, myDamage: 0, attacksRemaining: 3 });
      expect((await pool.query("SELECT * FROM chuseok_attacks WHERE user_id='chuseok-b'")).rows).toHaveLength(0);
    } finally {
      await pool.query("ALTER TABLE marketplace_inbox DROP CONSTRAINT chuseok_test_fail_mail");
    }
    expect(await service.attack("chuseok-b", "request-b")).toMatchObject({ ok: true });
    expect((await pool.query("SELECT payload->>'staminaPotions' AS count FROM marketplace_inbox WHERE user_id='chuseok-b'")).rows).toEqual([{ count: "15" }]);
  });
  it("기존 참여자의 참여 전 누락분만 보정하고 수령·삭제 우편이나 출석만 한 사용자에게 중복 지급하지 않는다", async () => {
    await service.read("chuseok-a");
    // Old-policy fixture: A cleared stages 1–2, B joined and cleared stage 3.
    // Timestamps intentionally disagree with attack order: transaction start time is not commit order.
    await pool.query("UPDATE chuseok_events SET stage=4, hp=1500000000, max_hp=1500000000");
    await pool.query(`INSERT INTO chuseok_participants(event_id,user_id,attack_count) VALUES
      ('chuseok-2026','chuseok-a',2), ('chuseok-2026','chuseok-b',2), ('chuseok-2026','chuseok-c',0)`);
    await pool.query(`INSERT INTO chuseok_attacks(event_id,user_id,request_id,result,created_at) VALUES
      ('chuseok-2026','chuseok-a','old-a1','{"stage":3,"stagesCleared":2}','2026-09-22 18:00:01'),
      ('chuseok-2026','chuseok-a','old-a2','{"stage":4,"stagesCleared":0}','2026-09-22 18:00:00'),
      ('chuseok-2026','chuseok-b','old-b1','{"stage":4,"stagesCleared":1}','2026-09-22 18:00:01'),
      ('chuseok-2026','chuseok-b','old-b2','{"stage":4,"stagesCleared":0}','2026-09-22 18:00:00')`);
    await pool.query(`INSERT INTO marketplace_inbox(user_id,kind,payload,claimed_at,recipient_deleted_at) VALUES
      ('chuseok-a','admin_gift','{"staminaPotions":45}',now(),now()),
      ('chuseok-b','admin_gift','{"staminaPotions":15}',now(),now())`);
    await pool.query(await readFile("drizzle/0186_chuseok_retroactive_rewards.sql", "utf8"));
    expect((await pool.query("SELECT user_id, payload->>'staminaPotions' AS count FROM marketplace_inbox WHERE claimed_at IS NULL ORDER BY user_id")).rows).toEqual([{ user_id: "chuseok-b", count: "30" }]);
    damage = 10;
    await service.attack("chuseok-b", "request-b3");
    expect((await pool.query("SELECT user_id, SUM((payload->>'staminaPotions')::int)::int AS count FROM marketplace_inbox GROUP BY user_id ORDER BY user_id")).rows).toEqual([{ user_id: "chuseok-a", count: 45 }, { user_id: "chuseok-b", count: 45 }]);
  });
  it("하루 3회 제한을 지키고 KST 자정에 공격 횟수를 회복한다", async () => {
    damage = 10;
    for (let i = 0; i < 3; i++) expect(await service.attack("chuseok-a", `request-${i}`)).toMatchObject({ ok: true });
    expect(await service.attack("chuseok-a", "request-4")).toEqual({ ok: false, error: "daily_limit" });
    now = Date.parse("2026-09-23T00:00:00+09:00");
    expect(await service.attack("chuseok-a", "request-5")).toMatchObject({ ok: true });
  });
  it("미설정·시작 전·종료 후 요청을 막고 환경변수 변경으로 기존 일정을 연장하지 않는다", async () => {
    start = undefined;
    expect(await service.attend("chuseok-a")).toEqual({ ok: false, error: "event_pending" });
    start = "2026-09-22T18:00:00+09:00";
    now -= 1;
    expect(await service.attack("chuseok-a", "request-a")).toEqual({ ok: false, error: "event_pending" });
    now += 1;
    await service.attend("chuseok-a");
    start = "2026-10-02T18:00:00+09:00";
    now = Date.parse("2026-10-02T18:00:00+09:00");
    expect(await service.attend("chuseok-a")).toEqual({ ok: false, error: "event_ended" });
    expect(await service.attack("chuseok-a", "request-a")).toEqual({ ok: false, error: "event_ended" });
  });

  it("캐릭터 생성 전 요청에는 출석·공격 보상을 지급하지 않는다", async () => {
    await pool.query("DELETE FROM saves_kv WHERE user_id='chuseok-a' AND key='character-profile.v2'");
    expect(await service.attend("chuseok-a")).toEqual({ ok: false, error: "no_character" });
    expect(await service.attack("chuseok-a", "request-a")).toEqual({ ok: false, error: "no_character" });
  });

  it("우편 생성 실패는 체력·참여·공격 기록을 모두 롤백한다", async () => {
    await pool.query("ALTER TABLE marketplace_inbox ADD CONSTRAINT chuseok_test_fail_mail CHECK (user_id <> 'chuseok-a')");
    damage = 100_000_000;
    try {
      await expect(service.attack("chuseok-a", "request-a")).rejects.toThrow();
      expect((await service.read("chuseok-a")).raid).toMatchObject({ stage: 1, hp: 100_000_000, myDamage: 0, attacksRemaining: 3 });
      expect((await pool.query("SELECT * FROM chuseok_attacks")).rows).toHaveLength(0);
    } finally {
      await pool.query("ALTER TABLE marketplace_inbox DROP CONSTRAINT chuseok_test_fail_mail");
    }
  });

  it("실제 전투 엔진으로 복주머니를 공격해도 캐릭터 HP·MP·스태미나를 소비하지 않는다", async () => {
    const liveBattle = createChuseokEventService({ database: drizzle(pool), now: () => now, startsAt: () => start });
    await pool.query("UPDATE saves_kv SET value=$1 WHERE user_id='chuseok-a' AND key='character.v2'", [{ level: 1, hp: 5, mp: 3, stamina: { current: 100, lastUpdatedAt: now } }]);
    const result = await liveBattle.attack("chuseok-a", "request-live");
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.error);
    expect(result.damageDealt).toBeGreaterThan(0);
    expect(result.replay.enemy.name).toBe("추석 복주머니");
    expect((await pool.query("SELECT value FROM saves_kv WHERE user_id='chuseok-a' AND key='character.v2'")).rows[0].value).toEqual({ level: 1, hp: 5, mp: 3, stamina: { current: 100, lastUpdatedAt: now } });
  });
});
