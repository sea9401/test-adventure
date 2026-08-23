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
  ensureUser: vi.fn(async () => "cultivation-reset-user"),
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

function activeCultivation(
  overrides: Partial<V2ProficiencyState> = {},
): V2ProficiencyState {
  return {
    ...emptyProficiency(),
    points: 60,
    groups: {
      warrior: { cultivations: 2, tier: 1, cumLevel: 77 },
    },
    caps: { str: 4, vit: 2, dex: 2 },
    grown: { str: 3, vit: 2, dex: 1 },
    growthRespecPoints: 5,
    cultivationPointsSpent: 40,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.clear();
  mocks.store.set("character.v2", {
    class: "warrior",
    level: 100,
    exp: 777,
    gold: 20_000_000,
    bankedGold: 0,
  });
  mocks.store.set("proficiency.v2", activeCultivation());
});

describe("POST /api/v2/me/cultivate/reset", () => {
  it("첫 초기화는 무료이며 숙달 포인트를 환급하고 레벨 1로 되돌린다", async () => {
    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.spentGold).toBe(0);
    expect(json.refundedPoints).toBe(40);
    expect(json.points).toBe(100);
    expect(json.resetCount).toBe(1);
    expect(json.nextResetGoldCost).toBe(V2_CULTIVATION_RESET_GOLD_COST);
    expect(json.gold).toBe(20_000_000);
    expect(json.growthRespecPoints).toBe(0);
    expect(json.level).toBe(1);
    expect(json.exp).toBe(0);

    expect(mocks.store.get("character.v2")).toMatchObject({
      level: 1,
      exp: 0,
      gold: 20_000_000,
      bankedGold: 0,
    });

    const saved = mocks.store.get("proficiency.v2") as V2ProficiencyState;
    expect(saved.caps).toEqual({});
    expect(saved.groups.warrior).toEqual({
      cultivations: 2,
      tier: 1,
      cumLevel: 77,
    });
    expect(saved.cultivationPointsSpent).toBe(0);
    expect(saved.grown).toEqual({});
    expect(saved.growthRespecPoints).toBe(0);
  });

  it("두 번째부터는 1,500만 골드를 차감한다", async () => {
    mocks.store.set(
      "proficiency.v2",
      activeCultivation({ cultivationResetCount: 1 }),
    );

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.spentGold).toBe(V2_CULTIVATION_RESET_GOLD_COST);
    expect(json.gold).toBe(5_000_000);
    expect(json.resetCount).toBe(2);
  });

  it("유료 초기화 골드가 부족하면 상태를 변경하지 않는다", async () => {
    mocks.store.set("character.v2", {
      class: "warrior",
      gold: V2_CULTIVATION_RESET_GOLD_COST - 1,
      bankedGold: 0,
    });
    mocks.store.set(
      "proficiency.v2",
      activeCultivation({ cultivationResetCount: 1 }),
    );

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("insufficient_gold");
    const saved = mocks.store.get("proficiency.v2") as V2ProficiencyState;
    expect(saved.caps).toEqual({ str: 4, vit: 2, dex: 2 });
  });
});
