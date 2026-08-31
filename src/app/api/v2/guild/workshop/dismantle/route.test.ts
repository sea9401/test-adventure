import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "dismantler-1"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildIdByUser: vi.fn(async () => 7),
}));
vi.mock("@/lib/server/guildFacilities", () => ({
  readGuildSmithyLevel: vi.fn(async () => 1),
}));
vi.mock("@/lib/server/adventurerAssociation", () => ({
  associationFacilityLevel: vi.fn(async () => 1),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async (_db, _userId, key: string, fallback: unknown) =>
    mocks.saves.has(key) ? structuredClone(mocks.saves.get(key)) : fallback,
  ),
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    mocks.saves.has(key) ? structuredClone(mocks.saves.get(key)) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    mocks.saves.set(key, structuredClone(value));
  }),
}));

import { GET, POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v2/guild/workshop/dismantle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
  mocks.saves.set("character.v2", { materials: {} });
  mocks.saves.set("crafting.v2", {
    artisan: { blacksmith: { xp: 3_100, crafts: 20 } },
  });
  mocks.saves.set("equipment.v2", {
    owned: [
      {
        iid: "liberated-craft",
        id: "v2_storm_breaker_greatsword",
        bound: true,
        craftedBy: {
          userId: "dismantler-1",
          profession: "blacksmith",
          level: 6,
          craftedAt: "2026-08-29T00:00:00.000Z",
        },
        liberation: {
          rank: 2,
          lineCount: 1,
          revision: 2,
          options: [{ id: "physical_attack_flat", level: 8 }],
        },
      },
    ],
    equipped: {},
  });
});

describe("guild workshop dismantle liberation confirmation", () => {
  it("exposes bound and liberation state in the candidate view", async () => {
    const response = await GET(
      new Request("http://localhost/api/v2/guild/workshop/dismantle"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      candidates: [
        {
          iid: "liberated-craft",
          bound: true,
          liberation: { rank: 2, lineCount: 1 },
        },
      ],
    });
  });

  it("preserves a liberated item until explicit confirmation, then dismantles it", async () => {
    const blocked = await POST(request({ iid: "liberated-craft" }));
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toMatchObject({
      error: "bound_confirmation_required",
      item: {
        iid: "liberated-craft",
        liberation: { rank: 2, lineCount: 1 },
      },
    });
    expect(
      (mocks.saves.get("equipment.v2") as { owned: unknown[] }).owned,
    ).toHaveLength(1);

    const confirmed = await POST(
      request({ iid: "liberated-craft", confirmBound: true }),
    );
    expect(confirmed.status).toBe(200);
    expect(
      (mocks.saves.get("equipment.v2") as { owned: unknown[] }).owned,
    ).toEqual([]);
  });
});
