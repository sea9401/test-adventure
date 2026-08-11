import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFishCodex } from "@/adventure/v2/fishingCodex";

const mocks = vi.hoisted(() => ({
  userId: "u-test" as string | null,
  store: new Map<string, unknown>(),
  transactionTail: Promise.resolve() as Promise<unknown>,
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const previous = mocks.transactionTail;
      let release = () => {};
      mocks.transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback({});
      } finally {
        release();
      }
    }),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    mocks.store.has(key) ? mocks.store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    mocks.store.set(key, value);
  }),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: mocks.recordEconomyEventSoon,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://game.test/api/v2/me/fishing-specimens/use", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/me/fishing-specimens/use", () => {
  beforeEach(() => {
    mocks.userId = "u-test";
    mocks.store.clear();
    mocks.transactionTail = Promise.resolve();
    mocks.recordEconomyEventSoon.mockClear();
    mocks.store.set("fishing-codex.v1", {});
    mocks.store.set("fishing-specimens.v1", { version: 1, items: { carp: 1 } });
  });

  it("표본 한 개를 소비해 비어 있는 도감 등록권을 채운다", async () => {
    const response = await POST(request({ fishId: "carp" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      fishId: "carp",
      specimenBalance: 0,
      registered: true,
      fishSpBefore: 0,
      fishSpAfter: 0,
    });
    expect(parseFishCodex(mocks.store.get("fishing-codex.v1")).fish.carp).toMatchObject({
      registered: true,
      caughtEver: false,
      totalCaught: 0,
    });
    expect(mocks.recordEconomyEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "fish_specimen.use", quantity: -1 }),
    );
  });

  it("이미 등록된 어종은 표본을 소비하지 않는다", async () => {
    mocks.store.set("fishing-codex.v1", {
      fish: { carp: { registered: true, caughtEver: false } },
    });

    const response = await POST(request({ fishId: "carp" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "already_registered" });
    expect(mocks.store.get("fishing-specimens.v1")).toMatchObject({ items: { carp: 1 } });
  });

  it("보유하지 않은 표본과 잘못된 어종 ID를 거부한다", async () => {
    const notOwned = await POST(request({ fishId: "trout" }));
    expect(notOwned.status).toBe(400);
    expect(await notOwned.json()).toMatchObject({ error: "not_owned" });

    const invalid = await POST(request({ fishId: "fake" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "invalid_fish_id" });
  });

  it("동일한 사용 요청이 동시에 와도 한 번만 등록한다", async () => {
    const responses = await Promise.all([
      POST(request({ fishId: "carp" })),
      POST(request({ fishId: "carp" })),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(mocks.store.get("fishing-specimens.v1")).toMatchObject({ items: {} });
  });
});
