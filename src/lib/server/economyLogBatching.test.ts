import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const returning = vi.fn(async () => [{ id: 41 }]);
  const values = vi.fn((value: unknown) =>
    Array.isArray(value) ? Promise.resolve() : { returning },
  );
  const insert = vi.fn(() => ({ values }));
  return { insert, values, returning };
});

vi.mock("@/db", () => ({ db: { insert: mocks.insert } }));
vi.mock("@/lib/server/opsAlert", () => ({ recordOpsSignal: vi.fn() }));

describe("recordEconomyEventSoon batching", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    delete (globalThis as { __adventureEconomyEventBatcher?: unknown })
      .__adventureEconomyEventBatcher;
    mocks.insert.mockClear();
    mocks.values.mockClear();
    mocks.returning.mockClear();
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
    const { recordEconomyEventSoon } = await import("./economyLog");

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
});
