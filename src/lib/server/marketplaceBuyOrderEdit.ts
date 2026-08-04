export type MarketplaceBuyOrderEdit = {
  filledQuantity: number;
  quantityInitial: number;
  quantityRemaining: number;
  goldEscrow: number;
  escrowDelta: number;
  resetsPriority: boolean;
};

/**
 * 부분 체결된 구매 주문을 수정할 때의 에스크로·총수량을 계산한다.
 * requestedQuantity는 이미 체결된 수량을 제외한 "앞으로 살 수량"이다.
 */
export function marketplaceBuyOrderEdit(input: {
  quantityInitial: number;
  quantityRemaining: number;
  goldEscrow: number;
  unitPrice: number;
  requestedQuantity: number;
  requestedUnitPrice: number;
}): MarketplaceBuyOrderEdit {
  const filledQuantity = Math.max(
    0,
    input.quantityInitial - input.quantityRemaining,
  );
  const goldEscrow = input.requestedQuantity * input.requestedUnitPrice;
  return {
    filledQuantity,
    quantityInitial: filledQuantity + input.requestedQuantity,
    quantityRemaining: input.requestedQuantity,
    goldEscrow,
    escrowDelta: goldEscrow - input.goldEscrow,
    resetsPriority:
      input.requestedUnitPrice !== input.unitPrice ||
      input.requestedQuantity > input.quantityRemaining,
  };
}
