# Auction-Only Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every marketplace listing into a six-hour, whole-lot auction, retire instant purchases and buy orders, extend near-expiry auctions by ten minutes per qualifying bid, and safely return all legacy escrow.

**Architecture:** Keep the existing listing, bid, inbox, fulfillment, and escrow tables and add an `auction_mode_version` discriminator so legacy rows can be hidden and drained without being mistaken for new auctions. Centralize duration, minimum-bid, phase, and extension behavior in `marketplaceV2.ts`; keep route handlers authoritative and transactional. Reuse the existing escrow cancellation functions for idempotent legacy returns, and narrow the client to individual auction cards with no partial-fill purchase path.

**Tech Stack:** Next.js App Router route handlers, React client components, TypeScript, Drizzle ORM/PostgreSQL, Vitest and Testing Library.

## Global Constraints

- Every new listing accepts bids for exactly 6 hours.
- A valid bid with less than 10 minutes remaining adds 10 minutes to the existing deadline; exactly 10 minutes does not extend; repeated extensions have no cap.
- A stack listing is one indivisible lot, and its `price` is the whole lot's starting bid.
- First bid is at least the starting bid; later bids use `max(current + 1, ceil(current × 1.05))`.
- Legacy active listings, their unresolved highest bids, and all active buy orders are returned rather than converted.
- Instant purchase, partial stack purchase, buy-order writes, sell-to-order writes, and repricing return HTTP 410.
- Existing tax, trade suspension, anonymity, inbox escrow, history, reporting, and rare-map restoration rules stay in force.
- Do not deploy or change maintenance mode.

---

### Task 1: Auction Policy and Schema Discriminator

**Files:**
- Modify: `src/lib/server/marketplaceV2.test.ts`
- Modify: `src/lib/server/marketplaceV2.ts`
- Modify: `src/db/schema.ts`
- Create: generated `drizzle/0179_auction_only_marketplace.sql`
- Modify: generated `drizzle/meta/0179_snapshot.json`
- Modify: generated `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `MARKETPLACE_V2_AUCTION_MODE_VERSION = 1`
- Produces: `MARKETPLACE_V2_AUCTION_HOURS = 6`
- Produces: `MARKETPLACE_V2_BID_EXTENSION_WINDOW_MINUTES = 10`
- Produces: `MARKETPLACE_V2_BID_EXTENSION_MINUTES = 10`
- Produces: `marketplaceAuctionTimes(createdAt: Date): { bidEndsAt: Date; expiresAt: Date }`
- Produces: `marketplaceNextBidMinimum(startingPrice: number, currentBid: number | null): number`
- Produces: `marketplaceBidExtendedTimes(now: Date, bidEndsAt: Date, expiresAt: Date): { bidEndsAt: Date; expiresAt: Date; extended: boolean }`
- Produces: `marketplaceListingsV2.auctionModeVersion`

- [ ] **Step 1: Replace hybrid-policy expectations with failing auction-policy tests**

```ts
expect(marketplaceAuctionTimes(new Date("2026-08-31T00:00:00.000Z"))).toEqual({
  bidEndsAt: new Date("2026-08-31T06:00:00.000Z"),
  expiresAt: new Date("2026-08-31T06:00:00.001Z"),
});
expect(marketplaceNextBidMinimum(400, null)).toBe(400);
expect(marketplaceNextBidMinimum(400, 400)).toBe(420);
expect(marketplaceNextBidMinimum(400, 401)).toBe(422);
expect(marketplaceBidExtendedTimes(nowAtTenMinutes, endsAt, expiresAt).extended).toBe(false);
expect(marketplaceBidExtendedTimes(nowInsideWindow, endsAt, expiresAt)).toEqual({
  bidEndsAt: new Date(endsAt.getTime() + 600_000),
  expiresAt: new Date(expiresAt.getTime() + 600_000),
  extended: true,
});
```

- [ ] **Step 2: Run the focused policy test and confirm the old hybrid helpers fail the new assertions**

Run: `npx vitest run src/lib/server/marketplaceV2.test.ts`

Expected: FAIL because the auction constants and extension helper do not exist and a first bid currently starts at one gold.

- [ ] **Step 3: Implement the auction-only policy helpers and public-listing minimum bid**

```ts
export const MARKETPLACE_V2_AUCTION_MODE_VERSION = 1;
export const MARKETPLACE_V2_AUCTION_HOURS = 6;
export const MARKETPLACE_V2_BID_EXTENSION_WINDOW_MINUTES = 10;
export const MARKETPLACE_V2_BID_EXTENSION_MINUTES = 10;

export function marketplaceNextBidMinimum(startingPrice: number, currentBid: number | null) {
  if (currentBid == null || currentBid <= 0) return startingPrice;
  return Math.min(
    MARKETPLACE_V2_PRICE_MAX,
    Math.max(currentBid + 1, Math.ceil(currentBid * (1 + MARKETPLACE_V2_MIN_BID_RAISE_RATE))),
  );
}
```

Remove selectable grace/fixed/direct constants and make the listing phase only `closed | bidding | auction_settlement`. Make `marketplacePublicListing` call `marketplaceNextBidMinimum(row.price, row.highestBid)`.

- [ ] **Step 4: Add the safe discriminator and generate migration metadata**

Add this field to `marketplaceListingsV2`:

```ts
auctionModeVersion: integer("auction_mode_version").notNull().default(0),
```

Then run: `npm run db:generate -- --name auction_only_marketplace`

Expected migration SQL:

```sql
ALTER TABLE "marketplace_listings_v2" ADD COLUMN "auction_mode_version" integer DEFAULT 0 NOT NULL;
```

- [ ] **Step 5: Run focused tests and migration validation**

Run: `npx vitest run src/lib/server/marketplaceV2.test.ts src/db/migrationJournal.test.ts`

Run: `npm run check-migrations`

Expected: PASS.

- [ ] **Step 6: Commit the policy and schema slice**

```bash
git add src/lib/server/marketplaceV2.ts src/lib/server/marketplaceV2.test.ts src/db/schema.ts drizzle
git commit -m "feat: establish auction-only marketplace policy"
```

### Task 2: Six-Hour Listing and Auction Browse APIs

**Files:**
- Modify: `src/lib/server/marketplaceListRoute.test.ts`
- Modify: `src/app/api/v2/marketplace/list/route.ts`
- Modify: `src/app/api/v2/marketplace/browse/route.ts`
- Modify: `src/lib/server/marketplaceBuyOrdersV2.ts`
- Modify: `src/lib/server/marketplaceBuyOrdersV2.test.ts`

**Interfaces:**
- Consumes: auction constants, `marketplaceAuctionTimes`, and `auctionModeVersion` from Task 1.
- Produces: browse response fields `auctionHours`, `bidExtensionWindowMinutes`, and `bidExtensionMinutes`.
- Produces: new rows explicitly storing `auctionModeVersion: MARKETPLACE_V2_AUCTION_MODE_VERSION`.

- [ ] **Step 1: Write failing route-policy and price-alert tests**

Assert that listing source no longer accepts `graceHours`, every insert includes version `1`, stack `price` is passed through as total starting price, and buy-order auto-match is not called. Add a price-alert helper test proving `{ price: 900, quantity: 3 }` compares as a 300-gold unit starting price.

- [ ] **Step 2: Run focused tests and confirm hybrid behavior fails**

Run: `npx vitest run src/lib/server/marketplaceListRoute.test.ts src/lib/server/marketplaceBuyOrdersV2.test.ts`

Expected: FAIL on `graceHours`, auto-match, and missing auction version assertions.

- [ ] **Step 3: Make listing creation unconditionally auction-only**

Delete `graceHours` from the request body and validation. Build times with `marketplaceAuctionTimes(createdAt)`, insert the current auction version for equip/material/consumable rows, remove `prepareMarketplaceMatchScope`, `matchMarketplaceBuyOrdersForItem`, and all conditional direct-sale matching branches. Trigger price alerts for a newly inserted stack listing using its total starting price divided by quantity.

- [ ] **Step 4: Filter browse results to current auction rows and return current policy**

```ts
const conds = [
  eq(marketplaceListingsV2.status, "active"),
  eq(marketplaceListingsV2.auctionModeVersion, MARKETPLACE_V2_AUCTION_MODE_VERSION),
];
```

Replace grace/fixed/direct response values with the three auction timing fields and include `auctionModeVersion` in selected rows where needed.

- [ ] **Step 5: Run focused listing and browse tests**

Run: `npx vitest run src/lib/server/marketplaceListRoute.test.ts src/lib/server/marketplaceBuyOrdersV2.test.ts src/lib/server/marketplaceV2.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the creation and browse slice**

```bash
git add src/app/api/v2/marketplace/list/route.ts src/app/api/v2/marketplace/browse/route.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/marketplaceBuyOrdersV2.ts src/lib/server/marketplaceBuyOrdersV2.test.ts
git commit -m "feat: create six-hour marketplace auctions"
```

### Task 3: Starting Bids and Cumulative Anti-Sniping Extension

**Files:**
- Create: `src/app/api/v2/marketplace/bid/route.test.ts`
- Modify: `src/app/api/v2/marketplace/bid/route.ts`
- Modify: `src/lib/server/tradeSuspensionAuctionLifecycle.test.ts`
- Modify: `src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts`

**Interfaces:**
- Consumes: `marketplaceNextBidMinimum(price, highestBid)` and `marketplaceBidExtendedTimes(...)`.
- Produces: bid response `{ highestBid, nextBid, bidEndsAt, extended, gold, bankedGold }`.

- [ ] **Step 1: Write failing bid-route tests**

Cover these cases with the repository's mocked Drizzle transaction pattern:

```ts
it("rejects a first bid below the whole-lot starting price", async () => {
  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ error: "bid_too_low", nextBid: 500 });
});

it("adds ten minutes to the stored deadline inside the extension window", async () => {
  expect(updateSet).toMatchObject({
    bidEndsAt: new Date("2026-08-31T06:10:00.000Z"),
    expiresAt: new Date("2026-08-31T06:10:00.001Z"),
  });
  await expect(response.json()).resolves.toMatchObject({ extended: true });
});
```

Also assert no extension at exactly ten minutes, current-version enforcement, previous-leader refund, and same-leader incremental escrow.

- [ ] **Step 2: Run the bid tests and confirm missing behavior**

Run: `npx vitest run src/app/api/v2/marketplace/bid/route.test.ts`

Expected: FAIL because first bids start at one gold and deadlines are not updated.

- [ ] **Step 3: Implement bid validation and deadline update under the existing row lock**

Reject rows whose `auctionModeVersion` is not current. Calculate `nextBid` from both `listing.price` and `listing.highestBid`; after the bid succeeds calculate extension from the locked row and store the new times in the same update as highest bid and count.

- [ ] **Step 4: Return authoritative timing to the client and update existing mocks**

```ts
body: {
  ok: true,
  highestBid: amount,
  nextBid: marketplaceNextBidMinimum(listing.price, amount),
  bidEndsAt: nextTimes.bidEndsAt.toISOString(),
  extended: nextTimes.extended,
  gold: spend.gold,
  bankedGold: spend.bankedGold,
}
```

- [ ] **Step 5: Run bid and trade-suspension tests**

Run: `npx vitest run src/app/api/v2/marketplace/bid/route.test.ts src/lib/server/tradeSuspensionAuctionLifecycle.test.ts src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the bid slice**

```bash
git add src/app/api/v2/marketplace/bid/route.ts src/app/api/v2/marketplace/bid/route.test.ts src/lib/server/tradeSuspensionAuctionLifecycle.test.ts src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts
git commit -m "feat: extend marketplace auctions on late bids"
```

### Task 4: Auction Settlement and Legacy Escrow Retirement

**Files:**
- Create: `src/app/api/v2/cron/marketplace-expire/route.test.ts`
- Modify: `src/app/api/v2/cron/marketplace-expire/route.ts`
- Modify: `src/lib/server/marketplaceEscrow.ts`
- Modify: `src/lib/server/marketplaceEscrow.test.ts`

**Interfaces:**
- Consumes: `auctionModeVersion`, `cancelMarketplaceListingEscrow`, `cancelMarketplaceBuyOrderEscrow`, and `deliverMarketplaceListing`.
- Produces: cron counters `auctionsSold`, `auctionsReturned`, `legacyListingsReturned`, `legacyBidsRefunded`, and `legacyOrdersRefunded`.

- [ ] **Step 1: Write failing settlement and retirement tests**

Cover current-version auction at its deadline with a bid equal to start price, current-version auction with no bids, version-zero active listing with an unresolved bid, active buy order before its original expiry, and a second cron pass that issues no duplicate inbox entries.

- [ ] **Step 2: Run the cron and escrow tests to capture hybrid failures**

Run: `npx vitest run src/app/api/v2/cron/marketplace-expire/route.test.ts src/lib/server/marketplaceEscrow.test.ts`

Expected: FAIL because equal-to-start bids are currently refunded into a fixed phase and unexpired legacy data is not retired.

- [ ] **Step 3: Settle current auctions without a fixed-price phase**

For version `1` due rows, treat any non-null highest bidder/highest bid as a winning auction, deliver the entire stored quantity once, apply the existing seller support tax rate, and mark `sold`. If no bid exists, call `cancelMarketplaceListingEscrow(..., { refundHighestBid: true, reason: "expired" })` immediately.

- [ ] **Step 4: Drain legacy listings and all active buy orders in bounded batches**

Select up to `BATCH` version-zero active listings regardless of their old deadlines and cancel them with full bid refund. Select up to `BATCH` active buy orders regardless of expiry and cancel them with full gold refund. Keep participant locking and row `FOR UPDATE` checks before each cancellation; remove automatic buy-order matching from cron.

- [ ] **Step 5: Make retirement messages explicit without changing payload compatibility**

Extend `EscrowReason` with `feature_retired`, use messages explaining the auction-only transition, and keep payload kinds `bid_refund`, `listing_return`, and `buy_order_refund` so inbox claiming remains compatible.

- [ ] **Step 6: Run settlement, escrow, fulfillment, and trade-suspension tests**

Run: `npx vitest run src/app/api/v2/cron/marketplace-expire/route.test.ts src/app/api/v2/cron/marketplace-expire/tradeSuspension.test.ts src/lib/server/marketplaceEscrow.test.ts src/lib/server/marketplaceV2Fulfillment.test.ts src/lib/server/tradeSuspensionAuctionLifecycle.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the settlement and retirement slice**

```bash
git add src/app/api/v2/cron/marketplace-expire/route.ts src/app/api/v2/cron/marketplace-expire/route.test.ts src/lib/server/marketplaceEscrow.ts src/lib/server/marketplaceEscrow.test.ts
git commit -m "feat: settle auctions and return legacy escrow"
```

### Task 5: Retire Instant Purchase, Buy Orders, and Repricing

**Files:**
- Create: `src/lib/server/marketplaceFeatureRetired.ts`
- Create: `src/app/api/v2/marketplace/retiredRoutes.test.ts`
- Modify: `src/app/api/v2/marketplace/buy/route.ts`
- Modify: `src/app/api/v2/marketplace/buy-stack/route.ts`
- Modify: `src/app/api/v2/marketplace/buy-orders/route.ts`
- Modify: `src/app/api/v2/marketplace/buy-orders/cancel/route.ts`
- Modify: `src/app/api/v2/marketplace/buy-orders/sell-equipment/route.ts`
- Modify: `src/app/api/v2/marketplace/buy-orders/sell-equipment-batch/route.ts`
- Modify: `src/app/api/v2/marketplace/reprice/route.ts`

**Interfaces:**
- Produces: `marketplaceFeatureRetired(): Response` with status 410 and `{ ok: false, error: "marketplace_feature_retired" }`.

- [ ] **Step 1: Write a table-driven failing test for every retired method**

```ts
expect(response.status).toBe(410);
await expect(response.json()).resolves.toEqual({
  ok: false,
  error: "marketplace_feature_retired",
});
```

Include GET/POST/PATCH exports that exist on the buy-order collection route.

- [ ] **Step 2: Run the retirement test and confirm old handlers are still active**

Run: `npx vitest run src/app/api/v2/marketplace/retiredRoutes.test.ts`

Expected: FAIL because old handlers authenticate or execute purchase logic.

- [ ] **Step 3: Replace retired handlers with one deterministic response helper**

```ts
export function marketplaceFeatureRetired() {
  return Response.json(
    { ok: false, error: "marketplace_feature_retired" },
    { status: 410 },
  );
}
```

Keep route files so stale clients receive an explicit response instead of a framework-level 404.

- [ ] **Step 4: Run retirement and trade-suspension route tests**

Run: `npx vitest run src/app/api/v2/marketplace/retiredRoutes.test.ts src/app/api/v2/marketplace/tradeSuspensionSettlementRoutes.test.ts`

Expected: PASS after updating obsolete test expectations to the intentional 410 contract.

- [ ] **Step 5: Commit the retired-route slice**

```bash
git add src/lib/server/marketplaceFeatureRetired.ts src/app/api/v2/marketplace
git commit -m "feat: retire marketplace fixed-price routes"
```

### Task 6: Auction-Only Client and Whole-Lot Stack Cards

**Files:**
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.layout.test.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.requests.test.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.purchaseBalance.test.tsx`
- Modify: `src/adventure/v2/marketplace/EquipmentListingCard.tsx`
- Modify: `src/adventure/v2/marketplace/MarketplaceEquipmentTab.tsx`
- Modify: `src/adventure/v2/marketplace/MarketplaceMaterialTab.tsx`
- Modify: `src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx`
- Modify: `src/adventure/v2/marketplace/MarketplaceStackBrowse.tsx`
- Modify: `src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx`
- Modify: `src/adventure/v2/marketplace/marketplaceActionErrors.ts`
- Modify: `src/app/dev/marketplace/MarketplaceHarness.tsx`
- Modify: `src/app/manual/content/plaza.tsx`

**Interfaces:**
- Consumes: browse policy fields and bid response timing from Tasks 2 and 3.
- Produces: one bid action per individual listing, with no client request to retired endpoints.

- [ ] **Step 1: Rewrite UI tests first around auction-only controls**

Assert the rendered screen contains `6시간 경매`, `시작 입찰가`, `묶음 전체`, `다음 최소 입찰가`, and one listing card per stack row. Assert it does not contain duration selection, `즉시 구매`, partial quantity purchase controls, `구매 주문`, `일괄 판매`, or repricing. Assert a bid response with a later `bidEndsAt` updates the visible card deadline.

- [ ] **Step 2: Run the focused marketplace component tests and confirm the old purchase UI fails**

Run: `npx vitest run src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2MarketplaceView.requests.test.tsx src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx`

Expected: FAIL while fixed/auction mode, buy orders, and grouped partial purchase remain.

- [ ] **Step 3: Remove fixed-price and buy-order state/actions from the owning view**

Delete `ListingMode`, `graceHours`, buy-order/order-book state, instant-buy handlers, sell-to-order handlers, repricing handlers, and retired endpoint fetches. Keep refresh, history, favorites, price alerts, filters, listing, bidding, cancellation, and inbox flows.

On a successful bid, merge the response into the matching listing:

```ts
setListings((current) => current?.map((listing) =>
  listing.id === listingId
    ? { ...listing, highestBid, nextBid, bidEndsAt, isHighestBidder: true }
    : listing,
));
```

- [ ] **Step 4: Make registration price explicitly whole-lot**

For material and consumable forms, stop multiplying a unit price by quantity. Send the entered positive integer directly as `price`, label it `묶음 전체 시작 입찰가`, and show `{quantity}개 전체가 한 번에 낙찰됩니다`.

- [ ] **Step 5: Render each stack listing as an indivisible auction card**

Remove `lifeItemPurchaseGroups` and grouped quantity checkout from `MarketplaceStackBrowse`. Sort/filter listings without merging their quantities, show each row's quantity and auction amounts, and call only `onBid(listing.id, amount)`. Preserve opaque `SURFACE_CARD`/`SURFACE_INSET` usage in light and dark modes.

- [ ] **Step 6: Narrow equipment cards and documentation to auctions**

Remove instant purchase and buy-order buttons from equipment components. Show start/current/next bid and remaining time, allow cancellation only at `bidCount === 0`, and rewrite the plaza manual and dev harness fixtures for six-hour auctions and cumulative ten-minute extension.

- [ ] **Step 7: Run all affected component and view tests**

Run: `npx vitest run src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2MarketplaceView.requests.test.tsx src/adventure/v2/V2MarketplaceView.purchaseBalance.test.tsx src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx src/adventure/v2/V2MarketplaceView.equipmentBuyOrderSearch.test.tsx`

Expected: PASS after deleting or rewriting tests whose only subject was retired buy-order UI.

- [ ] **Step 8: Commit the client slice**

```bash
git add src/adventure/v2 src/app/dev/marketplace src/app/manual/content/plaza.tsx
git commit -m "feat: present marketplace as whole-lot auctions"
```

### Task 7: Full Verification and Cleanup

**Files:**
- Modify only files required to correct failures introduced by Tasks 1–6.

**Interfaces:**
- Consumes: all preceding task outputs.
- Produces: a clean, committed branch with no deployment side effects.

- [ ] **Step 1: Scan for policy bypasses and obsolete copy**

Run: `rg -n "즉시.?구매|구매 주문|일괄 판매|graceHours|bidGrace|fixedListingHours|directListingHours|/marketplace/buy|/marketplace/reprice" src --glob '!**/*.test.*'`

Expected: no executable client path or active manual copy offering retired behavior; only intentional 410 route locations or historical type names remain.

- [ ] **Step 2: Run static checks and all unit tests**

Run: `npm run lint`

Run: `npx tsc --noEmit`

Run: `npm run check-migrations`

Run: `npm test`

Expected: all commands exit 0.

- [ ] **Step 3: Build with repository image checks**

Run: `npm run build`

Expected: image optimization/check hooks, Next.js compilation, and postbuild checks all exit 0.

- [ ] **Step 4: Inspect the final diff and migration**

Run: `git diff --check 7579819f4..HEAD`

Run: `git status --short`

Expected: no whitespace errors and a clean worktree.

- [ ] **Step 5: Commit any verification-only corrections**

```bash
git add -u
git commit -m "test: complete auction marketplace verification"
```

Skip this commit when Step 2 and Step 3 required no corrections.
