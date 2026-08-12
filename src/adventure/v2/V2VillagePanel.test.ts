import { expect, it, vi } from "vitest";
import { nextSettlementBuildingUpgrade } from "@/adventure/data/v2/settlement";
import { confirmVillageBuildingUpgrade } from "./V2VillagePanel";

it("길드 건물 업그레이드 확인을 취소하면 요청을 실행하지 않는다", () => {
  const next = nextSettlementBuildingUpgrade("guild_smithy", 1);
  const onUpgrade = vi.fn();
  const confirm = vi.fn(() => false);

  expect(next).not.toBeNull();
  if (!next) return;
  expect(
    confirmVillageBuildingUpgrade({
      buildingId: "guild_smithy",
      next,
      confirm,
      onUpgrade,
    }),
  ).toBe(false);
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("업그레이드"));
  expect(onUpgrade).not.toHaveBeenCalled();
});
