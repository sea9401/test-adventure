import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUser, recordUniqueEquipmentAcquisitions, store, upsertSave } =
  vi.hoisted(() => ({
    ensureUser: vi.fn(async (): Promise<string | null> => "blacksmith-user"),
    recordUniqueEquipmentAcquisitions: vi.fn(async () => undefined),
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
  lockSavesForUpdate: vi.fn(
    async (_tx: object, _userId: string, fallbacks: Record<string, object>) =>
      Object.fromEntries(
        Object.entries(fallbacks).map(([key, fallback]) => [
          key,
          store.get(key) ?? fallback,
        ]),
      ),
  ),
  readSave: vi.fn(async (_tx, _userId, key: string, fallback: object) =>
    store.get(key) ?? fallback,
  ),
  upsertSave,
}));
vi.mock("@/lib/server/uniqueEquipmentAchievement", () => ({
  recordUniqueEquipmentAcquisitions,
}));

import { POST } from "./route";

function request(inspectionId: unknown, candidateIndex: unknown): Request {
  return new Request("http://localhost/api/v2/guild/workshop/inspection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inspectionId, candidateIndex }),
  });
}

function seed() {
  store.set("equipment.v2", { owned: [], equipped: {} });
  store.set("crafting.v2", {
    artisan: { blacksmith: { xp: 307_780, crafts: 101 } },
    blacksmithProgression: {
      specialty: "weapon",
      pendingInspection: {
        inspectionId: "inspection_1",
        recipeId: "crafted_gale_bow",
        equipmentId: "v2_crafted_gale_bow",
        craftQuality: { level: 1, bonusPct: 5 },
        candidates: [
          { power: 10, weight: 0, options: { crit: 2, spd: 3 } },
          { power: 12, weight: 0, options: { crit: 1, spd: 4 } },
        ],
        craftedBy: {
          userId: "blacksmith-user",
          name: "전문 장인",
          profession: "blacksmith",
          level: 30,
          craftedAt: "2026-08-22T00:00:00.000Z",
          masterwork: true,
          specialty: "weapon",
        },
        createdAt: "2026-08-22T00:00:00.000Z",
      },
    },
  });
}

describe("POST /api/v2/guild/workshop/inspection", () => {
  beforeEach(() => {
    store.clear();
    upsertSave.mockClear();
    recordUniqueEquipmentAcquisitions.mockClear();
    ensureUser.mockResolvedValue("blacksmith-user");
    seed();
  });

  it("validates authentication, candidate index, and inspection id", async () => {
    ensureUser.mockResolvedValueOnce(null);
    expect((await POST(request("inspection_1", 0))).status).toBe(401);
    expect((await POST(request("inspection_1", 2))).status).toBe(400);
    expect((await POST(request("stale", 0))).status).toBe(409);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it.each([0, 1] as const)("confirms candidate %s exactly once", async (candidateIndex) => {
    const response = await POST(request("inspection_1", candidateIndex));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      inspectionId: "inspection_1",
      candidateIndex,
      iid: expect.any(String),
      equipmentId: "v2_crafted_gale_bow",
    });
    const equipment = store.get("equipment.v2") as { owned: object[] };
    expect(equipment.owned).toHaveLength(1);
    expect(equipment.owned[0]).toMatchObject({
      iid: json.iid,
      roll:
        candidateIndex === 0
          ? { power: 10, options: { crit: 2, spd: 3 } }
          : { power: 12, options: { crit: 1, spd: 4 } },
      craftQuality: { level: 1, bonusPct: 5 },
      craftedBy: { specialty: "weapon", masterwork: true },
    });
    expect(store.get("crafting.v2")).toMatchObject({
      blacksmithProgression: {
        specialty: "weapon",
        lastInspectionResolution: {
          inspectionId: "inspection_1",
          candidateIndex,
          iid: json.iid,
        },
      },
    });
    expect(
      (store.get("crafting.v2")!.blacksmithProgression as Record<string, unknown>)
        .pendingInspection,
    ).toBeUndefined();

    upsertSave.mockClear();
    const retry = await POST(request("inspection_1", candidateIndex));
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      ok: true,
      iid: json.iid,
      idempotent: true,
      blacksmithProgression: {
        specialty: "weapon",
        lastInspectionResolution: {
          inspectionId: "inspection_1",
          candidateIndex,
          iid: json.iid,
        },
      },
    });
    expect((store.get("equipment.v2") as { owned: object[] }).owned).toHaveLength(1);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("rejects choosing another candidate after resolution", async () => {
    expect((await POST(request("inspection_1", 0))).status).toBe(200);
    const conflict = await POST(request("inspection_1", 1));
    expect(conflict.status).toBe(409);
    expect((store.get("equipment.v2") as { owned: object[] }).owned).toHaveLength(1);
  });
});
