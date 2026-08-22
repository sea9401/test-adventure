import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, upsertSave } = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  upsertSave: vi.fn(
    async (_tx: object, _userId: string, key: string, value: object) => {
      store.set(key, value as Record<string, unknown>);
    },
  ),
}));

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})) },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "blacksmith-user"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSavesForUpdate: vi.fn(
    async (_tx: object, _userId: string, fallbacks: Record<string, object>) =>
      Object.fromEntries(
        Object.entries(fallbacks).map(([key, fallback]) => [
          key,
          store.get(key) ?? fallback,
        ]),
      ),
  ),
  upsertSave,
}));

import { PATCH } from "./route";

function request(iid: unknown): Request {
  return new Request("http://localhost/api/v2/guild/workshop/signature", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ iid }),
  });
}

function seed({
  xp = 240_000,
  specialty = "weapon",
  crafterUserId = "blacksmith-user",
  equipmentId = "v2_storm_gale_bow",
}: {
  xp?: number;
  specialty?: "weapon" | "armor" | "jewelry";
  crafterUserId?: string;
  equipmentId?: string;
} = {}) {
  store.set("crafting.v2", {
    artisan: { blacksmith: { xp, crafts: 50 } },
    blacksmithProgression: { specialty },
  });
  store.set("equipment.v2", {
    owned: [
      {
        iid: "eq_signature",
        id: equipmentId,
        craftedBy: {
          userId: crafterUserId,
          profession: "blacksmith",
          level: 28,
          craftedAt: "2026-08-22T00:00:00.000Z",
          specialty,
        },
      },
    ],
    equipped: {},
  });
}

describe("PATCH /api/v2/guild/workshop/signature", () => {
  beforeEach(() => {
    store.clear();
    upsertSave.mockClear();
  });

  it("requires level 28 and an owned matching-specialty self-crafted item", async () => {
    seed({ xp: 239_999 });
    expect((await PATCH(request("eq_signature"))).status).toBe(403);

    seed({ crafterUserId: "another-user" });
    expect((await PATCH(request("eq_signature"))).status).toBe(409);

    seed({ equipmentId: "v2_storm_wreckage_armor" });
    expect((await PATCH(request("eq_signature"))).status).toBe(409);

    seed();
    expect((await PATCH(request("missing"))).status).toBe(409);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("designates and replaces the representative iid without mutating equipment", async () => {
    seed();
    const equipmentBefore = structuredClone(store.get("equipment.v2"));

    const first = await PATCH(request("eq_signature"));
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      ok: true,
      blacksmithProgression: {
        specialty: "weapon",
        signatureIid: "eq_signature",
      },
    });
    expect(store.get("equipment.v2")).toEqual(equipmentBefore);

    const equipment = store.get("equipment.v2")!;
    store.set("equipment.v2", {
      ...equipment,
      owned: [
        ...(equipment.owned as object[]),
        {
          iid: "eq_replacement",
          id: "v2_storm_gale_dagger",
          craftedBy: {
            userId: "blacksmith-user",
            profession: "blacksmith",
            level: 28,
            craftedAt: "2026-08-22T01:00:00.000Z",
            specialty: "weapon",
          },
        },
      ],
    });

    const replacement = await PATCH(request("eq_replacement"));
    expect(replacement.status).toBe(200);
    expect(store.get("crafting.v2")).toMatchObject({
      blacksmithProgression: {
        specialty: "weapon",
        signatureIid: "eq_replacement",
      },
    });
  });
});
