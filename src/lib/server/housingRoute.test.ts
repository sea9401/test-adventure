import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
const keyOf = (userId: string, key: string) => `${userId}::${key}`;

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "u1"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: unknown, userId: string, key: string, fallback: unknown) =>
      store.has(keyOf(userId, key)) ? store.get(keyOf(userId, key)) : fallback,
  ),
  lockSaveForUpdate: vi.fn(
    async (_tx: unknown, userId: string, key: string, fallback: unknown) =>
      store.has(keyOf(userId, key)) ? store.get(keyOf(userId, key)) : fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: unknown, userId: string, key: string, value: unknown) => {
      store.set(keyOf(userId, key), value);
    },
  ),
}));

import { GET, POST } from "@/app/api/v2/me/housing/route";
import { defaultHousingState, HOUSING_SAVE_KEY } from "@/adventure/data/v2/housing";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { ensureUser } from "@/lib/server/ensureUser";

const EQUIPMENT_ID = Object.keys(V2_EQUIPMENT)[0] as keyof typeof V2_EQUIPMENT;

function request(body?: unknown) {
  return new Request("http://t/api/v2/me/housing", {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("housing route", () => {
  beforeEach(() => {
    store.clear();
    vi.mocked(ensureUser).mockResolvedValue("u1");
    store.set(keyOf("u1", "character-profile.v2"), { name: "검은여우" });
    store.set(keyOf("u1", "equipment.v2"), {
      owned: [{ iid: "eq-owned", id: EQUIPMENT_ID }],
      equipped: {},
    });
    store.set(keyOf("u1", "adventure-log.v2"), {
      coopBossKinds: ["mountain_chief"],
    });
    store.set(keyOf("u1", "fishing-codex.v1"), {
      fish: {
        crucian_carp: {
          discovered: true,
          bestSize: 34.5,
          totalCaught: 2,
          firstCaughtAt: 1,
          bestCaughtAt: 2,
        },
      },
    });
  });

  it("requires authentication", async () => {
    vi.mocked(ensureUser).mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(401);
  });

  it("returns the starter room and only actually owned display choices", async () => {
    const response = await GET(request());
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.ownerName).toBe("검은여우");
    expect(json.room).toEqual(defaultHousingState());
    expect(json.displayOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "equipment", iid: "eq-owned" }),
        expect.objectContaining({ kind: "fish", fishId: "crucian_carp" }),
        expect.objectContaining({ kind: "boss", bossId: "mountain_chief" }),
      ]),
    );
  });

  it("saves a valid public room with an owned trophy selection", async () => {
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "boss_trophy"
        ? {
            ...placement,
            display: { kind: "boss" as const, bossId: "mountain_chief" as const },
          }
        : placement,
    );
    const response = await POST(request(room));
    expect(response.status).toBe(200);
    expect(store.get(keyOf("u1", HOUSING_SAVE_KEY))).toEqual(room);
  });

  it("rejects forged display ownership without changing the save", async () => {
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "equipment_mannequin"
        ? {
            ...placement,
            display: { kind: "equipment" as const, iid: "eq-forged" },
          }
        : placement,
    );
    const response = await POST(request(room));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("display_not_owned");
    expect(store.has(keyOf("u1", HOUSING_SAVE_KEY))).toBe(false);
  });
});
