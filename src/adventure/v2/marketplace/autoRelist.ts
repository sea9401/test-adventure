// 유찰 시 자동 인하 재등록 — 판매자가 등록할 때 켜는 옵션.
// 입찰 없이 끝나면 물품을 돌려주지 않고 가격을 낮춘 새 매물로 한 번 더 올린다.
// 인하 폭은 판매자가 정한다(오너 결정 2026-11-24). 기본값 30%는 2026-11 운영 기록에서
// 유찰된 장비를 25% 넘게 낮춰 다시 올렸을 때 첫 등록만큼(34%) 팔린 데서 잡았다.

/** 인하 폭을 따로 정하지 않았을 때의 값(%). */
export const MARKETPLACE_AUTO_RELIST_DEFAULT_CUT_PCT = 30;
/** 판매자가 정할 수 있는 인하 폭 범위(%). */
export const MARKETPLACE_AUTO_RELIST_MIN_CUT_PCT = 1;
export const MARKETPLACE_AUTO_RELIST_MAX_CUT_PCT = 90;
/** 한 매물이 자동으로 다시 올라가는 횟수. */
export const MARKETPLACE_AUTO_RELIST_TIMES = 1;

export function isMarketplaceAutoRelistCutPct(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MARKETPLACE_AUTO_RELIST_MIN_CUT_PCT &&
    value <= MARKETPLACE_AUTO_RELIST_MAX_CUT_PCT
  );
}

/** 저장된 인하 폭을 읽는다. 범위를 벗어난 값은 기본값으로 본다. */
export function marketplaceAutoRelistCutPct(value: unknown): number {
  return isMarketplaceAutoRelistCutPct(value)
    ? value
    : MARKETPLACE_AUTO_RELIST_DEFAULT_CUT_PCT;
}

/** 자동 재등록 가격. 더 낮출 수 없으면(이미 1골드) null. */
export function marketplaceAutoRelistPrice(
  price: number,
  cutPct: number = MARKETPLACE_AUTO_RELIST_DEFAULT_CUT_PCT,
): number | null {
  const current = Math.floor(Number(price));
  if (!Number.isFinite(current) || current <= 1) return null;
  const cut = marketplaceAutoRelistCutPct(cutPct);
  const next = Math.max(1, Math.floor((current * (100 - cut)) / 100));
  return next < current ? next : null;
}
