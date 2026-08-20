import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { deleteExpiredBattleReplayBatch } from "./battleReplayRetention";

describe("deleteExpiredBattleReplayBatch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("만료 인덱스와 ctid로 한 번에 1천 건만 삭제한다", async () => {
    const now = new Date("2026-08-13T00:00:00.000Z");
    const execute = vi.fn(async (_query: SQL) => ({
      rows: [{ acquired: true, deleted: "1000" }],
    }));

    const result = await deleteExpiredBattleReplayBatch(
      { execute },
      now,
    );
    const query = execute.mock.calls[0]?.[0] as SQL;
    const compiled = new PgDialect().sqlToQuery(query);

    expect(compiled.sql).toContain("pg_try_advisory_xact_lock");
    expect(compiled.sql).toContain('"expires_at" <');
    expect(compiled.sql).toContain("ctid");
    expect(compiled.sql).toContain('ORDER BY "battle_replays"."expires_at"');
    expect(compiled.params).toEqual([
      "adventure-rpg:battle-replay-retention:v1",
      now,
      1_000,
    ]);
    expect(result).toEqual({
      deleted: 1_000,
      more: true,
      batchSize: 1_000,
      skipped: false,
    });
  });

  it("부분 배치를 삭제하면 적체가 없다고 보고한다", async () => {
    const execute = vi.fn(async (_query: SQL) => ({
      rows: [{ acquired: true, deleted: 317 }],
    }));

    await expect(
      deleteExpiredBattleReplayBatch({ execute }),
    ).resolves.toEqual({
      deleted: 317,
      more: false,
      batchSize: 1_000,
      skipped: false,
    });
  });

  it("삭제 대상이 없으면 0건으로 정규화한다", async () => {
    const execute = vi.fn(async (_query: SQL) => ({
      rows: [{ acquired: true, deleted: 0 }],
    }));

    await expect(
      deleteExpiredBattleReplayBatch({ execute }),
    ).resolves.toEqual({
      deleted: 0,
      more: false,
      batchSize: 1_000,
      skipped: false,
    });
  });

  it("이전 정리 작업이 잠금을 쥐고 있으면 성공적으로 건너뛴다", async () => {
    const execute = vi.fn(async (_query: SQL) => ({
      rows: [{ acquired: false, deleted: 0 }],
    }));

    await expect(
      deleteExpiredBattleReplayBatch({ execute }),
    ).resolves.toEqual({
      deleted: 0,
      more: false,
      batchSize: 1_000,
      skipped: true,
    });
  });
});
