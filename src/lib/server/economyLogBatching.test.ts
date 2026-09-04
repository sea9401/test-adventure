import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state: { batchError: Error | null } = { batchError: null };
  const returning = vi.fn(async () => [{ id: 41 }]);
  const values = vi.fn((value: unknown) => {
    if (!Array.isArray(value)) return { returning };
    return state.batchError
      ? Promise.reject(state.batchError)
      : Promise.resolve();
  });
  const insert = vi.fn(() => ({ values }));
  const recordOpsSignal = vi.fn();
  return { insert, values, returning, recordOpsSignal, state };
});

vi.mock("@/db", () => ({ db: { insert: mocks.insert } }));
vi.mock("@/lib/server/opsAlert", () => ({
  recordOpsSignal: mocks.recordOpsSignal,
}));

describe("recordEconomyEventSoon batching", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    delete (globalThis as { __adventureEconomyEventBatcher?: unknown })
      .__adventureEconomyEventBatcher;
    delete (globalThis as { __adventureEconomyEventBatchMetrics?: unknown })
      .__adventureEconomyEventBatchMetrics;
    mocks.insert.mockClear();
    mocks.values.mockClear();
    mocks.returning.mockClear();
    mocks.recordOpsSignal.mockClear();
    mocks.state.batchError = null;
    process.env.DATABASE_URL = "postgres://economy-batching.test/database";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("고빈도 이벤트는 한 번에 쓰고 감사 이벤트는 즉시 단건으로 쓴다", async () => {
    const { getEconomyEventBatchMetrics, recordEconomyEventSoon } = await import(
      "./economyLog"
    );

    recordEconomyEventSoon({
      userId: "user-1",
      eventType: "life.fishing.attempt",
      itemKind: "activity",
      itemId: "carp",
      quantity: 1,
    });
    recordEconomyEventSoon({
      userId: "user-1",
      eventType: "currency.fishing.catch",
      itemKind: "fishing_coin",
      itemId: "catch_daily_cap",
      quantity: 3,
    });
    expect(mocks.values).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(25);

    expect(mocks.values).toHaveBeenCalledTimes(1);
    expect(mocks.values).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({
        userId: "user-1",
        eventType: "life.fishing.attempt",
        goldDelta: 0,
        itemKind: "activity",
        itemId: "carp",
        quantity: 1,
        detail: null,
      }),
      expect.objectContaining({
        userId: "user-1",
        eventType: "currency.fishing.catch",
        itemKind: "fishing_coin",
        itemId: "catch_daily_cap",
        quantity: 3,
      }),
    ]);
    expect(getEconomyEventBatchMetrics()).toMatchObject({
      pending: 0,
      inFlight: 0,
      successfulBatches: 1,
      successfulEntries: 2,
      averageBatchSize: 2,
      maxBatchSize: 2,
      failedBatches: 0,
      failedEntries: 0,
      lastSuccessAt: expect.any(String),
      lastFailureAt: null,
    });

    recordEconomyEventSoon({
      userId: "admin-target",
      eventType: "admin.reward.grant",
      itemKind: "material",
      itemId: "v2_timber",
      quantity: 10,
    });

    expect(mocks.values).toHaveBeenCalledTimes(2);
    expect(mocks.values).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userId: "admin-target",
        eventType: "admin.reward.grant",
        itemId: "v2_timber",
      }),
    );
    expect(mocks.returning).toHaveBeenCalledOnce();
  });

  it("배치 INSERT 실패를 지표에 누적하고 즉시 운영 신호로 기록한다", async () => {
    mocks.state.batchError = new Error("database unavailable");
    const { getEconomyEventBatchMetrics, recordEconomyEventSoon } = await import(
      "./economyLog"
    );

    recordEconomyEventSoon({
      userId: "user-1",
      eventType: "life.mining.attempt",
      quantity: 1,
    });
    await vi.advanceTimersByTimeAsync(25);

    expect(getEconomyEventBatchMetrics()).toMatchObject({
      failedBatches: 1,
      failedEntries: 1,
      lastFailureAt: expect.any(String),
    });
    expect(mocks.recordOpsSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "database.economy_batch_write_failed",
        threshold: 1,
        detail: expect.objectContaining({ batchSize: 1 }),
      }),
    );
  });

  it("기록 중인 항목을 포함한 큐가 500건에 도달하면 적체 신호를 기록한다", async () => {
    let releaseFirstBatch: (() => void) | undefined;
    mocks.values.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstBatch = resolve;
        }),
    );
    const { recordEconomyEventSoon } = await import("./economyLog");

    for (let index = 0; index < 500; index += 1) {
      recordEconomyEventSoon({
        userId: "user-1",
        eventType: "life.farming.attempt",
        quantity: 1,
      });
    }
    await Promise.resolve();

    expect(mocks.recordOpsSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        alertType: "database.economy_batch_queue_backlog",
        detail: expect.objectContaining({ queueDepth: 500 }),
      }),
    );

    releaseFirstBatch?.();
    await vi.advanceTimersByTimeAsync(0);
  });
});
