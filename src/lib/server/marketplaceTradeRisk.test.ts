import { describe, expect, it } from "vitest";
import { marketplaceEquipmentTradeRisk } from "./marketplaceTradeRisk";

describe("marketplace equipment trade risk", () => {
  it("동일 IP는 자동 제재가 아닌 검토 단계로 분류한다", () => {
    expect(
      marketplaceEquipmentTradeRisk({
        sameIp: true,
        nearFloor: false,
        repeatedPairTrades: 1,
      }),
    ).toEqual({ score: 60, level: "review", reasons: ["same_ip"] });
  });

  it("하한 근접과 반복 상대 신호를 합산하되 100점을 넘지 않는다", () => {
    expect(
      marketplaceEquipmentTradeRisk({
        sameIp: true,
        nearFloor: true,
        repeatedPairTrades: 7,
      }),
    ).toEqual({
      score: 100,
      level: "review",
      reasons: ["same_ip", "near_floor", "repeated_pair"],
    });
  });
});
