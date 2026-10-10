import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  upsertSave: vi.fn(),
  insertNotificationWith: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/v2Notifications", () => ({
  insertNotificationWith: mocks.insertNotificationWith,
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    mocks.store.has(key) ? structuredClone(mocks.store.get(key)) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    mocks.store.has(key) ? structuredClone(mocks.store.get(key)) : fallback,
  ),
  upsertSave: mocks.upsertSave.mockImplementation(async (_tx, _uid, key: string, value: unknown) => {
    mocks.store.set(key, structuredClone(value));
  }),
}));

import {
  LIFE_MAJOR_PRODUCT_ID,
  LIFE_MAJOR_SAVE_KEY,
  lifeMajorStageXp,
} from "@/adventure/v2/lifeMajor";
import { applyLifeMajorProgress, readLifeMajorState } from "./lifeMajor";

const TX = {} as never;

function seedMajor(activity: "mining" | "cooking", stage = 3) {
  mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
    major: activity,
    masteryXp: { [activity]: lifeMajorStageXp(activity, stage) },
  });
}

afterEach(() => {
  mocks.store.clear();
  mocks.upsertSave.mockClear();
  mocks.insertNotificationWith.mockClear();
});

describe("applyLifeMajorProgress", () => {
  it("전공이 아니면 아무것도 쓰지 않는다", async () => {
    const result = await applyLifeMajorProgress(TX, "u1", "mining", {
      overflowXp: 100,
      successes: 5,
      rng: () => 0,
    });
    expect(result).toEqual({ masteryXpGained: 0, productId: null, productCount: 0 });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("넘친 경험치를 명장 경험치로 쌓고 성공마다 산물을 굴린다", async () => {
    seedMajor("mining");
    const result = await applyLifeMajorProgress(TX, "u1", "mining", {
      overflowXp: 100,
      successes: 5,
      rng: () => 0.001,
    });
    expect(result).toEqual({
      masteryXpGained: 100,
      productId: LIFE_MAJOR_PRODUCT_ID.mining,
      productCount: 5,
    });
    expect(mocks.store.get(LIFE_MAJOR_SAVE_KEY)).toMatchObject({
      masteryXp: { mining: lifeMajorStageXp("mining", 3) + 100 },
      masterProductsEarned: { mining: 5 },
    });    expect(mocks.insertNotificationWith).toHaveBeenCalledWith(TX, "u1", "master_product", {
      activity: "mining",
      materialId: LIFE_MAJOR_PRODUCT_ID.mining,
      name: "명장 합금",
      count: 5,
    });
  });

  it("확률을 넘는 굴림은 산물을 주지 않는다", async () => {
    seedMajor("mining");
    const result = await applyLifeMajorProgress(TX, "u1", "mining", {
      overflowXp: 0,
      successes: 5,
      rng: () => 0.99,
    });
    expect(result).toEqual({ masteryXpGained: 0, productId: null, productCount: 0 });
    expect(mocks.insertNotificationWith).not.toHaveBeenCalled();
  });

  it("요리 전공은 경험치만 쌓고 산물이 없다", async () => {
    seedMajor("cooking");
    const result = await applyLifeMajorProgress(TX, "u1", "cooking", {
      overflowXp: 40,
      successes: 3,
      rng: () => 0,
    });
    expect(result).toEqual({ masteryXpGained: 40, productId: null, productCount: 0 });
  });
});

describe("readLifeMajorState", () => {
  it("세이브가 없으면 빈 상태", async () => {
    expect(await readLifeMajorState(TX, "u1")).toMatchObject({ major: null, minor: null });
  });
});
