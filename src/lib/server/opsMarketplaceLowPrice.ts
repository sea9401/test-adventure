export const EXTREME_LOW_PRICE_RATIO = 0.1;
export const EXTREME_LOW_PRICE_MIN_HISTORY = 5;
export const EXTREME_LOW_PRICE_MIN_REFERENCE_TOTAL = 100_000;

export type ExtremeLowMarketplacePriceAssessment = {
  actualUnitPrice: number;
  referenceUnitPrice: number;
  priceRatioPct: number;
  referenceSampleCount: number;
  referenceType:
    | "recent_median"
    | "catalog_floor"
    | "recent_median_or_catalog";
};

function positiveInteger(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.floor(value));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * 평균가보다 조금 싼 거래가 아니라, 최근 중앙값/카탈로그 하한의 10% 이하인
 * 거래만 감지한다. 소액 아이템과 이력이 적은 비장비는 알림에서 제외한다.
 */
export function assessExtremeLowMarketplacePrice(args: {
  grossGold: number;
  quantity: number;
  historicalUnitPrices: number[];
  catalogUnitFloor?: number | null;
}): ExtremeLowMarketplacePriceAssessment | null {
  const grossGold = positiveInteger(args.grossGold);
  const quantity = positiveInteger(args.quantity);
  if (grossGold == null || quantity == null) return null;

  const history = args.historicalUnitPrices.flatMap((value) => {
    const price = positiveInteger(value);
    return price == null ? [] : [price];
  });
  const historyReference =
    history.length >= EXTREME_LOW_PRICE_MIN_HISTORY ? median(history) : null;
  const catalogReference =
    args.catalogUnitFloor == null
      ? null
      : positiveInteger(args.catalogUnitFloor);
  if (historyReference == null && catalogReference == null) return null;

  const referenceUnitPrice = Math.round(
    Math.max(historyReference ?? 0, catalogReference ?? 0),
  );
  if (
    referenceUnitPrice * quantity <
    EXTREME_LOW_PRICE_MIN_REFERENCE_TOTAL
  ) {
    return null;
  }
  const actualUnitPrice = Math.max(1, Math.ceil(grossGold / quantity));
  if (actualUnitPrice > referenceUnitPrice * EXTREME_LOW_PRICE_RATIO) {
    return null;
  }

  return {
    actualUnitPrice,
    referenceUnitPrice,
    priceRatioPct:
      Math.round((actualUnitPrice / referenceUnitPrice) * 1_000) / 10,
    referenceSampleCount: history.length,
    referenceType:
      historyReference != null && catalogReference != null
        ? "recent_median_or_catalog"
        : historyReference != null
          ? "recent_median"
          : "catalog_floor",
  };
}
