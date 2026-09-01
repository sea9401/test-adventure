import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => null),
}));

import { POST as buy } from "./buy/route";
import { POST as buyStack } from "./buy-stack/route";
import {
  GET as getBuyOrders,
  PATCH as patchBuyOrder,
  POST as createBuyOrder,
} from "./buy-orders/route";
import { POST as cancelBuyOrder } from "./buy-orders/cancel/route";
import { POST as sellEquipment } from "./buy-orders/sell-equipment/route";
import { POST as sellEquipmentBatch } from "./buy-orders/sell-equipment-batch/route";
import { POST as reprice } from "./reprice/route";

const handlers = [
  ["장비 즉시 구매", buy],
  ["스택 부분 구매", buyStack],
  ["구매 주문 조회", getBuyOrders],
  ["구매 주문 생성", createBuyOrder],
  ["구매 주문 수정", patchBuyOrder],
  ["구매 주문 취소", cancelBuyOrder],
  ["구매 주문에 장비 판매", sellEquipment],
  ["구매 주문에 장비 일괄 판매", sellEquipmentBatch],
  ["판매 시작가 수정", reprice],
] as const;

describe("종료된 경매장 기능", () => {
  it.each(handlers)("%s API는 일관된 410 응답을 반환한다", async (_name, handler) => {
    const response = await handler(
      new Request("http://test/api/v2/marketplace/retired", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "marketplace_feature_retired",
    });
  });
});
