import type { PriceStat } from "./marketplaceShared";

const PRICE_TTL_MS = 30_000;
type Prices = Record<string, PriceStat>;
let cached: { receivedAt: number; prices: Prices } | undefined;
let pending: Promise<Prices> | undefined;

// Only shared reference prices belong here; never cache wallets or inventory.
export function invalidateMarketplacePrices(): void {
  cached = undefined;
  pending = undefined;
}

export function readMarketplacePrices(): Promise<Prices> {
  const age = cached ? Date.now() - cached.receivedAt : -1;
  if (cached && age >= 0 && age < PRICE_TTL_MS) {
    return Promise.resolve(cached.prices);
  }
  if (pending) return pending;

  const request = fetch("/api/v2/marketplace/prices")
    .then(async (response) => {
      const payload = await response.json() as { ok?: boolean; prices?: Prices };
      if (!response.ok || !payload?.ok || !payload.prices) {
        throw new Error("marketplace_prices_failed");
      }
      return payload.prices;
    })
    .then((prices) => {
      // An action may have invalidated the cache while this request was running.
      if (pending === request) {
        cached = { receivedAt: Date.now(), prices };
      }
      return prices;
    })
    .finally(() => {
      if (pending === request) pending = undefined;
    });
  pending = request;
  return request;
}
