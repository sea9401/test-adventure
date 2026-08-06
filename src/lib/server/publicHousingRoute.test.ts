import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, resolved } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  resolved: { userId: "target", displayName: "은빛나무" },
}));
const keyOf = (userId: string, key: string) => `${userId}::${key}`;

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "viewer"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(async () => ({
      rows: [
        {
          user_id: resolved.userId,
          display_name: resolved.displayName,
        },
      ],
    })),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(
    async (_db: unknown, userId: string, key: string, fallback: unknown) =>
      store.has(keyOf(userId, key)) ? store.get(keyOf(userId, key)) : fallback,
  ),
}));

import { GET } from "@/app/api/v2/player/[name]/housing/route";
import { defaultHousingState } from "@/adventure/data/v2/housing";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";

const EQUIPMENT_ID = Object.keys(V2_EQUIPMENT)[0] as keyof typeof V2_EQUIPMENT;

function get() {
  return GET(new Request("http://t/api/v2/player/x/housing"), {
    params: Promise.resolve({ name: "은빛나무" }),
  });
}

describe("public housing route", () => {
  beforeEach(() => {
    store.clear();
    resolved.userId = "target";
    resolved.displayName = "은빛나무";
    store.set(keyOf("target", "equipment.v2"), {
      owned: [
        { iid: "eq-shown", id: EQUIPMENT_ID },
        { iid: "eq-private", id: EQUIPMENT_ID },
      ],
      equipped: {},
    });
  });

  it("blocks another viewer from a private room", async () => {
    store.set(keyOf("target", "housing.v1"), {
      ...defaultHousingState(),
      isPublic: false,
    });
    const response = await get();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("private_room");
  });

  it("returns only equipment that is actually selected for public display", async () => {
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "equipment_mannequin"
        ? {
            ...placement,
            display: { kind: "equipment" as const, iid: "eq-shown" },
          }
        : placement,
    );
    store.set(keyOf("target", "housing.v1"), room);

    const response = await get();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.ownerName).toBe("은빛나무");
    expect(json.displayOptions).toHaveLength(1);
    expect(json.displayOptions[0]).toMatchObject({
      kind: "equipment",
      iid: "eq-shown",
    });
  });

  it("removes a stale display reference after its equipment is gone", async () => {
    const room = defaultHousingState();
    room.layout = room.layout.map((placement) =>
      placement.furnitureId === "equipment_mannequin"
        ? {
            ...placement,
            display: { kind: "equipment" as const, iid: "eq-disposed" },
          }
        : placement,
    );
    store.set(keyOf("target", "housing.v1"), room);

    const response = await get();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.displayOptions).toEqual([]);
    expect(json.room.layout.some((placement: { display?: unknown }) => placement.display)).toBe(false);
  });
});
