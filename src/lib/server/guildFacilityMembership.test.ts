import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUILD_DINING_USER_SAVE_KEY } from "@/adventure/data/v2/guildDining";

const { reconcileSources, lockSave, upsert } = vi.hoisted(() => ({
  reconcileSources: vi.fn(),
  lockSave: vi.fn(),
  upsert: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/adventurerAssociation", () => ({
  reconcileWeeklyFacilitySourcesOnGuildJoin: reconcileSources,
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: lockSave,
  upsertSave: upsert,
}));

import {
  addGuildMemberWithFacilityReconciliation,
  reconcileGuildFacilitiesOnJoin,
} from "./guildFacilityMembership";

describe("길드 가입 시설 승계", () => {
  const tx = {} as never;
  const now = new Date("2026-08-11T03:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    lockSave.mockResolvedValue({
      weekKey: "2026-08-10",
      guildId: 0,
      contributionPoints: 12,
      mealsUsed: 2,
    });
  });

  it("안전 시설 출처를 승계하고 협회 식당 개인 상태를 새 길드에 보존한다", async () => {
    reconcileSources.mockResolvedValue([
      "training_ground",
      "dining_hall",
    ]);

    const result = await reconcileGuildFacilitiesOnJoin(tx, "u-join", 7, now);

    expect(result).toEqual({
      weekKey: "2026-08-10",
      transferred: ["training_ground", "dining_hall"],
    });
    expect(upsert).toHaveBeenCalledWith(
      tx,
      "u-join",
      GUILD_DINING_USER_SAVE_KEY,
      expect.objectContaining({
        weekKey: "2026-08-10",
        guildId: 7,
        contributionPoints: 12,
        mealsUsed: 2,
      }),
    );
  });

  it("식당을 사용하지 않았다면 빈 식당 상태를 새로 저장하지 않는다", async () => {
    reconcileSources.mockResolvedValue(["training_ground"]);

    const result = await reconcileGuildFacilitiesOnJoin(tx, "u-join", 7, now);

    expect(result.transferred).toEqual(["training_ground"]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("길드원 추가와 시설 승계를 하나의 가입 작업으로 처리한다", async () => {
    reconcileSources.mockResolvedValue(["training_ground"]);
    const values = vi.fn(async () => undefined);
    const joinTx = {
      insert: vi.fn(() => ({ values })),
    } as never;

    const result = await addGuildMemberWithFacilityReconciliation(
      joinTx,
      "u-join",
      7,
      now,
    );

    expect(values).toHaveBeenCalledWith({
      guildId: 7,
      userId: "u-join",
      role: "member",
    });
    expect(result.transferred).toEqual(["training_ground"]);
  });
});
