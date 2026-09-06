export const MARKETPLACE_AUCTION_DURATIONS = [6, 12, 24] as const;
export function isMarketplaceAuctionDuration(value: unknown): value is number {
  return typeof value === "number" && MARKETPLACE_AUCTION_DURATIONS.some((hours) => hours === value);
}
