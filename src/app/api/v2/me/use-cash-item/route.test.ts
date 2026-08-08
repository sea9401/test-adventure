import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "cash-item-user"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
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
import {
  emptyProficiency,
  V2_CULTIVATION_RESET_GOLD_COST,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";

function request(itemId = "cultivation_reset_potion") {
  return new Request("http://localhost/api/v2/me/use-cash-item", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.clear();
  mocks.store.set("character.v2", {
    class: "warrior",
    level: 100,
    gold: 123,
    bankedGold: 456,
    cashItems: { cultivation_reset_potion: 2 },
  });
  mocks.store.set("proficiency.v2", {
    ...emptyProficiency(),
    points: 60,
    caps: { str: 4, vit: 2, dex: 2 },
    grown: { str: 3, vit: 2, dex: 1 },
    growthRespecPoints: 5,
    cultivationPointsSpent: 40,
    cultivationResetCount: 7,
  } satisfies V2ProficiencyState);
});

describe("POST /api/v2/me/use-cash-item — 수행 초기화 물약", () => {
  it("골드 없이 수행을 초기화하고 성공한 뒤에만 물약 한 개를 소모한다", async () => {
    const response = await POST(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      itemId: "cultivation_reset_potion",
      cashItems: { cultivation_reset_potion: 1 },
      spentGold: 0,
      refundedPoints: 40,
      points: 100,
      capGains: 0,
      caps: {},
      growthRespecPoints: 11,
      resetCount: 8,
      nextResetGoldCost: V2_CULTIVATION_RESET_GOLD_COST,
    });

    expect(mocks.store.get("character.v2")).toMatchObject({
      gold: 123,
      bankedGold: 456,
      cashItems: { cultivation_reset_potion: 1 },
    });
    expect(mocks.store.get("proficiency.v2")).toMatchObject({
      caps: {},
      grown: {},
      growthRespecPoints: 11,
      cultivationPointsSpent: 0,
      cultivationResetCount: 8,
    });
  });

  it("초기화할 수행이 없으면 물약을 소모하지 않는다", async () => {
    mocks.store.set("proficiency.v2", emptyProficiency());

    const response = await POST(request());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("nothing_to_reset");
    expect(mocks.store.get("character.v2")).toMatchObject({
      cashItems: { cultivation_reset_potion: 2 },
    });
  });

  it("물약이 없으면 수행 상태를 변경하지 않는다", async () => {
    mocks.store.set("character.v2", {
      class: "warrior",
      level: 100,
      cashItems: {},
    });
    const before = mocks.store.get("proficiency.v2");

    const response = await POST(request());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("not_owned");
    expect(mocks.store.get("proficiency.v2")).toBe(before);
  });
});

describe("POST /api/v2/me/use-cash-item — 100레벨 달성의 비약", () => {
  it("비약 한 개를 소모하고 100레벨과 성장 상태를 함께 저장한다", async () => {
    mocks.store.set("character.v2", {
      class: "warrior",
      level: 70,
      exp: 321,
      cashItems: { level_100_elixir: 2 },
    });
    mocks.store.set("proficiency.v2", emptyProficiency());

    const response = await POST(request("level_100_elixir"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      itemId: "level_100_elixir",
      cashItems: { level_100_elixir: 1 },
      level: 100,
      levelsGained: 30,
    });
    expect(mocks.store.get("character.v2")).toMatchObject({
      level: 100,
      exp: 0,
      cashItems: { level_100_elixir: 1 },
    });
    const proficiency = mocks.store.get("proficiency.v2") as V2ProficiencyState;
    expect(proficiency.groups).toEqual({});
    expect(proficiency.jobCumLevel).toEqual({});
    expect(
      Object.values(proficiency.grown).reduce(
        (sum, value) => sum + (value ?? 0),
        0,
      ),
    ).toBe(90);
  });

  it("이미 100레벨이면 비약을 소모하지 않는다", async () => {
    mocks.store.set("character.v2", {
      class: "warrior",
      level: 100,
      exp: 0,
      cashItems: { level_100_elixir: 1 },
    });
    const proficiencyBefore = mocks.store.get("proficiency.v2");

    const response = await POST(request("level_100_elixir"));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "already_max_level",
    });
    expect(mocks.store.get("character.v2")).toMatchObject({
      level: 100,
      cashItems: { level_100_elixir: 1 },
    });
    expect(mocks.store.get("proficiency.v2")).toBe(proficiencyBefore);
  });

  it("비약을 보유하지 않았으면 캐릭터와 숙련도를 변경하지 않는다", async () => {
    mocks.store.set("character.v2", {
      class: "warrior",
      level: 70,
      exp: 321,
      cashItems: {},
    });
    const characterBefore = mocks.store.get("character.v2");
    const proficiencyBefore = mocks.store.get("proficiency.v2");

    const response = await POST(request("level_100_elixir"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "not_owned",
    });
    expect(mocks.store.get("character.v2")).toBe(characterBefore);
    expect(mocks.store.get("proficiency.v2")).toBe(proficiencyBefore);
  });
});
