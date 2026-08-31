# Dangerous Fishing Reward Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give returned dangerous-fishing catches permanent value through deterministic gear enhancement, risk-scaled return coins, meaningful bait effects, and optional NPC sale while preserving marketplace and boss-token progression.

**Architecture:** Pure catalog functions define enhancement costs and return/sale values. Existing `savesKv` transactions atomically consume materials/coins or settle cargo; the dangerous exchange UI adds enhancement and sale sections while reusing the generic material sale endpoint and global balance synchronization.

**Tech Stack:** TypeScript, Vitest, Drizzle transactions, Next.js 16 Route Handlers, React 19 Client Components, existing dangerous exchange and material-sale infrastructure.

## Global Constraints

- Complete the engine and client plans first.
- Enhancement is permanent `+0..+3`, always succeeds, and never destroys or lowers equipment.
- +1 costs common 6 + rare 4 + 1,000 fishing coins.
- +2 costs rare 8 + epic 5 + 3,000 fishing coins.
- +3 costs epic 8 + legendary 3 + 8,000 fishing coins.
- Rod enhancement adds 6% stamina damage per level; reel adds 5% distance recovery per level; line adds 3%p safe-zone width and 2%p cargo protection per level.
- Return bonus is `floor(retainedCargoValue * risk * 0.02)` fishing coins.
- NPC sale price is `cargoValue * 10` gold per catch and uses the existing material-sale bank deposit behavior.
- Existing bait pack sizes, counts, exchange costs, boss token costs, titles, cosmetics, marketplace behavior, and material IDs remain unchanged.
- No reward, material, enhancement, or progress resets daily, weekly, or monthly.
- Do not deploy or change maintenance mode.

---

### Task 1: Enhancement catalog and state transitions

**Files:**
- Create: `src/adventure/v2/dangerousFishingEnhancement.ts`
- Create: `src/adventure/v2/dangerousFishingEnhancement.test.ts`
- Modify: `src/adventure/v2/dangerousFishingState.test.ts`

**Interfaces:**
- Produces: `DANGEROUS_GEAR_ENHANCEMENT_COSTS`, `dangerousGearEnhancementLevel`, `selectEnhancementMaterials`, `enhanceDangerousGear`, and `DangerousGearEnhancements`.

- [ ] **Step 1: Write failing catalog and transition tests**

```ts
expect(DANGEROUS_GEAR_ENHANCEMENT_COSTS[3]).toEqual({
  materials: { epic: 8, legendary: 3 },
  fishingCoins: 8_000,
});
const result = enhanceDangerousGear(stateWithOwnedRod(), 1, "rod", "breaker_rod");
expect(result).toMatchObject({ ok: true, nextLevel: 1 });
expect(result.state.gearEnhancements.rods.breaker_rod).toBe(1);
expect(enhanceDangerousGear(result.state, 0, "rod", "unknown")).toMatchObject({
  ok: false,
  error: "invalid_item",
});
```

Cover not-owned gear, max level, insufficient rarity pools, mixed same-rarity fish selection, and the engine-plan parser's malformed saved levels clamped to `0..3`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx vitest run src/adventure/v2/dangerousFishingEnhancement.test.ts src/adventure/v2/dangerousFishingState.test.ts`

Expected: FAIL because the enhancement catalog and transition functions do not exist; the persisted `gearEnhancements` shape already comes from the engine plan.

- [ ] **Step 3: Implement exact costs and pure transitions**

```ts
export const DANGEROUS_GEAR_ENHANCEMENT_COSTS = {
  1: { materials: { common: 6, rare: 4 }, fishingCoins: 1_000 },
  2: { materials: { rare: 8, epic: 5 }, fishingCoins: 3_000 },
  3: { materials: { epic: 8, legendary: 3 }, fishingCoins: 8_000 },
} as const;
```

Reuse `eligibleCatchMaterialIds` and the deterministic highest-quantity-first selection policy from dangerous exchange. Consume the existing `{ rods, reels, lines }` state shape from the engine plan and only write keys for valid owned gear IDs.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/dangerousFishingEnhancement.test.ts src/adventure/v2/dangerousFishingState.test.ts src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts`

Expected: enhancement state parses and modifies realtime bonuses correctly.

- [ ] **Step 5: Commit enhancement domain logic**

```bash
git add src/adventure/v2/dangerousFishingEnhancement.ts src/adventure/v2/dangerousFishingEnhancement.test.ts src/adventure/v2/dangerousFishingState.test.ts
git commit -m "feat: define dangerous fishing gear enhancement"
```

### Task 2: Atomic gear enhancement API

**Files:**
- Modify: `src/lib/server/dangerousFishingExchange.ts`
- Modify: `src/lib/server/dangerousFishingExchangeRoute.test.ts`
- Modify: `src/app/api/v2/dangerous-fishing/exchange/route.ts`

**Interfaces:**
- POST exchange accepts `{ action: "enhance", operationId, gearKind, gearId }` in addition to legacy exchange requests.
- GET view adds `enhancementCosts`, `gearEnhancements`, and per-item `nextEnhancement` affordability.

- [ ] **Step 1: Write failing transaction and idempotency tests**

```ts
const response = await EXCHANGE(request({
  action: "enhance",
  operationId: OPERATION_ID,
  gearKind: "rod",
  gearId: "breaker_rod",
}));
expect(await response.json()).toMatchObject({
  ok: true,
  state: { gearEnhancements: { rods: { breaker_rod: 1 } } },
});
expect(savedWallet().coins).toBe(START_COINS - 1_000);
expect(totalSpentCatchMaterials()).toBe(10);
```

Repeat the same operation ID and assert no second deduction. Cover concurrent operations, max level, not owned, insufficient coins/materials, and mixed rarity selection.

- [ ] **Step 2: Run route tests and confirm RED**

Run: `npx vitest run src/lib/server/dangerousFishingExchangeRoute.test.ts`

Expected: FAIL because the enhance action is rejected.

- [ ] **Step 3: Implement enhancement in the existing serialized transaction**

Lock user, dangerous state, character materials, fishing wallet, and exchange operation state in the existing order. Select exact rarity costs server-side; never trust client-selected enhancement materials. Record the operation before returning the rebuilt view.

- [ ] **Step 4: Run exchange and simulation tests**

Run: `npx vitest run src/lib/server/dangerousFishingExchangeRoute.test.ts src/adventure/v2/dangerousFishingEnhancement.test.ts src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts`

Expected: all tests pass and enhanced gear changes the next encounter modifiers only.

- [ ] **Step 5: Commit the enhancement API**

```bash
git add src/lib/server/dangerousFishingExchange.ts src/lib/server/dangerousFishingExchangeRoute.test.ts src/app/api/v2/dangerous-fishing/exchange/route.ts
git commit -m "feat: enhance dangerous fishing gear"
```

### Task 3: Risk-scaled safe-return bonus

**Files:**
- Create: `src/adventure/v2/dangerousFishingRewards.ts`
- Create: `src/adventure/v2/dangerousFishingRewards.test.ts`
- Modify: `src/adventure/v2/dangerousFishingState.ts`
- Modify: `src/adventure/v2/dangerousFishingState.test.ts`
- Modify: `src/lib/server/dangerousFishingService.ts`
- Modify: `src/lib/server/dangerousFishingRoute.test.ts`
- Modify: `src/adventure/v2/dangerousFishingFeedback.ts`
- Modify: `src/adventure/v2/dangerousFishingFeedback.test.ts`

**Interfaces:**
- Produces: `dangerousReturnFishingCoins(retainedCargoValue, risk)`, accident result field `retainedCargoValue`, and response field `returnFishingCoinsGained`.

- [ ] **Step 1: Write failing reward formula and transaction tests**

```ts
expect(dangerousReturnFishingCoins(2_700, 5)).toBe(270);
expect(dangerousReturnFishingCoins(2_700, 0)).toBe(0);
expect(dangerousFishingReturnFeedback({
  ok: true,
  returned: true,
  materials: { danger_catch_abyssal_crownfish: 2 },
  returnFishingCoinsGained: 270,
})?.detail).toContain("낚시 코인 +270");
```

Add a route test proving incident-lost cargo is excluded and repeated return cannot pay again.

- [ ] **Step 2: Run reward tests and confirm RED**

Run: `npx vitest run src/adventure/v2/dangerousFishingRewards.test.ts src/adventure/v2/dangerousFishingFeedback.test.ts src/lib/server/dangerousFishingRoute.test.ts`

Expected: FAIL because the formula/response field is absent.

- [ ] **Step 3: Settle materials and wallet in the same return transaction**

```ts
export function dangerousReturnFishingCoins(
  retainedCargoValue: number,
  risk: number,
): number {
  return Math.floor(
    Math.max(0, Math.floor(retainedCargoValue))
      * Math.max(0, Math.min(5, risk))
      * 0.02,
  );
}
```

Extend the accident resolver to return the exact `retainedCargoValue` alongside retained materials. For normal returns use the voyage cargo value; for incident returns use the resolver's post-loss value. Never reconstruct value from client data or pre-loss cargo.

- [ ] **Step 4: Run reward and route tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/dangerousFishingRewards.test.ts src/adventure/v2/dangerousFishingFeedback.test.ts src/lib/server/dangerousFishingRoute.test.ts`

Expected: all return paths pass and pay once.

- [ ] **Step 5: Commit return bonuses**

```bash
git add src/adventure/v2/dangerousFishingRewards.ts src/adventure/v2/dangerousFishingRewards.test.ts src/adventure/v2/dangerousFishingState.ts src/adventure/v2/dangerousFishingState.test.ts src/lib/server/dangerousFishingService.ts src/lib/server/dangerousFishingRoute.test.ts src/adventure/v2/dangerousFishingFeedback.ts src/adventure/v2/dangerousFishingFeedback.test.ts
git commit -m "feat: reward risky dangerous fishing returns"
```

### Task 4: Dangerous catch NPC sale prices and UI action

**Files:**
- Modify: `src/adventure/data/v2/dungeonDrops.ts`
- Modify: `src/adventure/data/v2/dangerousFishing.test.ts`
- Modify: `src/app/api/v2/shop/material/sell/route.test.ts`
- Modify: `src/adventure/v2/useDangerousFishingExchange.ts`
- Modify: `src/adventure/v2/DangerousFishingExchangeSection.tsx`
- Modify: `src/adventure/v2/DangerousFishingExchangeSection.test.tsx`
- Modify: `src/adventure/v2/FishingShopPanel.tsx`

**Interfaces:**
- `materialSellPriceOf(dangerousCatchMaterialId(fish.id)) === fish.cargoValue * 10`.
- `useDangerousFishingExchange` adds `sellCatch(materialId, amount)` calling `/api/v2/shop/material/sell` and returns updated materials/gold/bankedGold.

- [ ] **Step 1: Write failing catalog, route, and dialog tests**

```ts
expect(materialSellPriceOf("danger_catch_abyssal_crownfish")).toBe(13_500);
expect(await sellMaterial("danger_catch_ironjaw_tuna", 2)).toMatchObject({
  sold: { count: 2, gold: 4_200 },
});
expect(renderSaleDialog({ amount: 2, unitPrice: 2_100 })).toContain("4,200 G");
```

Cover invalid amounts, unsellable boss tokens, partial quantity, confirmation cancel, banked-gold response, material balance refresh, and trade-restricted accounts following the existing generic material-sale policy.

- [ ] **Step 2: Run sale tests and confirm RED**

Run: `npx vitest run src/adventure/data/v2/dangerousFishing.test.ts src/app/api/v2/shop/material/sell/route.test.ts src/adventure/v2/DangerousFishingExchangeSection.test.tsx`

Expected: FAIL because dangerous catch prices and sale UI are absent.

- [ ] **Step 3: Register prices and reuse the generic sale endpoint**

```ts
export const V2_MATERIAL_SELL_PRICE: Partial<Record<V2MaterialId, number>> = Object.fromEntries(
  Object.values(DANGEROUS_FISH).map((fish) => [
    dangerousCatchMaterialId(fish.id),
    fish.cargoValue * 10,
  ]),
);
```

Do not make boss tokens NPC-sellable. The confirmation dialog shows selected catch, owned/remaining count, unit price, total, and that proceeds go to banked gold. Sync `GameStateProvider` through the existing sale balance patch pattern.

- [ ] **Step 4: Run sale and marketplace regressions**

Run: `npx vitest run src/app/api/v2/shop/material/sell/route.test.ts src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/lib/server/marketplaceV2.test.ts src/lib/server/marketplaceListRoute.test.ts src/lib/server/marketplaceV2Fulfillment.test.ts`

Expected: NPC sale and marketplace trading both remain available.

- [ ] **Step 5: Commit catch sales**

```bash
git add src/adventure/data/v2/dungeonDrops.ts src/adventure/data/v2/dangerousFishing.test.ts src/app/api/v2/shop/material/sell/route.test.ts src/adventure/v2/useDangerousFishingExchange.ts src/adventure/v2/DangerousFishingExchangeSection.tsx src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/FishingShopPanel.tsx
git commit -m "feat: sell returned dangerous fishing catches"
```

### Task 5: Enhancement and bait-effect shop presentation

**Files:**
- Modify: `src/adventure/v2/useDangerousFishingExchange.ts`
- Modify: `src/adventure/v2/DangerousFishingExchangeSection.tsx`
- Modify: `src/adventure/v2/DangerousFishingExchangeSection.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingShopSection.tsx`
- Modify: `src/adventure/v2/DangerousFishingShopSection.test.tsx`
- Modify: `src/adventure/v2/FishingShopView.tsx`

**Interfaces:**
- Adds `enhanceGear({ operationId, gearKind, gearId })` to the exchange hook.
- Gear cards show enhancement level, current effect, next effect/cost, and an explicit confirmation dialog.
- Bait cards show the exact realtime behavior effect from the catalog.

- [ ] **Step 1: Write failing UI model and confirmation tests**

```tsx
expect(renderGearCard({ level: 2, kind: "rod" })).toContain("+2");
expect(renderGearCard({ level: 2, kind: "rod" })).toContain("어체력 피해 +12%");
expect(renderEnhanceDialog({ nextLevel: 3 })).toContain("영웅 어획물 8개");
expect(renderBaitCard("luminous_bait")).toContain("다음 행동 1개 예고");
```

Cover max level, insufficient materials/coins, repeated operation response, modal focus/escape, and synchronized coin/material balances.

- [ ] **Step 2: Run shop tests and confirm RED**

Run: `npx vitest run src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx`

Expected: FAIL because enhancement UI and new bait copy are absent.

- [ ] **Step 3: Implement opaque cards and confirmation dialogs**

Use `SURFACE_CARD`/`SURFACE_INSET`, `useModalA11y`, `useEscapeKey`, and a fresh `crypto.randomUUID()` per confirmed enhancement. Reuse the same operation ID only for retries of that confirmation.

- [ ] **Step 4: Run shop tests and confirm GREEN**

Run: `npx vitest run src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/lib/server/dangerousFishingExchangeRoute.test.ts`

Expected: all shop and server exchange tests pass.

- [ ] **Step 5: Commit reward-progression UI**

```bash
git add src/adventure/v2/useDangerousFishingExchange.ts src/adventure/v2/DangerousFishingExchangeSection.tsx src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/DangerousFishingShopSection.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/adventure/v2/FishingShopView.tsx
git commit -m "feat: present dangerous fishing progression"
```

### Task 6: Manual, update-note source, and full verification

**Files:**
- Modify: `src/app/manual/content/pastimes.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Create: `docs/patch-notes/2026-08-22-dangerous-fishing-overhaul.md`
- Modify only additional files required by verification failures.

**Interfaces:**
- Produces player-facing documentation matching the implemented rules; no deployment action.

- [ ] **Step 1: Write failing manual assertions**

```ts
expect(manualHtml).toContain("누르고 감아올리기");
expect(manualHtml).toContain("최대 +3");
expect(manualHtml).toContain("주간 초기화되지 않습니다");
expect(manualHtml).toContain("일반 낚시는 기존 방식");
```

- [ ] **Step 2: Run manual tests and confirm RED**

Run: `npx vitest run src/app/manual/current-content.test.tsx`

Expected: FAIL because the manual still describes three-button dangerous fishing.

- [ ] **Step 3: Update manual and patch-note source**

Document hold/release controls, risk levels, level/gear/bait modifiers, enhancement costs, return formula in player-friendly terms, NPC sale, boss rewards, permanent/no-reset progression, v1 data preservation, and that general fishing is unchanged. Follow `docs/patch-notes/TEMPLATE.md` for the patch-note file.

- [ ] **Step 4: Run the complete targeted regression suite**

Run: `npx vitest run src/adventure/data/v2/dangerousFishing.test.ts src/adventure/v2/dangerousFishingRealtimeModifiers.test.ts src/adventure/v2/dangerousFishingRealtime.test.ts src/adventure/v2/dangerousFishingEnhancement.test.ts src/adventure/v2/dangerousFishingRewards.test.ts src/adventure/v2/dangerousFishingState.test.ts src/adventure/v2/DangerousFishingRealtimePanel.test.tsx src/adventure/v2/DangerousFishingView.test.tsx src/adventure/v2/DangerousFishingBossPanel.test.tsx src/adventure/v2/DangerousFishingExchangeSection.test.tsx src/adventure/v2/DangerousFishingShopSection.test.tsx src/lib/server/dangerousFishingRoute.test.ts src/lib/server/dangerousFishingBossRoute.test.ts src/lib/server/dangerousFishingExchangeRoute.test.ts src/app/api/v2/shop/material/sell/route.test.ts src/app/manual/current-content.test.tsx`

Expected: all tests pass.

- [ ] **Step 5: Run project verification**

Run: `npm run check-images && npm run check-asset-rights && npx tsc --noEmit && git diff --check`

Run: `npx eslint src/adventure/v2 src/lib/server/dangerousFishingService.ts src/lib/server/dangerousFishingBoss.ts src/lib/server/dangerousFishingExchange.ts src/app/api/v2/dangerous-fishing src/app/api/v2/shop/material/sell/route.ts src/app/manual/content/pastimes.tsx`

Expected: every command exits 0. If the broad directory lint exposes unrelated pre-existing failures, record them and rerun ESLint with the exact changed-file list; do not claim the broad lint passed.

- [ ] **Step 6: Commit documentation and final fixes**

```bash
git add src/app/manual/content/pastimes.tsx src/app/manual/current-content.test.tsx docs/patch-notes/2026-08-22-dangerous-fishing-overhaul.md
git commit -m "docs: explain dangerous fishing realtime progression"
```

Any verification failure must be fixed and committed in the task that owns the affected file before this documentation commit. Do not use wildcard or placeholder staging for verification fixes.

- [ ] **Step 7: Audit commits and changed-file coverage**

Run: `git log --oneline --decorate -25 && git status --short && git diff 8defa4e5c..HEAD --name-only | sort -u`

Expected: every planned domain/server/client/asset/doc file appears in the commit range, no temporary PNG or `.superpowers/` file is committed, and no deployment or maintenance script was run.
