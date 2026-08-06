import { describe, expect, it } from "vitest";
import { marketplaceBuyOrderEdit } from "./marketplaceBuyOrderEdit";

describe("marketplaceBuyOrderEdit", () => {
  it("부분 체결 수량은 유지하고 남은 주문 수량만 수정한다", () => {
    expect(
      marketplaceBuyOrderEdit({
        quantityInitial: 10,
        quantityRemaining: 6,
        goldEscrow: 600,
        unitPrice: 100,
        requestedQuantity: 3,
        requestedUnitPrice: 120,
      }),
    ).toMatchObject({
      filledQuantity: 4,
      quantityInitial: 7,
      quantityRemaining: 3,
      goldEscrow: 360,
      escrowDelta: -240,
    });
  });

  it("가격 변경 또는 수량 증가는 시간 우선순위를 초기화한다", () => {
    const base = {
      quantityInitial: 10,
      quantityRemaining: 10,
      goldEscrow: 1_000,
      unitPrice: 100,
    };
    expect(
      marketplaceBuyOrderEdit({
        ...base,
        requestedQuantity: 10,
        requestedUnitPrice: 110,
      }).resetsPriority,
    ).toBe(true);
    expect(
      marketplaceBuyOrderEdit({
        ...base,
        requestedQuantity: 11,
        requestedUnitPrice: 100,
      }).resetsPriority,
    ).toBe(true);
    expect(
      marketplaceBuyOrderEdit({
        ...base,
        requestedQuantity: 9,
        requestedUnitPrice: 100,
      }).resetsPriority,
    ).toBe(false);
  });
});
