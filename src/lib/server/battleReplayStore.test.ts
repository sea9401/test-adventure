import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  BATCH_HUNT_REPLAY_KEEP_BATCHES,
  BATCH_HUNT_REPLAY_PRUNE_LIMIT,
  BATTLE_REPLAY_RETENTION_MS,
  deferLongBattleReplays,
  storeBattleReplays,
} from "./battleReplayStore";

function replay(logLength: number, name = "산군"): ReplayPayload {
  return {
    enemy: { name, hp: 30_000 },
    playerMaxHp: 500,
    playerMaxMp: 100,
    log: Array.from({ length: logLength }, (_, index) => ({
      kind: "info" as const,
      text: `${index}`,
    })),
  };
}

describe("storeBattleReplays", () => {
  it("전체 payload는 DB에 저장하고 응답에는 replayId 참조만 남긴다", async () => {
    const values = vi.fn(async () => undefined);
    const executor = {
      insert: vi.fn(() => ({ values })),
    } as unknown as Parameters<typeof storeBattleReplays>[0];
    const payload = replay(500);
    const now = new Date("2026-08-08T00:00:00.000Z");

    const [reference] = await storeBattleReplays(
      executor,
      "user-1",
      [payload],
      BATTLE_REPLAY_RETENTION_MS.batchHunt,
      now,
    );

    const [rows] = values.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
    ];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "user-1",
      payload,
      createdAt: now,
      expiresAt: new Date("2026-08-08T02:00:00.000Z"),
    });
    expect(rows[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(reference).toMatchObject({
      replayId: rows[0]?.id,
      enemy: payload.enemy,
      log: [],
    });
    expect(payload.log).toHaveLength(500);
  });

  it("80개 이하 로그는 저장하지 않고 원본 참조를 유지한다", async () => {
    const insert = vi.fn();
    const executor = { insert } as unknown as Parameters<
      typeof deferLongBattleReplays
    >[0];
    const short = replay(80);

    const result = await deferLongBattleReplays(executor, "user-1", [short]);

    expect(insert).not.toHaveBeenCalled();
    expect(result).toEqual([short]);
    expect(result[0]).toBe(short);
  });

  it("혼합 입력에서 80개를 넘는 로그만 저장하고 원래 순서에 참조를 합친다", async () => {
    const values = vi.fn(async () => undefined);
    const executor = {
      insert: vi.fn(() => ({ values })),
    } as unknown as Parameters<typeof deferLongBattleReplays>[0];
    const short = replay(80, "짧은 적");
    const long = replay(81, "긴 적");
    const now = new Date("2026-08-08T00:00:00.000Z");

    const result = await deferLongBattleReplays(
      executor,
      "user-1",
      [short, long],
      {},
      now,
    );

    const [rows] = values.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
    ];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "user-1",
      payload: long,
      createdAt: now,
      expiresAt: new Date("2026-08-08T02:00:00.000Z"),
    });
    expect(result[0]).toBe(short);
    expect(result[1]).toMatchObject({
      enemy: long.enemy,
      replayId: rows[0]?.id,
      log: [],
    });
  });

  it("임시 저장이 실패하면 긴 로그 원본을 그대로 반환한다", async () => {
    const values = vi.fn(async () => {
      throw Object.assign(
        new Error(
          "Failed query: insert into battle_replays params: SECRET_BATTLE_PAYLOAD",
        ),
        { name: "DrizzleQueryError", code: "57P01" },
      );
    });
    const executor = {
      insert: vi.fn(() => ({ values })),
    } as unknown as Parameters<typeof deferLongBattleReplays>[0];
    const long = replay(81);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      deferLongBattleReplays(executor, "user-1", [long]),
    ).resolves.toEqual([long]);
    expect(warn).toHaveBeenCalledWith(
      "[battleReplayStore] batch replay persistence failed",
      { name: "DrizzleQueryError", code: "57P01" },
    );
    const renderedWarning = warn.mock.calls
      .flat()
      .map((value) =>
        value instanceof Error
          ? `${value.name}:${value.message}`
          : JSON.stringify(value),
      )
      .join(" ");
    expect(renderedWarning).not.toContain("SECRET_BATTLE_PAYLOAD");
    expect(renderedWarning).not.toContain("insert into battle_replays");

    warn.mockRestore();
  });

  it("새 묶음을 저장한 뒤 같은 유저의 묶음 기록을 최근 묶음 수만큼만 남긴다", async () => {
    const values = vi.fn(async () => undefined);
    const execute = vi.fn(async (_query: SQL) => ({ rows: [] }));
    const executor = {
      insert: vi.fn(() => ({ values })),
      execute,
    } as unknown as Parameters<typeof deferLongBattleReplays>[0];

    const result = await deferLongBattleReplays(
      executor,
      "user-1",
      [replay(81)],
      { keepLatestBatches: BATCH_HUNT_REPLAY_KEEP_BATCHES },
    );

    expect(BATCH_HUNT_REPLAY_KEEP_BATCHES).toBe(2);
    expect(values).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql.toLowerCase()).toContain("delete from");
    expect(query.sql).toContain("battle_replays");
    // 아레나 기록(14일)은 건드리지 않도록 보관 기간이 하루 미만인 묶음 기록만 대상으로 한다.
    expect(query.sql).toContain("interval '1 day'");
    // 배포 직후 쌓여 있던 수만 행을 한 사냥 요청에서 지우지 않도록 한 번에 지우는 행 수를 묶는다.
    expect(query.sql).toContain("ctid");
    expect(query.params).toEqual([
      "user-1",
      "user-1",
      1,
      BATCH_HUNT_REPLAY_PRUNE_LIMIT,
    ]);
    expect(BATCH_HUNT_REPLAY_PRUNE_LIMIT).toBe(500);
    expect(result[0]?.replayId).toBeTruthy();
  });

  it("이전 묶음 정리가 실패해도 저장한 참조를 그대로 돌려준다", async () => {
    const values = vi.fn(async () => undefined);
    const execute = vi.fn(async () => {
      throw Object.assign(new Error("delete failed SECRET"), {
        name: "DrizzleQueryError",
        code: "40P01",
      });
    });
    const executor = {
      insert: vi.fn(() => ({ values })),
      execute,
    } as unknown as Parameters<typeof deferLongBattleReplays>[0];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await deferLongBattleReplays(
      executor,
      "user-1",
      [replay(81)],
      { keepLatestBatches: 2 },
    );

    expect(result[0]).toMatchObject({ log: [], replayId: expect.any(String) });
    expect(warn).toHaveBeenCalledWith(
      "[battleReplayStore] batch replay prune failed",
      { name: "DrizzleQueryError", code: "40P01" },
    );
    warn.mockRestore();
  });
});
