# Cooking Research Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public button-driven cooking list with a 100-recipe hidden-combination research system, permanent specialties, condition-score deliveries, rebalanced tradeable foods, and an idempotent 50% legacy ingredient recall.

**Architecture:** Keep all ingredient answers and craft costs in a `server-only` catalog, while shared modules expose only public recipe metadata, state parsers, food IDs, effects, and UI-safe types. Store compact personal progress in `cooking.v2`, failed combinations and server-first discoveries in relational tables, and run the legacy recall as an idempotent data migration that covers inventory, marketplace escrow, and unclaimed inbox payloads.

**Tech Stack:** Next.js 16.2 App Router route handlers, React 19 client components, TypeScript 5, Drizzle ORM/PostgreSQL, Vitest/Testing Library, Sharp/WebP image pipeline.

## Global Constraints

- Never deploy without an explicit deployment request.
- Hidden combinations and craft costs must never enter a Client Component import graph or an undiscovered API response.
- Use `SURFACE_CARD`, `SURFACE_INSET`, and `SURFACE_ACCENT` for opaque cooking UI surfaces.
- Preserve unrelated `.superpowers/` worktree content.
- All new cooking images use `public/images/items/cooking/<recipe-id>.webp`.
- Existing foods are removed and refund `floor(aggregate legacy base ingredients * 0.5)` exactly once.

---

### Task 1: Public domain model and server-only 100-recipe catalog

**Files:**
- Create: `src/adventure/v2/cooking/types.ts`
- Create: `src/adventure/v2/cooking/catalog.ts`
- Create: `src/lib/server/cooking/recipes.ts`
- Create: `src/lib/server/cooking/recipes.test.ts`
- Modify: `src/adventure/v2/cooking.ts`

**Interfaces:**
- Produces `CookingField`, `CookingMethod`, `CookingIngredientId`, `CookingEffect`, `CookingRecipePublic`, `CookingRecipeSecret`, `COOKING_PUBLIC_RECIPES`, `findSecretRecipe(method, ingredientIds)`, and `canonicalCookingCombination(method, ingredientIds)`.
- Public recipes contain ID, name, field, method, tier, level, image, effect, description, and discovery class; only the server module contains ingredient IDs and per-craft counts.

- [ ] **Step 1: Write the failing catalog tests**

```ts
it("defines 6 basic and 94 hidden recipes with 100 unique answers", () => {
  expect(COOKING_SECRET_RECIPES).toHaveLength(100);
  expect(COOKING_SECRET_RECIPES.filter((r) => r.discovery === "basic")).toHaveLength(6);
  expect(new Set(COOKING_SECRET_RECIPES.map((r) => canonicalCookingCombination(r.method, r.ingredients.map((i) => i.id)))).size).toBe(100);
});

it("matches without ingredient order and never uses quantities as an answer", () => {
  const found = findSecretRecipe("bake", ["farm:egg", "processed:flour", "farm:milk"]);
  expect(found?.id).toBe("country_egg_bread");
  expect(findSecretRecipe("bake", ["farm:milk", "farm:egg", "processed:flour"])?.id).toBe(found?.id);
});
```

- [ ] **Step 2: Run `npm test -- src/lib/server/cooking/recipes.test.ts` and confirm missing-module failures.**
- [ ] **Step 3: Add focused public types, metadata, 100 literal recipe definitions, canonical matching, slot/level unlock helpers, effect-budget validation, and `import "server-only"` on the secret module.**
- [ ] **Step 4: Run the catalog tests and `npx tsc --noEmit`.**
- [ ] **Step 5: Commit `feat: add hidden cooking recipe catalog`.**

### Task 2: Cooking v2 state, food snapshots, permanent specialty, and effect application

**Files:**
- Create: `src/adventure/v2/cooking/state.ts`
- Create: `src/adventure/v2/cooking/food.ts`
- Create: `src/adventure/v2/cooking/state.test.ts`
- Create: `src/adventure/v2/cooking/food.test.ts`
- Modify: `src/adventure/v2/cooking.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`

**Interfaces:**
- Produces `COOKING_SAVE_KEY = "cooking.v2"`, `CookingStateV2`, `parseCookingState`, `chooseCookingSpecialty`, `cookingSpecialtyRank`, `CookingFoodId`, `cookingFoodId`, `cookingFoodDefinition`, `scaleCookingEffect`, and `activeCookingBuff`.
- Food IDs snapshot originator boolean and specialty bonus `0..5`; all active buffs expire in 12 hours and expose flat combat, primary-stat, stat-percent, hunt EXP, and hunt gold effects.

- [ ] **Step 1: Write failing state and specialty tests.**

```ts
it("auto-knows only six basics and preserves level xp", () => {
  const state = parseCookingState({ version: 2, xp: 12_345, discoveredRecipeIds: ["bad"] }, NOW);
  expect(state.xp).toBe(12_345);
  expect(state.discoveredRecipeIds).toEqual(expect.arrayContaining(BASIC_RECIPE_IDS));
});

it("chooses one specialty only after level 20 and ten hidden discoveries", () => {
  const eligible = fixtureState({ xp: cookingLevelXpThreshold(20), discoveredRecipeIds: tenHiddenIds });
  expect(chooseCookingSpecialty(eligible, "hearth").specialty?.field).toBe("hearth");
  expect(() => chooseCookingSpecialty(chooseCookingSpecialty(eligible, "hearth"), "pot")).toThrow("specialty_permanent");
});
```

- [ ] **Step 2: Run the state tests and confirm missing behavior.**
- [ ] **Step 3: Implement bounded parsers, day/week normalization, specialty XP/ranks, research score, legacy-token markers, pantry/processed inventories, and delivery progress.**
- [ ] **Step 4: Write failing food tests for 12-hour replacement, additive 1.35 maximum scaling, caps, and food-ID round trips.**
- [ ] **Step 5: Implement v2 food IDs/effects/inventory and update PvE combat/hunt rewards while preserving `includeCookingBuff: false` PvP exclusion.**
- [ ] **Step 6: Run focused state, food, combat, and hunt tests.**
- [ ] **Step 7: Commit `feat: add cooking specialties and food effects`.**

### Task 3: Relational discovery records and legacy food recall migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0176_cooking_research_overhaul.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/lib/server/cooking/legacyRecall.ts`
- Create: `src/lib/server/cooking/legacyRecall.test.ts`
- Create: `src/db/cookingLegacyRecallMigration.test.ts`

**Interfaces:**
- Produces `cookingFirstDiscoveries` with unique `recipe_id`, `cookingFailedCombinations` with primary key `(user_id, combo_hash)`, and `legacyCookingRefund(foods)` returning farm/fishing aggregates.
- SQL migration cancels legacy food listings, consumes unclaimed legacy-food inbox rows, refunds active legacy cooking buy-order escrow, clears legacy inventory/active buffs, refunds 50% aggregate ingredients, writes `cooking.v2`, and is safe to rerun.

- [ ] **Step 1: Write failing pure recall tests covering quality variants, rare variants, aggregate-before-floor rounding, inventory plus escrow totals, and invalid IDs.**
- [ ] **Step 2: Run the pure tests and confirm missing-module failures.**
- [ ] **Step 3: Implement a server-only frozen legacy recipe cost map and refund calculator.**
- [ ] **Step 4: Add Drizzle tables and the idempotent SQL data migration with a `legacyRecallVersion: 1` marker.**
- [ ] **Step 5: Add a PostgreSQL integration test that seeds inventory, active listings, unclaimed inbox food, buy-order escrow, active buff, farm, fishing, and old cooking state; execute the migration twice; assert identical second-run rows and exact 50% totals.**
- [ ] **Step 6: Run `npm test -- src/lib/server/cooking/legacyRecall.test.ts src/db/cookingLegacyRecallMigration.test.ts` and `npm run check-migrations`.**
- [ ] **Step 7: Commit `feat: recall legacy cooking inventory`.**

### Task 4: Research, craft, processing, specialty, and discovery API

**Files:**
- Create: `src/lib/server/cooking/research.ts`
- Create: `src/lib/server/cooking/research.test.ts`
- Rewrite: `src/app/api/v2/cooking/route.ts`
- Rewrite: `src/app/api/v2/cooking/route.test.ts`
- Modify: `src/lib/server/serverFeed.ts`

**Interfaces:**
- GET returns personal state, ingredients, known-recipe details, public server-first records, food inventory, requests, job bonuses, and processing recipes without any undiscovered combination.
- POST actions are `research`, `craft`, `buy_pantry`, `process`, `choose_specialty`, `favorite`, `deliver`, and `standing_delivery`.

- [ ] **Step 1: Write failing pure research tests for success, failure, duplicate-failure precheck, level/method/slot validation, one-of-each research consumption, and first-discovery reward flags.**
- [ ] **Step 2: Run the tests and verify expected failures.**
- [ ] **Step 3: Implement the pure transition helpers and explicit error codes.**
- [ ] **Step 4: Write failing route tests for unauthorized access, secret-free GET, atomic server-first insert, failed-combination persistence, permanent specialty, processing costs, and transactional material/food updates.**
- [ ] **Step 5: Rewrite the route around the tested helpers and DB transactions; emit a server feed only for the winning first-discovery transaction.**
- [ ] **Step 6: Run route tests, secret scans, and TypeScript.**
- [ ] **Step 7: Commit `feat: add cooking research api`.**

### Task 5: Condition-score delivery and inventory/marketplace compatibility

**Files:**
- Create: `src/adventure/v2/cooking/delivery.ts`
- Create: `src/adventure/v2/cooking/delivery.test.ts`
- Modify: `src/app/api/v2/cooking/route.ts`
- Modify: `src/app/api/v2/me/use-cooking-food/route.ts`
- Modify: `src/app/api/v2/me/use-cooking-food/route.test.ts`
- Modify: `src/lib/server/marketplaceV2Fulfillment.ts`
- Modify: `src/lib/server/marketplaceEscrow.ts`
- Modify: `src/app/api/marketplace/inbox/claim/route.ts`
- Modify: `src/app/api/v2/marketplace/list/route.ts`
- Modify: affected marketplace tests

**Interfaces:**
- Produces deterministic `cookingRequests(userId, state)`, `cookingDeliveryScore(food, request)`, `applyCookingDelivery`, and generic standing-delivery rewards.
- Marketplace and inbox accept only v2 food IDs after migration; originator and specialty snapshots survive listing, purchase, cancellation, expiration, and claim.

- [ ] **Step 1: Write failing delivery tests for three daily requests, one weekly feast, condition eligibility, 100/125/160 quality scores, multiple-food accumulation, completion-once rewards, and daily limits.**
- [ ] **Step 2: Implement deterministic requests and score/reward transitions.**
- [ ] **Step 3: Update food consumption so every food resets/replaces the active buff to exactly 12 hours.**
- [ ] **Step 4: Update marketplace boundaries and add round-trip tests for originator/specialty food IDs.**
- [ ] **Step 5: Run cooking, inventory, marketplace, inbox, and food-use tests.**
- [ ] **Step 6: Commit `feat: add cooking condition deliveries`.**

### Task 6: Five-tab opaque cooking UI and manual

**Files:**
- Rewrite: `src/adventure/v2/CookingPanel.tsx`
- Create: `src/adventure/v2/cooking/CookingResearchPanel.tsx`
- Create: `src/adventure/v2/cooking/CookingCodexPanel.tsx`
- Create: `src/adventure/v2/cooking/CookingSpecialtyPanel.tsx`
- Create: `src/adventure/v2/cooking/CookingDeliveryPanel.tsx`
- Create: `src/adventure/v2/cooking/CookingProcessingPanel.tsx`
- Rewrite: `src/adventure/v2/CookingPanel.test.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.tsx`
- Modify: `src/adventure/v2/marketplace/MarketplaceRareMapTab.tsx`
- Modify: `src/adventure/v2/V2CharacterCard.tsx`
- Modify: `src/app/manual/content/pastimes.tsx`

**Interfaces:**
- The orchestrator owns fetch/mutation/notification state; each tab receives serializable `CookingResponse` subsets and action callbacks.
- Research UI sends unordered ingredient IDs and method only; known recipe cards show exact craft costs after discovery.

- [ ] **Step 1: Write failing rendering tests for the five tabs, no hidden answers in initial markup, duplicate-failure message, permanent-specialty confirmation, condition score preview, and 12-hour food copy.**
- [ ] **Step 2: Implement the small tab components using only opaque surface constants and no container-wide locked opacity.**
- [ ] **Step 3: Update inventory, marketplace, active-buff text, and manual for v2 effects and snapshots.**
- [ ] **Step 4: Run component tests in light/dark class contexts and focused accessibility assertions.**
- [ ] **Step 5: Commit `feat: redesign cooking research ui`.**

### Task 7: New recipe art, integrity checks, and release verification

**Files:**
- Create: `public/images/items/cooking/<55-new-recipe-ids>.webp`
- Modify only if necessary: `scripts/check-images.mjs`
- Modify: cooking catalog/image integrity tests

**Interfaces:**
- Every public recipe ID resolves to one checked WebP image and no generated PNG remains.

- [ ] **Step 1: Generate one square, text-free, transparent or clean-background food item illustration per new recipe ID in the existing warm painterly RPG inventory style using the built-in image generation tool.**
- [ ] **Step 2: Move generated PNGs into `public/images/items/cooking/<id>.png` without overwriting the 45 retained assets.**
- [ ] **Step 3: Run `npm run optimize-images` and verify all 55 PNGs became max-256px WebP files.**
- [ ] **Step 4: Run `npm run check-images` and the 100-recipe catalog integrity test.**
- [ ] **Step 5: Run the full verification set: `npm test`, `npx tsc --noEmit`, `npx eslint` on changed source files, `npm run check-migrations`, `npm run check-module-budgets`, `npm run check-images`, and `npm run build`.**
- [ ] **Step 6: Inspect `git diff --check`, `git status --short`, and the final diff for leaked combinations in client-importable files.**
- [ ] **Step 7: Commit `feat: overhaul cooking research and specialties`.**
