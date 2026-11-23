// 유찰 시 자동 인하 재등록 — 판매자가 등록할 때 켜는 옵션.
// 입찰 없이 끝나면 물품을 돌려주지 않고 가격을 낮춘 새 매물로 한 번 더 올린다.
// 2026-11 운영 기록에서 유찰된 장비를 25% 넘게 낮춰 다시 올리면 첫 등록만큼(34%) 팔렸다.

/** 자동으로 다시 올릴 때의 인하 폭(%). */
export const MARKETPLACE_AUTO_RELIST_CUT_PCT = 30;
/** 한 매물이 자동으로 다시 올라가는 횟수. */
export const MARKETPLACE_AUTO_RELIST_TIMES = 1;

/** 자동 재등록 가격. 더 낮출 수 없으면(이미 1골드) null. */
export function marketplaceAutoRelistPrice(price: number): number | null {
  const current = Math.floor(Number(price));
  if (!Number.isFinite(current) || current <= 1) return null;
  const next = Math.max(
    1,
    Math.floor((current * (100 - MARKETPLACE_AUTO_RELIST_CUT_PCT)) / 100),
  );
  return next < current ? next : null;
}
