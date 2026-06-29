import { describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

vi.mock("@/lib/server/derivePlayerCombatV2", () => ({
  derivePlayerCombatV2: vi.fn(async () => null),
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
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/class-element/route";

function req(cls: string, element = "fire"): Request {
  return new Request("http://t/api/v2/me/class-element", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ class: cls, element }),
  });
}

describe("class-element — 코어루프 수동 로드아웃 보존", () => {
  it("모험가 속성 재조율은 비용을 지불하고 은행 골드를 우선 사용한다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "none",
      element: "fire",
      level: 10,
      exp: 123,
      gold: 500,
      bankedGold: 500_000,
      lastRespecAt: 0,
    });

    const res = await POST(req("none", "water"));
    const json = (await res.json()) as {
      ok?: boolean;
      class?: string;
      element?: string;
      gold?: number;
      bankedGold?: number;
      spent?: number;
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.class).toBe("none");
    expect(json.element).toBe("water");
    expect(json.spent).toBe(500_000);
    expect(json.gold).toBe(500);
    expect(json.bankedGold).toBe(0);

    const char = store.get("character.v2") as {
      element?: string;
      gold?: number;
      bankedGold?: number;
    };
    expect(char.element).toBe("water");
    expect(char.gold).toBe(500);
    expect(char.bankedGold).toBe(0);
  });

  it("속성 재조율은 쿨타임 없이 다시 변경할 수 있다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "none",
      element: "fire",
      level: 10,
      exp: 123,
      gold: 500_000,
      bankedGold: 0,
      lastRespecAt: 0,
      lastElementChangeAt: Date.now(),
    });

    const res = await POST(req("none", "water"));
    const json = (await res.json()) as {
      ok?: boolean;
      element?: string;
      spent?: number;
    };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.element).toBe("water");
    expect(json.spent).toBe(500_000);
  });

  it("직업군 변경 시 learned 는 보존하고 equipped 를 새 직업 체인으로 재산출하지 않는다", async () => {
    store.clear();
    store.set("character.v2", {
      class: "warrior",
      element: "fire",
      level: 100,
      exp: 123,
      gold: 1_000_000,
      bankedGold: 0,
      lastRespecAt: 0,
    });
    store.set("skills.v2", {
      learned: ["v2c_warrior_strike", "v2c_mage_boltcast"],
      equipped: ["v2c_mage_boltcast", "v2c_warrior_strike"],
    });
    store.set("proficiency.v2", {
      points: 0,
      groups: { warrior: { tier: 5, cultivations: 0, cumLevel: 2250 } },
      caps: {},
      grown: {},
    });

    const res = await POST(req("martial"));
    const json = (await res.json()) as { ok?: boolean; class?: string };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.class).toBe("martial");

    const skills = store.get("skills.v2") as {
      learned: string[];
      equipped: string[];
    };
    expect(skills.learned).toEqual(["v2c_warrior_strike", "v2c_mage_boltcast"]);
    expect(skills.equipped).toEqual([
      "v2c_mage_boltcast",
      "v2c_warrior_strike",
    ]);
  });
});
