import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUser, store, upsertSave } = vi.hoisted(() => ({
  ensureUser: vi.fn(async (): Promise<string | null> => "blacksmith-user"),
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
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser }));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: object) =>
      store.get(key) ?? fallback,
  ),
  upsertSave,
}));

import { PATCH } from "./route";

function request(specialty: unknown): Request {
  return new Request("http://localhost/api/v2/guild/workshop/specialization", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ specialty }),
  });
}

describe("PATCH /api/v2/guild/workshop/specialization", () => {
  beforeEach(() => {
    store.clear();
    upsertSave.mockClear();
    ensureUser.mockResolvedValue("blacksmith-user");
  });

  it("requires authentication and blacksmith level 13", async () => {
    ensureUser.mockResolvedValueOnce(null);
    const unauthorized = await PATCH(request("weapon"));
    expect(unauthorized.status).toBe(401);

    store.set("crafting.v2", {
      artisan: { blacksmith: { xp: 27_499, crafts: 10 } },
    });
    const locked = await PATCH(request("weapon"));
    expect(locked.status).toBe(403);
    await expect(locked.json()).resolves.toMatchObject({
      ok: false,
      error: "specialty_level_locked",
      requiredLevel: 13,
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("stores the first valid specialty without replacing existing crafting state", async () => {
    store.set("crafting.v2", {
      artisan: { blacksmith: { xp: 27_500, crafts: 10 } },
      workshopStats: { totalCrafts: 10 },
    });

    const response = await PATCH(request("armor"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      blacksmithProgression: { specialty: "armor" },
    });
    expect(store.get("crafting.v2")).toMatchObject({
      artisan: { blacksmith: { xp: 27_500, crafts: 10 } },
      workshopStats: { totalCrafts: 10 },
      blacksmithProgression: { specialty: "armor" },
    });
  });

  it("is idempotent for the same choice and rejects every replacement", async () => {
    store.set("crafting.v2", {
      artisan: { blacksmith: { xp: 100_000, crafts: 20 } },
      blacksmithProgression: { specialty: "weapon" },
    });

    const retry = await PATCH(request("weapon"));
    expect(retry.status).toBe(200);
    expect(upsertSave).not.toHaveBeenCalled();

    const replacement = await PATCH(request("jewelry"));
    expect(replacement.status).toBe(409);
    await expect(replacement.json()).resolves.toMatchObject({
      ok: false,
      error: "specialty_locked",
      specialty: "weapon",
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("rejects unknown specialty ids", async () => {
    const response = await PATCH(request("invalid"));
    expect(response.status).toBe(400);
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
