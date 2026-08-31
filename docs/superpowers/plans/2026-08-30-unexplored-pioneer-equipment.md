# Unexplored Pioneer Equipment Implementation Plan

> **For Codex:** Execute this plan inline with `superpowers:executing-plans`. Follow `superpowers:test-driven-development` for each behavioral task and `superpowers:verification-before-completion` before claiming completion. Do not deploy.

**Goal:** Add the approved 18-piece Pioneer equipment progression, six pool-specific rare weapon drops, and five workshop materials to the personal honor shop while preserving existing crafting, reward-classification, and transaction contracts.

**Architecture:** Extend the existing equipment/set and guild-workshop data catalogs instead of creating new screens or APIs. Model Pioneer weapon drops as a dedicated rare roll on the unexplored reward plan so they bypass common equipment/pool-loot multipliers, then merge successful rolls into the existing unique-equipment mint/persistence path. Extract the personal honor-shop catalog into shared data and make its route grant either the existing bound stamina potion or one `character.v2.materials` entry atomically.

**Tech Stack:** Next.js 16 App Router route handlers, React 19 client components, TypeScript, Drizzle transactions, Vitest/Testing Library.

---

## Task 1: Pioneer equipment catalog and set

**Files:**

- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`

- [x] Add failing catalog tests that identify exactly 12 craft-only non-weapons and six custom-drop-only unique weapons with tier 16 and `unexplored_pioneer` tag.
- [x] Add literal assertions for every item slot, concept, weapon type, power, and option profile from the approved design.
- [x] Add failing set tests for 2/3/5 thresholds, cumulative five-piece totals, basic-item five-slot coverage, and no six-piece threshold/signature.
- [x] Run `npm test -- src/adventure/data/v2/v2Equipment.test.ts` and confirm expected failures from missing catalog/set data.
- [x] Add the 18 catalog entries and `unexplored_pioneer` tag-set definition with cumulative threshold semantics.
- [x] Update existing catalog-count expectations and run the focused test green.

## Task 2: Guild workshop recipes

**Files:**

- Modify: `src/adventure/data/v2/guildWorkshop.ts`
- Modify: `src/adventure/data/v2/guildWorkshop.test.ts`

- [x] Add failing table-driven tests for the 12 recipe IDs, paired artisan levels 13–18, smithy level 5, XP 300–400, resource profiles, and exact equipment outputs.
- [x] Assert literal normal costs: tier-16 resources totaling 480, pool material 8, mapped common material 10, sunstone 4, aurora crystal 4, 300,000 gold, and focused-only rare material 1.
- [x] Assert existing masterwork cost helpers double resources, all material classes, rare material, and gold exactly once.
- [x] Run `npm test -- src/adventure/data/v2/guildWorkshop.test.ts` and confirm expected missing-recipe failures.
- [x] Add a Pioneer recipe helper and the 12 recipes to the existing catalog, using `미개척지 · 개척자` notes without introducing a new workshop API or selection schema.
- [x] Run the focused workshop data tests green, then run the existing workshop route test to confirm transaction behavior still covers the new recipes.

## Task 3: Pool-specific rare weapon rewards and UI disclosure

**Files:**

- Modify: `src/adventure/data/v2/unexploredMonsterPools.ts`
- Modify: `src/adventure/data/v2/unexploredHuntRewards.ts`
- Modify: `src/adventure/data/v2/unexploredHuntRewards.test.ts`
- Modify: `src/adventure/v2/unexploredTreeModel.ts`
- Modify: `src/adventure/v2/unexploredTreeModel.test.ts`
- Modify: `src/adventure/v2/V2UnexploredTreeView.tsx`
- Modify: `src/adventure/v2/V2UnexploredTreeView.test.tsx`

- [x] Add failing reward tests for all six pool-to-weapon mappings, normal `rng < 0.001`, focused `rng < 0.002`, miss-at-boundary behavior, and no weapon on base/boss pools.
- [x] Add failing tests proving a successful Pioneer weapon gets the rare-copy roll but does not receive common equipment, base reward, or pool-loot multiplication.
- [x] Run the reward test and confirm failures are caused by the absent rare-weapon slot.
- [x] Add each pool's weapon ID to pool metadata and a dedicated optional rare-weapon rule to `UnexploredRewardPlan`; roll it once and merge successes into `droppedUniques`/grants without passing through common equipment multipliers.
- [x] Run reward tests green and run the dungeon hunt route tests that exercise unexplored reward persistence.
- [x] Add failing model/view assertions for material `1% / 집중 1.5%` and weapon `0.1% / 집중 0.2%` disclosure, then expose the weapon name/rates on active pool cards using existing opaque surfaces.
- [x] Run model and view tests green.

## Task 4: Personal honor-shop material purchases

**Files:**

- Create: `src/adventure/data/v2/honorShop.ts`
- Create: `src/adventure/data/v2/honorShop.test.ts`
- Modify: `src/app/api/v2/me/honor-shop/route.ts`
- Create: `src/app/api/v2/me/honor-shop/route.test.ts`
- Modify: `src/adventure/v2/HonorShopPanel.tsx`
- Create: `src/adventure/v2/HonorShopPanel.test.tsx`

- [x] Add failing catalog tests for stamina potion plus exactly five workshop materials priced 10/20/40/50/70 honor with quantity one and no purchase limit.
- [x] Implement a shared typed catalog carrying grant kind, target ID, quantity, name, and price.
- [x] Add failing route tests for GET data, material success, stamina success, invalid item, insufficient honor, and preservation of `honorEarned`; assert material purchases update honor and `character.v2.materials` in the same transaction result.
- [x] Refactor POST to lock `character.v2`, validate honor, and either merge one material into the same save or lock/update the existing stamina key in the established order; return item-specific grant metadata.
- [x] Add failing panel tests for rendering all items/prices and showing the actual purchased item/quantity in the success toast.
- [x] Update the client response type and toast; preserve the current stamina resource patch behavior and existing opaque card layout.
- [x] Run the honor data, route, and panel tests green.

## Task 5: Integrated regression and balance verification

**Files:**

- Modify if needed: `scripts/sim-v2-unexplored-rewards.ts`
- Modify if needed: only tests or code directly implicated by verified regressions

- [x] Run focused suites for equipment, workshop, unexplored rewards/model/view, honor shop, and dungeon hunt route.
- [x] Run the unexplored reward simulation and hand-check the 30%-focused expected weapon acquisition rate near one per 1,667 battles before bonuses.
- [x] Run `npx tsc --noEmit`.
- [x] Run `npm run lint`.
- [x] Run `npm run check-images`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Review the final diff for unrelated edits, reward double-classification, accidental feature-flag/deployment changes, and Korean copy consistency.
- [x] Commit the implementation on the current branch without pushing or deploying.
