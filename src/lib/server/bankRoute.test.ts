import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => 1),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        })),
      }),
    ),
  },
}));

vi.mock("@/db/schema", () => ({
  outpostOccupations: {
    occupiedByGuildId: "occupiedByGuildId",
    outpostId: "outpostId",
  },
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/bank/route";

function req(body: unknown): Request {
  return new Request("http://t/api/v2/me/bank", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/me/bank", () => {
  beforeEach(() => {
    store.clear();
    store.set("character.v2", {
      gold: 1_250,
      bankedGold: 10,
      lastVisitedOutpost: { outpostId: "libera" },
    });
  });

  it("amount='all' 입금은 save lock 이후 최신 보유 골드 전액을 입금한다", async () => {
    const res = await POST(req({ action: "deposit", amount: "all" }));
    const json = (await res.json()) as {
      ok?: boolean;
      moved?: number;
      gold?: number;
      bankedGold?: number;
    };

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      moved: 1_250,
      gold: 0,
      bankedGold: 1_260,
    });
    expect(store.get("character.v2")).toMatchObject({
      gold: 0,
      bankedGold: 1_260,
    });
  });

  it("숫자 입금은 요청 금액까지만 입금한다", async () => {
    const res = await POST(req({ action: "deposit", amount: 1_000 }));
    const json = (await res.json()) as {
      ok?: boolean;
      moved?: number;
      gold?: number;
      bankedGold?: number;
    };

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      moved: 1_000,
      gold: 250,
      bankedGold: 1_010,
    });
  });

  it("amount='all' 출금은 은행 잔액 전액을 출금한다", async () => {
    const res = await POST(req({ action: "withdraw", amount: "all" }));
    const json = (await res.json()) as {
      ok?: boolean;
      moved?: number;
      gold?: number;
      bankedGold?: number;
    };

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      moved: 10,
      gold: 1_260,
      bankedGold: 0,
    });
  });
});
