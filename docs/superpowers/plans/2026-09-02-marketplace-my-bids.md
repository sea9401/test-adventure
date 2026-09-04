# Marketplace My Bids Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private `내 입찰` history, clear ownership/participation badges, and a scoped `내 항목만 보기` filter so marketplace escrow and settlement remain traceable.

**Architecture:** Add one authenticated read route that aggregates the current user's bid rows per listing without exposing participant IDs. Extend the existing browse response with one batched participation lookup, then keep status derivation and rendering in focused marketplace client modules while `V2MarketplaceView` remains the coordinator.

**Tech Stack:** Next.js 16.2 App Router route handlers, React 19 client components, TypeScript, Drizzle ORM/PostgreSQL, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Do not change bid rules, escrow behavior, settlement cadence, or inbox claiming.
- Do not add a database table or migration; use existing `marketplace_bids_v2` and `marketplace_listings_v2` rows.
- Return at most 50 distinct listings from the current user's bid history.
- Never return seller, buyer, highest-bidder, or other bidder identifiers.
- Keep existing marketplace sort order; `내 항목만 보기` narrows only the active mode and item category.
- Use opaque `Card`, `SURFACE_CARD`, or `SURFACE_INSET` surfaces in light and dark modes.
- Write every behavior test first, confirm the expected failure, then add the smallest production change.
- Do not deploy.

---

### Task 1: Private My-Bids Read API

**Files:**
- Create: `src/app/api/v2/marketplace/my-bids/route.ts`
- Create: `src/app/api/v2/marketplace/my-bids/route.test.ts`
- Modify: `src/lib/server/marketplaceV2.ts`
- Test: `src/lib/server/marketplaceV2.test.ts`

**Interfaces:**
- Consumes: `marketplaceBidsV2`, `marketplaceListingsV2`, `ensureUser()`, `enforceUserAndIpRateLimit()`.
- Produces: `GET /api/v2/marketplace/my-bids` with `{ ok: true, bids: MarketplaceMyBidDto[] }`.
- Produces: `MARKETPLACE_V2_MY_BIDS_LIMIT = 50` in `src/lib/server/marketplaceV2.ts`.
- `MarketplaceMyBidDto` contains `id`, `kind`, `itemId`, `itemName`, `quantity`, `price`, `instancePayload`, `status`, `createdAt`, `bidEndsAt`, `expiresAt`, `closedAt`, `highestBid`, `bidResolvedAt`, `myHighestBid`, `lastBidAt`, `isHighestBidder`, `isBuyer`, and `nextBid`.

- [ ] **Step 1: Add failing route tests for authentication, aggregation contract, and privacy**

Create a route test using the established hoisted DB-builder mock. Feed one already aggregated database row and assert the public response:

```ts
expect(payload.bids[0]).toMatchObject({
  id: 41,
  myHighestBid: 1_200,
  lastBidAt: "2026-09-02T06:05:00.000Z",
  isHighestBidder: true,
  isBuyer: false,
  nextBid: 1_260,
});
expect(payload.bids[0]).not.toHaveProperty("sellerId");
expect(payload.bids[0]).not.toHaveProperty("buyerId");
expect(payload.bids[0]).not.toHaveProperty("highestBidderId");
expect(mocks.builder.groupBy).toHaveBeenCalled();
expect(mocks.builder.limit).toHaveBeenCalledWith(50);
```

Also set `ensureUser` to `null` and assert HTTP 401 without a database call.

- [ ] **Step 2: Run the new route test and verify RED**

Run: `npm test -- src/app/api/v2/marketplace/my-bids/route.test.ts`

Expected: FAIL because `./route` and `MARKETPLACE_V2_MY_BIDS_LIMIT` do not exist.

- [ ] **Step 3: Implement the aggregate query and public mapping**

Build an aggregate subquery grouped by `listingId`:

```ts
const myBids = db
  .select({
    listingId: marketplaceBidsV2.listingId,
    myHighestBid: max(marketplaceBidsV2.amount).mapWith(Number).as("my_highest_bid"),
    lastBidAt: max(marketplaceBidsV2.createdAt).as("last_bid_at"),
  })
  .from(marketplaceBidsV2)
  .where(eq(marketplaceBidsV2.bidderId, userId))
  .groupBy(marketplaceBidsV2.listingId)
  .as("my_bids");
```

Join it to listings, order by `lastBidAt` descending, and limit to `MARKETPLACE_V2_MY_BIDS_LIMIT`. Select participant IDs only for same-row comparison, destructure them out before `Response.json`, refresh item names with `currentMarketplaceItemName`, and derive `nextBid` with `marketplaceNextBidMinimum`.

- [ ] **Step 4: Run the route and marketplace server tests and verify GREEN**

Run: `npm test -- src/app/api/v2/marketplace/my-bids/route.test.ts src/lib/server/marketplaceV2.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the API task**

```bash
git add src/app/api/v2/marketplace/my-bids/route.ts src/app/api/v2/marketplace/my-bids/route.test.ts src/lib/server/marketplaceV2.ts src/lib/server/marketplaceV2.test.ts
git commit -m "feat: add private marketplace bid history"
```

### Task 2: Public Browse Participation Marker

**Files:**
- Modify: `src/app/api/v2/marketplace/browse/route.ts`
- Create: `src/app/api/v2/marketplace/browse/route.test.ts`
- Modify: `src/lib/server/marketplaceV2.ts`
- Modify: `src/lib/server/marketplaceV2.test.ts`
- Modify: `src/adventure/v2/marketplace/marketplaceShared.tsx`
- Modify: `src/adventure/v2/marketplace/marketplaceShared.test.ts`
- Modify: `src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.layout.test.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.purchaseBalance.test.tsx`
- Modify: `src/app/dev/marketplace/MarketplaceHarness.tsx`

**Interfaces:**
- Consumes: the active listing IDs returned by the existing browse query.
- Produces: required `Listing.hasMyBid: boolean` on every browse row.
- Changes: `marketplacePublicListing(row, viewerId, hasMyBid = false)` includes `hasMyBid` while retaining `isMine` and `isHighestBidder`.

- [ ] **Step 1: Add failing server tests for `hasMyBid` and participant privacy**

Add a `marketplacePublicListing` unit assertion:

```ts
expect(marketplacePublicListing(row, "viewer", true)).toMatchObject({
  isMine: false,
  isHighestBidder: true,
  hasMyBid: true,
});
```

Create a browse route test with two visible listing IDs and a second query returning one bid listing ID. Assert only that listing receives `hasMyBid: true`, both rows omit private IDs, and an empty listing result skips the participation query.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/app/api/v2/marketplace/browse/route.test.ts src/lib/server/marketplaceV2.test.ts`

Expected: FAIL because browse does not query participation and public rows lack `hasMyBid`.

- [ ] **Step 3: Add one batched participation query**

After loading browse rows, query only the returned IDs:

```ts
const participated = rows.length === 0
  ? []
  : await db
      .select({ listingId: marketplaceBidsV2.listingId })
      .from(marketplaceBidsV2)
      .where(and(
        eq(marketplaceBidsV2.bidderId, userId),
        inArray(marketplaceBidsV2.listingId, rows.map((row) => row.id)),
      ))
      .groupBy(marketplaceBidsV2.listingId);
```

Pass `participatedIds.has(row.id)` into `marketplacePublicListing`. Add required `hasMyBid` to the client `Listing` type and update compile-time fixtures without changing their behavior.

- [ ] **Step 4: Run API, helper, and marketplace component tests and verify GREEN**

Run: `npm test -- src/app/api/v2/marketplace/browse/route.test.ts src/lib/server/marketplaceV2.test.ts src/adventure/v2/marketplace/marketplaceShared.test.ts src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2MarketplaceView.purchaseBalance.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the browse marker task**

```bash
git add src/app/api/v2/marketplace/browse/route.ts src/app/api/v2/marketplace/browse/route.test.ts src/lib/server/marketplaceV2.ts src/lib/server/marketplaceV2.test.ts src/adventure/v2/marketplace/marketplaceShared.tsx src/adventure/v2
git commit -m "feat: mark personal marketplace listings"
```

### Task 3: Bid State Model and My-Bids Panel

**Files:**
- Create: `src/adventure/v2/marketplace/marketplaceBidTracking.ts`
- Create: `src/adventure/v2/marketplace/marketplaceBidTracking.test.ts`
- Create: `src/adventure/v2/marketplace/MarketplaceMyBids.tsx`
- Create: `src/adventure/v2/marketplace/MarketplaceMyBids.test.tsx`

**Interfaces:**
- Produces: `MarketplaceMyBid` matching the Task 1 DTO.
- Produces: `marketplaceMyBidPresentation(bid, clockMs): { key, label, guidance, active }`.
- Produces: `sortMarketplaceMyBids(rows, clockMs): MarketplaceMyBid[]` with active/settling rows first and `lastBidAt` descending inside each group.
- Produces: `<MarketplaceMyBids rows clockMs busy onOpenBid />`.

- [ ] **Step 1: Add failing pure state tests**

Use table tests for all six states:

```ts
expect(marketplaceMyBidPresentation(leadingBid, clockMs)).toMatchObject({
  key: "leading",
  label: "최고 입찰 중",
  guidance: "입찰금 예치 중",
  active: true,
});
```

Cover `outbid`, `settling`, `won`, `lost`, and `cancelled`, and assert that an older active row sorts before a newer closed row.

- [ ] **Step 2: Run the pure test and verify RED**

Run: `npm test -- src/adventure/v2/marketplace/marketplaceBidTracking.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the type, state derivation, and sorting**

Use listing status, `bidEndsAt`, `isHighestBidder`, and `isBuyer` only. Never infer that a refund was claimed. `active && bidEndsAt <= clockMs` always maps to `settling`; `sold && isBuyer` maps to `won`; all other sold rows map to `lost`.

- [ ] **Step 4: Run the pure test and verify GREEN**

Run: `npm test -- src/adventure/v2/marketplace/marketplaceBidTracking.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing component tests for rows, guidance, and action availability**

Render a leading row, an outbid row, and a sold row. Assert:

```ts
expect(screen.getByText("내 최고 입찰 1,200G")).not.toBeNull();
expect(screen.getByText("입찰금 예치 중")).not.toBeNull();
expect(screen.getByText("우편함에서 입찰금 반환 확인")).not.toBeNull();
expect(screen.getAllByRole("button", { name: /입찰 내역/ })).toHaveLength(2);
```

The sold row must not have an action button, and loading/empty states must be explicit.

- [ ] **Step 6: Run the component test and verify RED**

Run: `npm test -- src/adventure/v2/marketplace/MarketplaceMyBids.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 7: Implement the focused panel**

Render opaque `Card` rows with item name, quantity, my/current/buyout prices, last bid time, state badge, guidance, and the existing bid-dialog callback for active rows. Use `SURFACE_INSET` only for nested price/status cells.

- [ ] **Step 8: Run both new module tests and verify GREEN**

Run: `npm test -- src/adventure/v2/marketplace/marketplaceBidTracking.test.ts src/adventure/v2/marketplace/MarketplaceMyBids.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit the panel task**

```bash
git add src/adventure/v2/marketplace/marketplaceBidTracking.ts src/adventure/v2/marketplace/marketplaceBidTracking.test.ts src/adventure/v2/marketplace/MarketplaceMyBids.tsx src/adventure/v2/marketplace/MarketplaceMyBids.test.tsx
git commit -m "feat: add marketplace bid status panel"
```

### Task 4: Marketplace View Integration, Badges, and Filter

**Files:**
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.requests.test.tsx`
- Modify: `src/adventure/v2/V2MarketplaceView.layout.test.tsx`

**Interfaces:**
- Consumes: `MarketplaceMyBid`, `MarketplaceMyBids`, and browse `Listing.hasMyBid`.
- Adds: `MineTab = "active" | "bids" | "orders" | "history"`.
- Adds: `loadMyBids(): Promise<void>` and `myBids: MarketplaceMyBid[] | null`.
- Adds: `personalOnly: boolean` that filters `isMine || hasMyBid || isHighestBidder` after mode/category selection and before sorting.

- [ ] **Step 1: Add failing request/integration tests**

In the request test, return representative `/my-bids` data, click `내 거래`, and assert `/api/v2/marketplace/my-bids` is requested. Click `내 입찰` and assert the panel content appears. Add an input-success test that asserts both browse and my-bids URLs are refreshed after a bid when my bids were previously loaded.

- [ ] **Step 2: Add failing layout tests for badges and filter**

Render preview rows representing own, leading, participated, and unrelated listings. Assert the first three badges render with this priority:

```ts
expect(html).toContain("내 매물");
expect(html).toContain("최고 입찰 중");
expect(html).toContain("내 입찰");
```

In a jsdom render, toggle `내 항목만 보기` and assert the unrelated listing disappears while the three personal rows remain in their original relative order.

- [ ] **Step 3: Run view tests and verify RED**

Run: `npm test -- src/adventure/v2/V2MarketplaceView.requests.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx`

Expected: FAIL because the tab, badges, filter, and request do not exist.

- [ ] **Step 4: Integrate the my-bids state and tab**

Load `/api/v2/marketplace/my-bids` alongside mine/history data on `내 거래` entry. Change the subtab grid to four columns, show a count badge for loaded bid rows, and render `MarketplaceMyBids` for `mineTab === "bids"`. Active bid rows call the existing `openBid` function.

- [ ] **Step 5: Add relation badges and the scoped personal filter**

Add `personalOnly` beside the existing browse filters. Apply it after item category and mode filtering:

```ts
.filter((listing) =>
  !personalOnly || listing.isMine || listing.hasMyBid || listing.isHighestBidder
)
```

Render exactly one relation badge per row with `isMine` first, `isHighestBidder` second, and `hasMyBid` third. Reset `personalOnly` in `resetBrowseFilters` and include it in pagination reset keys and active-filter counts.

- [ ] **Step 6: Refresh relevant data after bidding**

After a successful bid, always reload browse. Reload my bids only when it has already been loaded, avoiding an extra initial request on the purchase tab. Preserve the existing `refreshGameState()` call so wallet and bank balances stay authoritative.

- [ ] **Step 7: Run view tests and verify GREEN**

Run: `npm test -- src/adventure/v2/V2MarketplaceView.requests.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2MarketplaceView.purchaseBalance.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit the view integration task**

```bash
git add src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/V2MarketplaceView.requests.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/app/dev/marketplace/MarketplaceHarness.tsx
git commit -m "feat: expose personal marketplace activity"
```

### Task 5: Full Verification

**Files:**
- Verify all files changed in Tasks 1–4.

**Interfaces:**
- Consumes: all task outputs.
- Produces: a clean, tested local branch with no deployment.

- [ ] **Step 1: Run all marketplace tests**

Run: `npm test -- src/app/api/v2/marketplace src/lib/server/marketplaceV2.test.ts src/adventure/v2/marketplace src/adventure/v2/V2MarketplaceView.requests.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx src/adventure/v2/V2MarketplaceView.purchaseBalance.test.tsx`

Expected: all selected test files pass with zero failures.

- [ ] **Step 2: Run static verification**

Run: `npx eslint src/app/api/v2/marketplace/my-bids/route.ts src/app/api/v2/marketplace/my-bids/route.test.ts src/app/api/v2/marketplace/browse/route.ts src/app/api/v2/marketplace/browse/route.test.ts src/lib/server/marketplaceV2.ts src/adventure/v2/marketplace/marketplaceBidTracking.ts src/adventure/v2/marketplace/MarketplaceMyBids.tsx src/adventure/v2/V2MarketplaceView.tsx src/adventure/v2/V2MarketplaceView.requests.test.tsx src/adventure/v2/V2MarketplaceView.layout.test.tsx`

Run: `npx tsc --noEmit`

Run: `git diff --check`

Expected: all commands exit 0.

- [ ] **Step 3: Inspect final scope and working tree**

Run: `git status --short && git log -5 --oneline`

Expected: only the intended marketplace commits are present and the working tree is clean.
