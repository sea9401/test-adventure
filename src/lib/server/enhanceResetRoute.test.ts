import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
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

import { POST } from "@/app/api/v2/me/enhance/reset/route";

const WEAPON = "v2_den_greatsword";

function request(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/me/enhance/reset", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function seed() {
  store.clear();
  store.set("character.v2", {
    gold: 123_456,
    materials: { enhance_stone_red: 4, enhance_stone_blue: 7 },
  });
  store.set("equipment.v2", {
    owned: [
      {
        iid: "w1",
        id: WEAPON,
        roll: { power: 300, weight: 5 },
        enhance: { level: 8, bonusPct: 15 },
        craftQuality: { level: 1, bonusPct: 5 },
        craftedBy: {
          userId: "u-test",
          profession: "blacksmith",
          level: 6,
          craftedAt: "2026-08-10T00:00:00.000Z",
        },
        stormRefined: true,
      },
      { iid: "plain", id: WEAPON },
      {
        iid: "equipped",
        id: WEAPON,
        enhance: { level: 2, bonusPct: 2 },
      },
      {
        iid: "locked",
        id: WEAPON,
        locked: true,
        enhance: { level: 3, bonusPct: 4 },
      },
    ],
    equipped: { weapon: "equipped" },
  });
}

describe("POST /api/v2/me/enhance/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed();
  });

  it("강화만 제거하고 재화와 다른 장비 메타데이터를 보존한다", async () => {
    const originalCharacterSave = structuredClone(store.get("character.v2"));

    const response = await POST(request({ iid: "w1" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, iid: "w1" });
    const equipment = store.get("equipment.v2") as {
      owned: Array<Record<string, unknown>>;
    };
    expect(equipment.owned[0]).not.toHaveProperty("enhance");
    expect(equipment.owned[0]).toMatchObject({
      iid: "w1",
      id: WEAPON,
      roll: { power: 300, weight: 5 },
      craftQuality: { level: 1, bonusPct: 5 },
      craftedBy: {
        userId: "u-test",
        profession: "blacksmith",
        level: 6,
        craftedAt: "2026-08-10T00:00:00.000Z",
      },
      stormRefined: true,
    });
    expect(store.get("character.v2")).toEqual(originalCharacterSave);
  });

  it.each([
    ["missing", "not_owned", 404],
    ["plain", "not_enhanced", 400],
    ["equipped", "equipped", 409],
    ["locked", "locked", 409],
  ])("%s 장비는 %s로 거부한다", async (iid, error, status) => {
    const response = await POST(request({ iid }));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ ok: false, error });
  });
});
