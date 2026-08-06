import { describe, expect, it } from "vitest";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import {
  bestEquipmentBuyOrder,
  equipmentBatchSaleCandidates,
  equipmentBuyOrderMatches,
  equipmentOrderSnapshot,
  type EquipmentBuyOrderView,
} from "./equipmentBuyOrders";

const instance: V2EquipInstance = {
  iid: "eq_test",
  id: "v2_wooden_bow",
  roll: { power: 20, weight: 0 },
};

const order = (
  id: number,
  unitPrice: number,
  overrides: Partial<EquipmentBuyOrderView> = {},
): EquipmentBuyOrderView => ({
  id,
  isMine: false,
  itemId: instance.id,
  itemName: "나무 활",
  unitPrice,
  minPower: 15,
  minQualityPct: 0,
  createdAt: `2026-08-04T00:00:0${id}Z`,
  expiresAt: "2026-08-07T00:00:00Z",
  ...overrides,
});

describe("equipment buy order matching", () => {
  it("실제 위력과 품질 조건을 모두 검사한다", () => {
    expect(equipmentOrderSnapshot(instance)?.power).toBe(20);
    expect(equipmentBuyOrderMatches(order(1, 10_000), instance)).toBe(true);
    expect(
      equipmentBuyOrderMatches(order(1, 10_000, { minPower: 21 }), instance),
    ).toBe(false);
  });

  it("본인 주문을 제외하고 최고가 주문을 자동 선택한다", () => {
    expect(
      bestEquipmentBuyOrder(
        [
          order(1, 10_000),
          order(2, 30_000, { isMine: true }),
          order(3, 20_000),
        ],
        instance,
      )?.id,
    ).toBe(3);
  });

  it("동일 가격이면 먼저 등록된 주문을 선택해 판매자가 상대를 지목할 수 없게 한다", () => {
    expect(
      bestEquipmentBuyOrder(
        [
          order(7, 20_000, { createdAt: "2026-08-04T00:00:07Z" }),
          order(9, 20_000, { createdAt: "2026-08-04T00:00:01Z" }),
        ],
        instance,
      )?.id,
    ).toBe(9);
  });

  it("일괄 판매에서는 같은 주문을 두 장비에 중복 계산하지 않는다", () => {
    const second = { ...instance, iid: "eq_test_2" };
    const candidates = equipmentBatchSaleCandidates(
      [order(1, 20_000), order(2, 10_000)],
      [second, instance],
    );
    expect(candidates.map((row) => row.order.id)).toEqual([1, 2]);
  });
});
