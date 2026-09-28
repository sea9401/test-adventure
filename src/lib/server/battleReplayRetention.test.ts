import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  deleteExpiredBattleReplayBatch,
  deleteExpiredBattleReplays,
} from "./battleReplayRetention";

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

describe("deleteExpiredBattleReplays", () => {
  it("한 배치를 넘는 만료 리플레이를 작은 배치로 나누어 순차 처리한다", async () => {
    let remaining = 2_317;
    let inFlight = false;
    const cutoffs: unknown[] = [];
    const now = new Date("2026-09-29T00:00:00.000Z");
    const execute = async (query: SQL) => {
      expect(inFlight).toBe(false);
      inFlight = true;
      const compiled = new PgDialect().sqlToQuery(query);
      cutoffs.push(compiled.params[1]);
      expect(compiled.params[2]).toBe(1_000);
      await Promise.resolve();
      const deleted = Math.min(remaining, 1_000);
      remaining -= deleted;
      inFlight = false;
      return { rows: [{ acquired: true, deleted }] };
    };

    const result = await deleteExpiredBattleReplays({ execute }, now, () => 0);

    expect(remaining).toBe(0);
    expect(cutoffs).toEqual([now, now, now]);
    expect(result).toEqual({
      deleted: 2_317, more: false, batchSize: 1_000, skipped: false,
    });
  });

  it("계속 유입되어도 한 실행은 최대 6천 건에서 멈춘다", async () => {
    let remaining = 20_000;
    const execute = async () => {
      remaining -= 1_000;
      return { rows: [{ acquired: true, deleted: 1_000 }] };
    };

    const result = await deleteExpiredBattleReplays({ execute }, undefined, () => 0);

    expect(remaining).toBe(14_000);
    expect(result).toEqual({
      deleted: 6_000, more: true, batchSize: 1_000, skipped: false,
    });
  });

  it("5초 예산에 도달하면 다음 삭제 배치를 시작하지 않는다", async () => {
    let elapsed = 0;
    let remaining = 20_000;
    const execute = async () => {
      elapsed += 5_000;
      remaining -= 1_000;
      return { rows: [{ acquired: true, deleted: 1_000 }] };
    };

    const result = await deleteExpiredBattleReplays({ execute }, undefined, () => elapsed);

    expect(remaining).toBe(19_000);
    expect(result.deleted).toBe(1_000);
    expect(result.more).toBe(true);
  });

  it.each([0, 1_000])("잠금 경합이면 추가 삭제 없이 적체 여부를 보수적으로 보고한다 (%i건 처리 후)", async (initialDeleted) => {
    let attempts = 0;
    const execute = async () => {
      attempts++;
      if (initialDeleted && attempts === 1) {
        return { rows: [{ acquired: true, deleted: 1_000 }] };
      }
      if (attempts > (initialDeleted ? 2 : 1)) throw new Error("unexpected retry");
      return { rows: [{ acquired: false, deleted: 0 }] };
    };

    await expect(deleteExpiredBattleReplays({ execute }, undefined, () => 0)).resolves.toEqual({
      deleted: initialDeleted, more: true, batchSize: 1_000, skipped: true,
    });
  });

  it("빈 배치를 확인하면 바로 끝낸다", async () => {
    let attempts = 0;
    const execute = async () => {
      if (++attempts > 1) throw new Error("unexpected retry");
      return { rows: [{ acquired: true, deleted: 0 }] };
    };

    await expect(deleteExpiredBattleReplays({ execute })).resolves.toEqual({
      deleted: 0, more: false, batchSize: 1_000, skipped: false,
    });
  });

  it("뒤 배치의 DB 오류를 성공 응답으로 숨기지 않는다", async () => {
    let attempts = 0;
    const execute = async () => {
      if (++attempts > 1) throw new Error("database unavailable");
      return { rows: [{ acquired: true, deleted: 1_000 }] };
    };

    await expect(deleteExpiredBattleReplays({ execute }, undefined, () => 0))
      .rejects.toThrow("database unavailable");
  });
});
