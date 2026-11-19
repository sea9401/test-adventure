import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  upsertSave: vi.fn(),
  insertNotificationWith: vi.fn(async () => undefined),
  grantTitleIfMissingInTx: vi.fn(async () => true),
}));

vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: mocks.grantTitleIfMissingInTx,
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
  lifeMajorGrandGradeXp,
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
  mocks.grantTitleIfMissingInTx.mockClear();
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
    });
    // 산물은 결과 화면이 알린다. 얻을 때마다 알림을 남기면 다른 알림이 밀려난다(건의 #863).
    expect(mocks.insertNotificationWith).not.toHaveBeenCalled();
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

  describe("거장 등급", () => {
    const cap = lifeMajorStageXp("cooking", 10);
    const perGrade = lifeMajorGrandGradeXp("cooking");

    it("10단계를 넘어도 경험치를 쌓고, 등급이 오르면 알린다", async () => {
      mocks.store.set(LIFE_MAJOR_SAVE_KEY, { major: "cooking", masteryXp: { cooking: cap - 5 } });
      const first = await applyLifeMajorProgress(TX, "u1", "cooking", {
        overflowXp: 100,
        successes: 1,
        rng: () => 0.99,
      });
      expect(first.masteryXpGained).toBe(100);
      // 10단계에 닿았을 뿐 아직 거장 등급은 0이다.
      expect(mocks.insertNotificationWith).not.toHaveBeenCalled();

      // 한 번에 두 등급을 넘으면 마지막 등급으로 한 번만 알린다.
      await applyLifeMajorProgress(TX, "u1", "cooking", {
        overflowXp: perGrade * 2,
        successes: 1,
        rng: () => 0.99,
      });
      expect(mocks.insertNotificationWith).toHaveBeenCalledTimes(1);
      expect(mocks.insertNotificationWith).toHaveBeenCalledWith(TX, "u1", "grand_grade", {
        activity: "cooking",
        name: "요리",
        grade: 2,
      });
      expect((await readLifeMajorState(TX, "u1")).masteryXp.cooking).toBe(cap + 95 + perGrade * 2);
      expect(mocks.grantTitleIfMissingInTx).not.toHaveBeenCalled();
    });

    it("등급이 그대로면 알리지 않는다", async () => {
      mocks.store.set(LIFE_MAJOR_SAVE_KEY, { major: "cooking", masteryXp: { cooking: cap + perGrade } });
      await applyLifeMajorProgress(TX, "u1", "cooking", { overflowXp: perGrade - 1, successes: 1, rng: () => 0.99 });
      expect(mocks.insertNotificationWith).not.toHaveBeenCalled();
    });

    it("칭호 조건을 처음 채운 적립에서 칭호를 준다", async () => {
      mocks.store.set(LIFE_MAJOR_SAVE_KEY, {
        major: "cooking",
        masteryXp: { cooking: cap + perGrade * 9 + (perGrade - 1) },
      });
      await applyLifeMajorProgress(TX, "u1", "cooking", { overflowXp: 1, successes: 1, rng: () => 0.99 });
      expect(mocks.grantTitleIfMissingInTx).toHaveBeenCalledTimes(1);
      expect(mocks.grantTitleIfMissingInTx).toHaveBeenCalledWith(TX, "u1", "life_grand_cooking", expect.any(Number));

      // 이미 조건을 채운 뒤의 적립은 다시 지급을 시도하지 않는다.
      mocks.grantTitleIfMissingInTx.mockClear();
      await applyLifeMajorProgress(TX, "u1", "cooking", { overflowXp: perGrade, successes: 1, rng: () => 0.99 });
      expect(mocks.grantTitleIfMissingInTx).not.toHaveBeenCalled();
    });
  });
});
