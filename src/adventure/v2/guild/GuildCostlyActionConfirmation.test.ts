import { describe, expect, it, vi } from "vitest";
import { nextSettlementBuildingUpgrade } from "@/adventure/data/v2/settlement";
import {
  confirmCombatOperationsFunding,
  confirmCombatSupplyUpgrade,
} from "./GuildCombatSupplyPanel";
import { confirmGuildFacilityUpgrade } from "./GuildOutpostsPanel";

describe("길드 재화 소모 동작 확인", () => {
  it("길드 공용 버프 확인을 취소하면 업그레이드 요청을 실행하지 않는다", () => {
    const onUpgrade = vi.fn();
    const confirm = vi.fn(() => false);

    expect(
      confirmCombatSupplyUpgrade({
        supply: {
          id: "combat_exp",
          name: "경험 훈련 교범",
          level: 2,
          nextEffect: "전투 경험치 +6%",
          nextCost: 300,
        },
        confirm,
        onUpgrade,
      }),
    ).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("300 명성"));
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it("길드 시설 확인을 승인해야만 최종 업그레이드 요청을 실행한다", () => {
    const next = nextSettlementBuildingUpgrade("guild_smithy", 1);
    const onUpgrade = vi.fn();
    const confirm = vi.fn(() => true);

    expect(next).not.toBeNull();
    if (!next) return;
    expect(
      confirmGuildFacilityUpgrade({
        buildingId: "guild_smithy",
        next,
        confirm,
        onUpgrade,
      }),
    ).toBe(true);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining(`Lv.${next.level}`));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining(`${Math.max(0, next.cost.gold ?? 0).toLocaleString()} G`),
    );
    expect(onUpgrade).toHaveBeenCalledWith("guild_smithy");
  });

  it("주간 운용비 확인을 취소하면 길드 자금 결제를 실행하지 않는다", () => {
    const onFund = vi.fn();
    const confirm = vi.fn(() => false);

    expect(
      confirmCombatOperationsFunding({
        operations: {
          tier: 1,
          nextCost: 20_000_000,
        },
        confirm,
        onFund,
      }),
    ).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("20,000,000 G"),
    );
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("+2%p"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("+10%p"));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("월요일 00:00"),
    );
    expect(onFund).not.toHaveBeenCalled();
  });
});
