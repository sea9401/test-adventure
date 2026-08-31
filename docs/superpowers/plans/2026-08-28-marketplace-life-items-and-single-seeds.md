# Marketplace Life Items and Single Seeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players trade approved farming and cooking ingredients in quantities starting at one, and buy every crop seed as a one-seed farm-shop item.

**Architecture:** Keep the existing marketplace database kinds and represent all new life-content stacks as `material` listings with collision-free marketplace IDs. A public catalog owns names and source mappings, while one server-only inventory module atomically withdraws and delivers stacks from `farm.v2`, `fishing-stock.v1`, or `cooking.v2`; existing marketplace listing and settlement paths call that module before falling back to `character.v2.materials`.

**Tech Stack:** Next.js 16.2 Route Handlers, React 19, TypeScript, Drizzle ORM, Vitest, Testing Library

## Global Constraints

- Do not deploy to any environment.
- Preserve unrelated worktree changes and stage only files from this feature.
- Read `node_modules/next/dist/docs/` before changing Next.js Route Handlers.
- Use existing opaque surfaces from `src/components/ui/surfaces.ts`; do not introduce translucent content cards.
- Trade exactly 53 approved life items; exclude `compound_feed`.
- Keep the marketplace quantity range at 1 through 9,999.
- Keep all existing seed bundles and add one-seed purchases alongside them.

---

### Task 1: Public life-item marketplace catalog

**Files:**
- Create: `src/adventure/v2/marketplace/lifeItemCatalog.ts`
- Create: `src/adventure/v2/marketplace/lifeItemCatalog.test.ts`
- Modify: `src/lib/server/marketplaceV2.ts`
- Modify: `src/lib/server/marketplaceV2.test.ts`

**Interfaces:**
- Produces: `MarketplaceLifeItemId`, `MARKETPLACE_LIFE_ITEM_IDS`, `marketplaceLifeItemDefinition(id)`, `isMarketplaceLifeItemId(id)`, and `isTradableMarketplaceMaterial(id)`.
- Consumes: `FARM_CROPS`, `FARM_ITEMS`, `COOKING_FARM_INGREDIENT_IDS`, `FISHING_CATCH_ITEMS`, `COOKING_PANTRY_ITEMS`, and `COOKING_PROCESSING_RECIPES`.

- [ ] **Step 1: Write the failing catalog tests**

```ts
it("승인된 생활 재료 53종만 거래 카탈로그에 싣는다", () => {
  expect(MARKETPLACE_LIFE_ITEM_IDS).toHaveLength(53);
  expect(marketplaceLifeItemDefinition("farm_seed:wheat")?.name).toBe("밀 씨앗");
  expect(marketplaceLifeItemDefinition("farm_item:golden_wheat")?.name).toBe("황금 밀");
  expect(marketplaceLifeItemDefinition("cooking_kitchen:processed:flour")?.name).toBe("밀가루");
  expect(isMarketplaceLifeItemId("farm_item:compound_feed")).toBe(false);
});
```

- [ ] **Step 2: Run the catalog tests and confirm RED**

Run: `npm test -- src/adventure/v2/marketplace/lifeItemCatalog.test.ts src/lib/server/marketplaceV2.test.ts`

Expected: FAIL because the catalog module and combined material predicate do not exist.

- [ ] **Step 3: Implement the catalog and combined predicate**

Build immutable definitions with this shape:

```ts
export type MarketplaceLifeItemDefinition = {
  id: MarketplaceLifeItemId;
  name: string;
  source: "farm_seed" | "farm_item" | "fishing_catch" | "cooking_kitchen";
  sourceItemId: string;
};
```

Update `itemDisplayName("material", id)` and `currentMarketplaceItemName` to resolve life-item names, and expose `isTradableMarketplaceMaterial(id)` as the only marketplace route predicate for material IDs.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `npm test -- src/adventure/v2/marketplace/lifeItemCatalog.test.ts src/lib/server/marketplaceV2.test.ts`

Expected: PASS.

### Task 2: Server inventory withdrawal and delivery

**Files:**
- Create: `src/lib/server/marketplaceLifeInventory.ts`
- Create: `src/lib/server/marketplaceLifeInventory.test.ts`
- Modify: `src/lib/server/marketplaceV2Fulfillment.ts`
- Modify: `src/lib/server/marketplaceV2Fulfillment.test.ts`
- Modify: `src/lib/server/marketplaceEscrow.ts`
- Modify: `src/lib/server/marketplaceEscrow.test.ts`

**Interfaces:**
- Consumes: Task 1 `marketplaceLifeItemDefinition(id)`.
- Produces: `withdrawMarketplaceLifeItem(executor, userId, itemId, quantity, now): Promise<"withdrawn" | "insufficient" | "not_life_item">` and `deliverMarketplaceLifeItem(executor, userId, itemId, quantity, now): Promise<boolean>`.

- [ ] **Step 1: Write failing inventory tests for every save source**

```ts
it.each([
  ["farm_seed:wheat", "farm.v2"],
  ["farm_item:golden_wheat", "farm.v2"],
  ["fishing_catch:catch_common", "fishing-stock.v1"],
  ["cooking_kitchen:processed:flour", "cooking.v2"],
])("%s를 원본 저장소에서 차감하고 다시 적립한다", async (itemId, saveKey) => {
  expect(await withdrawMarketplaceLifeItem(tx, "seller", itemId, 1, now)).toBe("withdrawn");
  expect(await deliverMarketplaceLifeItem(tx, "buyer", itemId, 1, now)).toBe(true);
  expect(writtenKeys).toContain(saveKey);
});
```

Also assert that insufficient withdrawal writes nothing and that delivery adds to an existing count.

- [ ] **Step 2: Run inventory tests and confirm RED**

Run: `npm test -- src/lib/server/marketplaceLifeInventory.test.ts src/lib/server/marketplaceV2Fulfillment.test.ts src/lib/server/marketplaceEscrow.test.ts`

Expected: FAIL because the new inventory helper and settlement branches are absent.

- [ ] **Step 3: Implement source-aware parsing, withdrawal, and delivery**

Use `parseFarmState`, `parseFishingStock`, and `parseCookingState` before mutation. Reject non-positive or unsafe quantities, preserve unrelated save fields, delete zero-count keys, and write only after ownership validation passes.

- [ ] **Step 4: Connect buyer delivery and escrow restoration**

In material settlement, call `deliverMarketplaceLifeItem` before the existing `character.v2.materials` fallback. In cancellation and expiration restoration, use the same delivery helper so all paths return to the original save.

- [ ] **Step 5: Run settlement tests and confirm GREEN**

Run: `npm test -- src/lib/server/marketplaceLifeInventory.test.ts src/lib/server/marketplaceV2Fulfillment.test.ts src/lib/server/marketplaceEscrow.test.ts`

Expected: PASS.

### Task 3: Marketplace routes and inventory surface

**Files:**
- Modify: `src/app/api/v2/marketplace/list/route.ts`
- Modify: `src/app/api/v2/marketplace/buy/route.ts`
- Modify: `src/app/api/v2/marketplace/buy-stack/route.ts`
- Modify: `src/app/api/v2/marketplace/browse/route.ts`
- Modify: `src/app/api/v2/marketplace/buy-orders/route.ts`
- Modify: `src/app/api/v2/me/inventory/route.ts`
- Modify: `src/app/api/v2/me/inventory/route.test.ts`
- Modify: `src/lib/server/marketplaceListRoute.test.ts`

**Interfaces:**
- Consumes: Task 1 combined predicate and Task 2 withdrawal helper.
- Produces: `marketplaceMaterials: Record<string, number>` in `/api/v2/me/inventory`, containing ordinary tradable materials plus held life items under marketplace IDs.

- [ ] **Step 1: Write failing route tests**

Add a listing-route test that posts `{ kind: "material", itemId: "farm_seed:wheat", quantity: 1, price: 10, graceHours: 0 }`, expects a material listing, and expects `farm.v2.seeds.wheat` to decrement by one. Add inventory-route fixtures for all four life sources and expect marketplace IDs and counts in `marketplaceMaterials`.

- [ ] **Step 2: Run route tests and confirm RED**

Run: `npm test -- src/lib/server/marketplaceListRoute.test.ts src/app/api/v2/me/inventory/route.test.ts`

Expected: FAIL with `not_tradable` or missing `marketplaceMaterials`.

- [ ] **Step 3: Replace material-only validation with combined validation**

Use `isTradableMarketplaceMaterial` in list, direct buy, partial stack buy, browse, and buy-order creation. Keep the existing `isTradableMaterial` function for non-market consumers.

- [ ] **Step 4: Withdraw life stacks during listing and surface holdings**

Call `withdrawMarketplaceLifeItem` when the listed ID belongs to the life catalog; otherwise keep the existing `character.v2.materials` branch. Read `character.v2`, `farm.v2`, `fishing-stock.v1`, and `cooking.v2` in the inventory GET and return only positive approved holdings.

- [ ] **Step 5: Run route tests and confirm GREEN**

Run: `npm test -- src/lib/server/marketplaceListRoute.test.ts src/app/api/v2/me/inventory/route.test.ts src/app/api/v2/marketplace/buy-orders/route.test.ts`

Expected: PASS.

### Task 4: Marketplace selling and purchase-order UI

**Files:**
- Modify: `src/adventure/v2/V2MarketplaceView.tsx`
- Modify: `src/adventure/v2/marketplace/MarketplaceMaterialTab.tsx`
- Create: `src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx`
- Modify: `src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx`

**Interfaces:**
- Consumes: Task 1 catalog and Task 3 `marketplaceMaterials` response.
- Produces: sell cards and purchase-order catalog rows for all held/approved life items.

- [ ] **Step 1: Write a failing material-tab test**

```tsx
render(
  <MarketplaceMaterialTab
    items={["farm_seed:wheat"]}
    pager={{ page: 1, pageCount: 1, pageItems: ["farm_seed:wheat"], setPage: vi.fn() }}
    materials={{ "farm_seed:wheat": 1 }}
    prices={{}}
    setPrices={vi.fn()}
    qtys={{}}
    setQtys={vi.fn()}
    priceRef={{}}
    busy={false}
    onListMaterial={vi.fn()}
  />,
);
expect(screen.getByText("밀 씨앗")).toBeInTheDocument();
expect(screen.getByRole("spinbutton", { name: "밀 씨앗 판매 수량" })).toHaveAttribute("min", "1");
```

Add a purchase-order catalog assertion that `밀 씨앗` is selectable even without a current listing.

- [ ] **Step 2: Run UI tests and confirm RED**

Run: `npm test -- src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx`

Expected: FAIL because life names and inventory rows are not wired.

- [ ] **Step 3: Generalize the material sell component and view state**

Use string item IDs, resolve names from `V2_MATERIALS` or the life catalog, load `marketplaceMaterials`, and include the life catalog in material purchase-order groups. Keep all cards opaque by continuing to use the existing `Card` component.

- [ ] **Step 4: Run UI tests and confirm GREEN**

Run: `npm test -- src/adventure/v2/marketplace/MarketplaceMaterialTab.test.tsx src/adventure/v2/marketplace/MarketplaceStackBrowse.test.tsx`

Expected: PASS.

### Task 5: One-seed farm-shop products

**Files:**
- Modify: `src/adventure/v2/farm.ts`
- Modify: `src/adventure/v2/farm.test.ts`
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx`
- Modify: `src/app/manual/content/town.tsx`
- Modify: `src/app/manual/content/plaza.tsx`

**Interfaces:**
- Produces: 11 `single-seed-<cropId>` `FarmShopItem` entries, each rewarding exactly one seed and reusing the crop's existing required skill.

- [ ] **Step 1: Write failing farm-shop tests**

```ts
it("모든 작물 씨앗을 한 개씩 살 수 있다", () => {
  const singles = getFarmShopItems().filter((item) => item.id.startsWith("single-seed-"));
  expect(singles).toHaveLength(11);
  expect(singles.find((item) => item.id === "single-seed-wheat")).toMatchObject({
    costReputation: 3,
    rewardSeeds: { wheat: 1 },
  });
});
```

Add assertions for the full literal price table and for a locked crop returning `crop_locked` until its existing skill is learned.

- [ ] **Step 2: Run farm tests and confirm RED**

Run: `npm test -- src/adventure/v2/farm.test.ts`

Expected: FAIL because no single-seed entries exist.

- [ ] **Step 3: Add the single-seed items and concise UI grouping**

Append the 11 entries after bundle products. Use each crop's `seedName`, `{ [crop.id]: 1 }`, and its `requiredSkillId`/`requiredSkillName`; keep wheat and herb unlocked as they are today. Label the section so bundles and single seeds are distinguishable without adding translucent surfaces.

- [ ] **Step 4: Update manual wording**

Document that raw farming/cooking ingredients are tradable, finished food remains tradable, and the farm shop offers both bundles and one-seed purchases.

- [ ] **Step 5: Run farm and manual tests and confirm GREEN**

Run: `npm test -- src/adventure/v2/farm.test.ts src/app/manual/current-content.test.tsx`

Expected: PASS.

### Task 6: Full verification and implementation commit

**Files:**
- Verify all files changed by Tasks 1 through 5.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a clean, tested local implementation commit without deployment.

- [ ] **Step 1: Run focused marketplace and farm tests**

Run: `npm test -- src/adventure/v2/marketplace src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceLifeInventory.test.ts src/lib/server/marketplaceV2Fulfillment.test.ts src/lib/server/marketplaceEscrow.test.ts src/lib/server/marketplaceListRoute.test.ts src/app/api/v2/me/inventory/route.test.ts src/adventure/v2/farm.test.ts`

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

- [ ] **Step 3: Run static and asset checks**

Run: `npx tsc --noEmit`

Run: `npx eslint <changed TypeScript and TSX files>`

Run: `npm run check-images`

Run: `npm run check-module-budgets`

- [ ] **Step 4: Run the production build**

Run: `npm run build`

- [ ] **Step 5: Review and commit only feature files**

Run: `git diff --check` and `git status --short`, then stage the implementation, tests, manual updates, and this plan without staging pre-existing unrelated changes.

Commit message: `feat: trade life materials and sell single seeds`
