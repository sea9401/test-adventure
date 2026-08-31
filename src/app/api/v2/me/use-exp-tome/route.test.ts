import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProficiency } from "@/adventure/data/v2/proficiency";
import { newRareMapInstance } from "@/adventure/data/v2/rareMaps";

const mocks = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "exp-tome-user"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return {
    ...actual,
    V2_CORE_LOOP_V2: true,
    V2_EQUIPMENT_LIBERATION: true,
  };
});
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx, _userId, key: string, fallback: unknown) =>
      mocks.store.has(key) ? mocks.store.get(key) : fallback,
  ),
  upsertSave: vi.fn(
    async (_tx, _userId, key: string, value: unknown) => {
      mocks.store.set(key, value);
    },
  ),
}));

import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/v2/me/use-exp-tome", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ map: "exp-map" }),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.store.clear();
  mocks.store.set("character.v2", {
    class: "warrior",
    level: 1,
    exp: 0,
    rareMaps: [newRareMapInstance("exp_tome", 1, Date.now(), "exp-map")],
  });
  mocks.store.set("proficiency.v2", emptyProficiency());
  mocks.store.set("equipment.v2", {
    owned: [
      {
        iid: "growth-necklace",
        id: "v2_storm_sanctuary_necklace",
        liberation: {
          rank: 1,
          lineCount: 1,
          revision: 1,
          options: [{ id: "level_up_max_mp_growth", level: 20 }],
        },
      },
    ],
    equipped: { necklace: "growth-necklace" },
  });
  vi.spyOn(Math, "random").mockReturnValue(0.999999);
});

describe("POST /api/v2/me/use-exp-tome — 장비 해방 성장", () => {
  it("실제 오른 레벨마다 시작 장비의 MP 성장치를 누적한다", async () => {
    const response = await POST(request());
    const json = (await response.json()) as {
      levelsGained: number;
      liberationMpGained: number;
    };

    expect(response.status).toBe(200);
    expect(json.levelsGained).toBeGreaterThan(0);
    expect(json.liberationMpGained).toBe(json.levelsGained * 10);
    expect(
      (mocks.store.get("proficiency.v2") as {
        liberationCycleGrowth: { hp: number; mp: number };
      }).liberationCycleGrowth,
    ).toEqual({ hp: 0, mp: json.levelsGained * 10 });
  });
});
