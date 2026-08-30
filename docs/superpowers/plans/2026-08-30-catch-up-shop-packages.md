# Catch-up Shop Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-per-KST-month bound stamina potion bundle and a once-per-account growth leap package whose 30-day stamina-spend mission grants 5,000 mastery certificates and the approved consumable/cosmetic rewards.

**Architecture:** A pure `growthLeap` domain module owns product constants, KST purchase periods, state parsing, activation, stamina progress, milestone views, and claims. The coin-shop transaction handles both special bundles atomically, while a small server helper records confirmed stamina costs in the same gameplay transaction. Quest GET exposes the mission view and a dedicated claim route grants each milestone idempotently.

**Tech Stack:** TypeScript, Next.js App Router route handlers, React, Drizzle transactions over `saves_kv`, Vitest, Testing Library/static React rendering.

## Global Constraints

- Do not deploy, push, merge, or change maintenance mode.
- Monthly stamina bundle: 300 coins, 20 bound potions, three purchases per KST calendar month.
- Growth leap package: 1,200 coins, once per account, 30 bound potions, one nickname cosmetic box, one profile cosmetic box, no adventure-support pass.
- Mission progression lasts exactly 30 days; completed rewards remain claimable for seven additional days.
- Milestones are 3,000 / 10,000 / 20,000 / 35,000 / 50,000 stamina and grant 300 / 1,000 / 600 / 1,400 / 1,700 mastery certificates respectively.
- Milestones 1 and 3 grant five bound stamina potions each; milestone 5 grants one tradeable 30-day cosmetic extension.
- Purchases, progress, and claims are server-authoritative, transactional, account-scoped, and not restored by character reset.
- No level boost, EXP/gold/drop/combat multiplier, automatic hunt, equipment, or support-pass reward.
- Follow the installed Next.js documentation in `node_modules/next/dist/docs/` before changing route or client conventions.

---

### Task 1: Growth leap domain and reset-safe account state

**Files:**
- Create: `src/adventure/data/v2/growthLeap.ts`
- Create: `src/adventure/data/v2/growthLeap.test.ts`
- Modify: `src/lib/server/resetCharacterData.ts`
- Create: `src/lib/server/resetCharacterData.test.ts`

**Interfaces:**
- Produces: `GROWTH_LEAP_SAVE_KEY`, `MONTHLY_STAMINA_BUNDLE_ITEM_ID`, `GROWTH_LEAP_PACKAGE_ITEM_ID`, `GROWTH_LEAP_MILESTONES`, `parseGrowthLeapSave(raw)`, `growthLeapShopView(raw, now)`, `buyMonthlyStaminaBundle(raw, now)`, `activateGrowthLeap(raw, now)`, `recordGrowthLeapStamina(raw, amount, now)`, `growthLeapMissionView(raw, now)`, and `claimGrowthLeapMilestone(raw, milestoneId, now)`.
- The save shape preserves `monthlyPeriod`, `monthlyPurchases`, and an optional lifetime `mission` with purchase/progress/claim timestamps, `staminaSpent`, and claimed milestone IDs.

- [ ] **Step 1: Write failing pure-domain tests**

```ts
expect(buyMonthlyStaminaBundle({}, Date.UTC(2026, 7, 31, 14, 59))).toMatchObject({ ok: true, purchases: 1 });
expect(buyMonthlyStaminaBundle({ monthlyPeriod: "2026-09", monthlyPurchases: 3 }, Date.UTC(2026, 8, 1))).toEqual({ ok: false, error: "monthly_limit" });
expect(activateGrowthLeap({}, 1_000)).toMatchObject({ ok: true, state: { mission: { purchasedAt: 1_000, progressUntil: 2_592_001_000, claimUntil: 3_196_801_000 } } });
expect(recordGrowthLeapStamina(active, 3_500, 2_000).mission?.staminaSpent).toBe(3_500);
expect(recordGrowthLeapStamina(active, 99_999, 2_000).mission?.staminaSpent).toBe(50_000);
expect(claimGrowthLeapMilestone(activeAt10k, "growth_2", 2_000)).toMatchObject({ ok: true, reward: { masteryCertificates: 1_000 } });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/adventure/data/v2/growthLeap.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure model**

```ts
export const GROWTH_LEAP_SAVE_KEY = "growth-leap.v1";
export const MONTHLY_STAMINA_BUNDLE_ITEM_ID = "monthly_stamina_potion_bundle";
export const GROWTH_LEAP_PACKAGE_ITEM_ID = "growth_leap_package";
export const GROWTH_LEAP_PROGRESS_MS = 30 * 24 * 60 * 60 * 1_000;
export const GROWTH_LEAP_CLAIM_GRACE_MS = 7 * 24 * 60 * 60 * 1_000;

export const GROWTH_LEAP_MILESTONES = [
  { id: "growth_1", stamina: 3_000, masteryCertificates: 300, staminaPotions: 5, cosmeticExtensions: 0 },
  { id: "growth_2", stamina: 10_000, masteryCertificates: 1_000, staminaPotions: 0, cosmeticExtensions: 0 },
  { id: "growth_3", stamina: 20_000, masteryCertificates: 600, staminaPotions: 5, cosmeticExtensions: 0 },
  { id: "growth_4", stamina: 35_000, masteryCertificates: 1_400, staminaPotions: 0, cosmeticExtensions: 0 },
  { id: "growth_5", stamina: 50_000, masteryCertificates: 1_700, staminaPotions: 0, cosmeticExtensions: 1 },
] as const;
```

Use a fixed `+09:00` calendar calculation for KST month keys. Normalize counts to non-negative integers, cap purchases at three and progress at 50,000, ignore unknown claimed IDs, reject a second activation forever, stop progress at `progressUntil`, allow claims through `claimUntil` inclusively, and return explicit `not_purchased`, `expired`, `not_complete`, and `already_claimed` errors.

- [ ] **Step 4: Preserve the account state through character resets**

Change the `savesKv` deletion predicate to exclude `GROWTH_LEAP_SAVE_KEY`. Add a test that seeds that key and verifies every other character save is deleted while the growth-leap save remains.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run src/adventure/data/v2/growthLeap.test.ts src/lib/server/resetCharacterData.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adventure/data/v2/growthLeap.ts src/adventure/data/v2/growthLeap.test.ts src/lib/server/resetCharacterData.ts src/lib/server/resetCharacterData.test.ts
git commit -m "feat: model growth leap account progress"
```

### Task 2: Coin-shop catalog and atomic bundle purchases

**Files:**
- Modify: `src/adventure/data/v2/museunCashItems.ts`
- Modify: `src/adventure/data/v2/museunCashItems.test.ts`
- Modify: `src/app/api/v2/museun-coin-shop/route.ts`
- Modify: `src/app/api/v2/museun-coin-shop/route.test.ts`

**Interfaces:**
- Consumes: Task 1 product IDs, purchase transitions, `GROWTH_LEAP_SAVE_KEY`, and existing bound potion/cash-item helpers.
- Produces: two `delivery: "bundle"` catalog entries and GET/POST responses containing `monthlyStaminaBundle` and `growthLeapPackage` purchase state.

- [ ] **Step 1: Write failing catalog and route tests**

Assert the catalog exposes exactly these special products:

```ts
expect(MUSEUN_CASH_ITEMS.monthly_stamina_potion_bundle).toMatchObject({
  coinPrice: 300,
  delivery: "bundle",
  tradeable: false,
  effect: { kind: "stamina_potion_bundle", potions: 20, monthlyLimit: 3 },
});
expect(MUSEUN_CASH_ITEMS.growth_leap_package).toMatchObject({
  coinPrice: 1_200,
  delivery: "bundle",
  tradeable: false,
  effect: { kind: "growth_leap", potions: 30, missionDays: 30 },
});
```

Route cases must cover: first through third monthly purchase; rejected fourth purchase without coin loss; KST month rollover; growth purchase grants 30 bound potions and the two cosmetic boxes; rejected second lifetime purchase; special products reject quantity other than one; and failure leaves every save untouched.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/adventure/data/v2/museunCashItems.test.ts src/app/api/v2/museun-coin-shop/route.test.ts`

Expected: FAIL because bundle delivery and purchase handling do not exist.

- [ ] **Step 3: Add the special catalog entries**

Add the two bundle IDs to `MUSEUN_SHOP_ITEM_IDS`, but exclude them from inventory, utility, tradeable, and admin-gift item lists. Extend the delivery union naturally from the catalog and force bundle purchase quantity to one.

- [ ] **Step 4: Implement the atomic transaction**

For either bundle, lock in the order `character.v2` → coin wallet → `growth-leap.v1` → `stamina-potions.v1`. Check purchase limits and balance before writes. The monthly bundle grants 20 bound potions and increments the KST-period count. The growth package activates the mission, grants 30 bound potions, and adds one `chroma_name_box` and one `profile_border_box` to `character.v2.cashItems`. Return current limits/state in both GET and successful POST responses.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run src/adventure/data/v2/museunCashItems.test.ts src/app/api/v2/museun-coin-shop/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adventure/data/v2/museunCashItems.ts src/adventure/data/v2/museunCashItems.test.ts src/app/api/v2/museun-coin-shop/route.ts src/app/api/v2/museun-coin-shop/route.test.ts
git commit -m "feat: sell limited catch-up bundles"
```

### Task 3: Mission API and transactional milestone claims

**Files:**
- Create: `src/app/api/v2/me/growth-leap/claim/route.ts`
- Create: `src/app/api/v2/me/growth-leap/claim/route.test.ts`
- Modify: `src/app/api/v2/me/quests/route.ts`
- Create: `src/lib/server/questRoute.test.ts`

**Interfaces:**
- Consumes: `growthLeapMissionView()` and `claimGrowthLeapMilestone()` from Task 1.
- Produces: `growthLeap` in the quests GET response and `POST /api/v2/me/growth-leap/claim { milestoneId }`.

- [ ] **Step 1: Write failing GET and claim tests**

Cover an absent package, active progress, claim-only grace, full expiry, incomplete milestone, duplicate claim, and a successful stage 1 claim that atomically adds 300 mastery certificates plus five bound potions. Cover stage 5 adding one `cosmetic_extension_30d` to cash items.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/questRoute.test.ts src/app/api/v2/me/growth-leap/claim/route.test.ts`

Expected: FAIL because the quest response and claim route are missing.

- [ ] **Step 3: Expose mission state from quest GET**

Read `growth-leap.v1` with the existing parallel quest reads and return the pure mission view under `growthLeap`. Keep the existing quest payload unchanged when the package was never bought by returning `{ status: "not_purchased" }` rather than omitting the key.

- [ ] **Step 4: Implement idempotent reward claims**

Lock in the order `character.v2` → `growth-leap.v1` → `inventory.v2` → `stamina-potions.v1`. Re-evaluate time, progress, and claimed IDs on the locked state. Add `masteryCertificates`, grant bound potions, add the tradeable extension item where applicable, and persist the claimed milestone in one transaction. Return exact granted amounts and the updated mission view.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run src/lib/server/questRoute.test.ts src/app/api/v2/me/growth-leap/claim/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v2/me/growth-leap/claim/route.ts src/app/api/v2/me/growth-leap/claim/route.test.ts src/app/api/v2/me/quests/route.ts src/lib/server/questRoute.test.ts
git commit -m "feat: claim growth leap milestones"
```

### Task 4: Record every confirmed character-stamina cost

**Files:**
- Create: `src/lib/server/growthLeapProgress.ts`
- Create: `src/lib/server/growthLeapProgress.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`
- Modify: `src/app/api/v2/mastery-tower/attempt/route.ts`
- Modify: `src/app/api/v2/arena/match/route.ts`
- Modify: `src/app/api/v2/coop/attack/route.ts`
- Modify: `src/app/api/v2/me/move-tile/route.ts`
- Modify: `src/app/api/v2/me/visit-outpost/route.ts`
- Modify: `src/app/api/v2/outpost/claim/route.ts`
- Modify: `src/app/api/v2/outpost/eject/route.ts`
- Modify: `src/lib/server/huntRoute.test.ts`
- Modify: `src/app/api/v2/coop/attack/route.test.ts`

**Interfaces:**
- Produces: `recordGrowthLeapStaminaSpendInTx(tx, userId, amount, now): Promise<GrowthLeapMissionView>`.
- Consumes: Task 1 pure progress transition and save key.

- [ ] **Step 1: Write the failing server-helper test**

```ts
await recordGrowthLeapStaminaSpendInTx(tx, "u1", 20, 2_000);
expect(upsertSave).toHaveBeenCalledWith(tx, "u1", GROWTH_LEAP_SAVE_KEY, expect.objectContaining({ mission: expect.objectContaining({ staminaSpent: 20 }) }));
```

Also assert zero/negative costs and inactive/expired missions do not write.

- [ ] **Step 2: Run the helper test to verify it fails**

Run: `npx vitest run src/lib/server/growthLeapProgress.test.ts`

Expected: FAIL because the helper is missing.

- [ ] **Step 3: Implement the server helper**

Lock `growth-leap.v1`, apply the pure transition, and upsert only when progress changes. Keep the caller's transaction boundary; never start a nested transaction.

- [ ] **Step 4: Add progress calls at successful commit points**

Call the helper only after each route has passed all policy/session/cooldown checks and written the resulting stamina state. Hunt records `HUNT_COST × completed battles` once per request, including partial batches but excluding cooldown-mode hunts. Mastery tower records the positive entry cost, arena the authoritative match cost, co-op the fixed attack cost, and movement/outpost routes their actual stamina branch only. Gold-paid movement, free practice, validation failures, and rolled-back actions record zero.

- [ ] **Step 5: Add representative route regression assertions and audit all spend paths**

Use the hunt harness to prove a three-battle hunt records three and a partial hunt records only completed battles. Use the co-op harness to prove a successful attack records `COOP_ATTACK_STAMINA_COST` while a rejected attack does not call the helper. Then run `rg -n "tryConsume\\(" src/app/api/v2` and inspect every result to confirm the eight listed handlers either call the progress helper with their authoritative positive cost or are read-only/non-spending routes.

- [ ] **Step 6: Run focused stamina route tests**

Run:

```bash
npx vitest run src/lib/server/growthLeapProgress.test.ts src/lib/server/huntRoute.test.ts src/app/api/v2/coop/attack/route.test.ts
npx tsc --noEmit
```

Expected: PASS with no changed gameplay result except the additional account progress save.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/growthLeapProgress.ts src/lib/server/growthLeapProgress.test.ts src/lib/server/huntRoute.test.ts src/app/api/v2/coop/attack/route.test.ts src/app/api/v2/dungeon/hunt/route.ts src/app/api/v2/mastery-tower/attempt/route.ts src/app/api/v2/arena/match/route.ts src/app/api/v2/coop/attack/route.ts src/app/api/v2/me/move-tile/route.ts src/app/api/v2/me/visit-outpost/route.ts src/app/api/v2/outpost/claim/route.ts src/app/api/v2/outpost/eject/route.ts
git commit -m "feat: track growth leap stamina progress"
```

### Task 5: Coin-shop limits and quest mission UI

**Files:**
- Modify: `src/adventure/v2/MuseunCoinShopView.tsx`
- Modify: `src/adventure/v2/MuseunCoinShopView.test.ts`
- Modify: `src/adventure/v2/V2QuestView.tsx`
- Modify: `src/adventure/v2/V2QuestView.test.tsx`

**Interfaces:**
- Consumes: special bundle GET/POST fields from Task 2 and quest `growthLeap` plus claim route from Task 3.
- Produces: limited-product cards/details and a `GrowthLeapMissionPanel` rendered on the tutorial quest tab.

- [ ] **Step 1: Read installed Next.js client guidance**

Run: `rg -n "use client|useSearchParams|fetch" node_modules/next/dist/docs/01-app/03-building-your-application/03-rendering node_modules/next/dist/docs/01-app/03-building-your-application/04-data-fetching | head -120`

Expected: confirm current client component and route fetch conventions before editing.

- [ ] **Step 2: Write failing UI tests**

Assert the consumable group shows both new products, monthly detail displays `이번 달 2/3회 구매`, the exhausted monthly and already-owned growth buttons are disabled, and bundle purchase confirmation forces quantity one. Render mission panels for active, claim-only, and expired states; assert progress, countdown/status copy, exact milestone rewards, and claim button states.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/adventure/v2/MuseunCoinShopView.test.ts src/adventure/v2/V2QuestView.test.tsx`

Expected: FAIL because the bundle and mission UI do not exist.

- [ ] **Step 4: Implement the shop UI**

Add both products to `이용권·소모품`, use existing code-native `PlumpGameIcon` artwork instead of adding raster assets, show bound/tradeable contents and limits, update state from POST responses, map `monthly_limit` and growth `already_owned` errors, and hide quantity controls for `delivery: "bundle"`.

- [ ] **Step 5: Implement the mission panel**

Add a focused exported `GrowthLeapMissionPanel` using `Card`/`SURFACE_INSET`, never translucent custom backgrounds. Show a 0–50,000 progress bar, remaining period, five reward rows, and `받기` only for claimable stages. On success refresh the quest payload and global game state and display the exact reward toast.

- [ ] **Step 6: Run UI tests**

Run: `npx vitest run src/adventure/v2/MuseunCoinShopView.test.ts src/adventure/v2/V2QuestView.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/adventure/v2/MuseunCoinShopView.tsx src/adventure/v2/MuseunCoinShopView.test.ts src/adventure/v2/V2QuestView.tsx src/adventure/v2/V2QuestView.test.tsx
git commit -m "feat: show catch-up bundles and missions"
```

### Task 6: Manual, release guardrails, and full verification

**Files:**
- Modify: `src/app/manual/content/economy.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: final product and mission constants.
- Produces: player-facing documentation that matches the implementation exactly.

- [ ] **Step 1: Add manual assertions**

Assert the manual states 20 potions, three monthly purchases, 1,200 coins, account lifetime once, 30+7-day timing, 50,000 maximum progress, and 5,000 total mastery certificates. Assert it contains no support-pass or equipment reward claim for this package.

- [ ] **Step 2: Update the manual from shared constants where practical**

Document product limits, immediate contents, all five milestones, bound/tradeable distinctions, expiry behavior, and the absence of direct level/combat bonuses.

- [ ] **Step 3: Run focused and aggregate verification**

Run:

```bash
npx vitest run src/adventure/data/v2/growthLeap.test.ts src/adventure/data/v2/museunCashItems.test.ts src/app/api/v2/museun-coin-shop/route.test.ts src/app/api/v2/me/growth-leap/claim/route.test.ts src/lib/server/growthLeapProgress.test.ts src/adventure/v2/MuseunCoinShopView.test.ts src/adventure/v2/V2QuestView.test.tsx
npx tsc --noEmit
npm test -- --run
npm run lint
npm run check-images
git diff --check
```

Expected: all commands pass. If the repository has a pre-existing unrelated failure, record the exact command and error without changing unrelated files.

- [ ] **Step 4: Review the final diff against the design**

Verify totals of 60 monthly potions, 40 package-plus-mission potions, and 5,000 certificates; all purchase/claim limits; KST reset; transaction lock order; reset preservation; every `tryConsume` route; light/dark opaque surfaces; and no support, equipment, direct combat, or auto-hunt benefit.

- [ ] **Step 5: Commit**

```bash
git add src/app/manual/content/economy.tsx src/app/manual/current-content.test.tsx
git commit -m "docs: explain growth leap packages"
```
