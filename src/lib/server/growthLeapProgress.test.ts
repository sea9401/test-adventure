import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GROWTH_LEAP_SAVE_KEY,
  activateGrowthLeap,
} from "@/adventure/data/v2/growthLeap";

const mocks = vi.hoisted(() => ({
  saves: new Map<string, unknown>(),
}));

vi.mock("@/lib/server/savesKv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/savesKv")>()),
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: unknown) =>
      mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: object, _userId: string, key: string, value: unknown) => {
      mocks.saves.set(key, value);
    },
  ),
}));

import { upsertSave } from "@/lib/server/savesKv";
import { recordGrowthLeapStaminaSpendInTx } from "./growthLeapProgress";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saves.clear();
});

describe("성장 도약 스태미나 진행 기록", () => {
  it("활성 의뢰의 확정 비용을 누적하고 갱신된 의뢰를 반환한다", async () => {
    const now = 2_000;
    const activated = activateGrowthLeap({}, 1_000);
    if (!activated.ok) throw new Error("expected activation");
    mocks.saves.set(GROWTH_LEAP_SAVE_KEY, activated.state);

    const mission = await recordGrowthLeapStaminaSpendInTx(
      {} as never,
      "u1",
      20,
      now,
    );

    expect(mission).toMatchObject({ status: "active", staminaSpent: 20 });
    expect(mocks.saves.get(GROWTH_LEAP_SAVE_KEY)).toMatchObject({
      mission: { staminaSpent: 20 },
    });
  });

  it("미구매·만료 의뢰와 양수가 아닌 비용은 저장하지 않는다", async () => {
    expect(
      await recordGrowthLeapStaminaSpendInTx({} as never, "u1", 20, 2_000),
    ).toEqual({ status: "not_purchased" });
    expect(upsertSave).not.toHaveBeenCalled();

    const activated = activateGrowthLeap({}, 1_000);
    if (!activated.ok) throw new Error("expected activation");
    mocks.saves.set(GROWTH_LEAP_SAVE_KEY, activated.state);
    await recordGrowthLeapStaminaSpendInTx({} as never, "u1", 0, 2_000);
    await recordGrowthLeapStaminaSpendInTx(
      {} as never,
      "u1",
      20,
      activated.state.mission!.progressUntil + 1,
    );

    expect(upsertSave).not.toHaveBeenCalled();
    expect(mocks.saves.get(GROWTH_LEAP_SAVE_KEY)).toEqual(activated.state);
  });
});
