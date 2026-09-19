export const MARKETPLACE_WATCHLIST_LIMIT = 200;
export const MARKETPLACE_WATCHLIST_SAVE_KEY = "marketplace-watchlist.v2";
export function isWatchListingId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647;
}
export function parseWatchIds(raw: unknown): number[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(isWatchListingId))].slice(0, MARKETPLACE_WATCHLIST_LIMIT) : [];
}
