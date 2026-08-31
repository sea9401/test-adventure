# Cooking 500 Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand cooking from 120 to 500 recipes in 38 independently resumable ten-recipe batches while preserving every legacy answer and giving every new recipe a distinct balanced effect and individual artwork.

**Architecture:** Keep public recipe metadata and secret ingredient answers in separate numbered batch modules. Append only complete ten-recipe batches to the live catalog, derive new three-component effects from stable expansion indices, and validate IDs, answers, effects, unlocks, and assets at the catalog boundary. Commit each fully tested batch before starting the next so interruption never leaves a referenced asset missing.

**Tech Stack:** TypeScript, React 19, Next.js 16.2, Vitest, Sharp image optimization, built-in image generation

## Global Constraints

- Do not deploy, push, or create a pull request.
- Add exactly 380 hidden recipes so the final catalog contains 500 recipes: 160 T1, 120 T2, 60 T3, 30 T4, and 10 T5 additions.
- Preserve all existing 120 recipe IDs, order, answers, effects, first-discovery records, and save compatibility.
- New recipes must have unique IDs, unique `method + sorted ingredient set` answers, and exact effect objects not shared with any other recipe.
- Public client modules must not contain the server's secret ingredient arrays.
- Each batch contains exactly ten recipes and ten individually generated transparent images.
- A batch is committed only after its focused recipe tests and image checks pass.
- Do not add dependencies, database migrations, API response fields, or new cooking ingredients.

---

### Task 1: Add resumable expansion boundaries and effect validation

**Files:**
- Create: `src/adventure/v2/cooking/expansion/types.ts`
- Create: `src/adventure/v2/cooking/expansion/effects.ts`
- Create: `src/adventure/v2/cooking/expansion/index.ts`
- Create: `src/lib/server/cooking/expansion/index.ts`
- Modify: `src/adventure/v2/cooking/catalog.ts`
- Modify: `src/lib/server/cooking/recipes.ts`
- Test: `src/lib/server/cooking/recipes.test.ts`

**Interfaces:**
- Produces: `CookingExpansionRow`, `effectForCookingExpansion(tier, field, index)`, `COOKING_EXPANSION_ROWS`, `COOKING_EXPANSION_ANSWERS`
- Consumes: existing `CookingRecipePublic`, `CookingIngredientId`, `rowToRecipe`, and `canonicalCookingCombination`

- [ ] **Step 1: Write failing boundary tests**

Add assertions that expansion batch exports exist, initially contain no incomplete rows, normalize effects deterministically, and cause `validateCookingRecipeCatalog()` to report `duplicate_effect:<id>` when two expansion recipes are deliberately passed through the exported effect uniqueness helper with the same effect.

- [ ] **Step 2: Run the recipe test and verify RED**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts`

Expected: FAIL because the expansion exports and effect validator do not exist.

- [ ] **Step 3: Implement the expansion interfaces**

Define a public row as the existing public tuple plus explicit tier. Build expansion effects from three distinct effect components using stable `expansionIndex` input and tier-scaled budgets. Export a canonical effect serializer and reject exact duplicate effect objects. Keep the public expansion index empty until Batch 01 is complete.

- [ ] **Step 4: Run the recipe test and verify GREEN**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts`

Expected: PASS with the original 120 live recipes unchanged.

- [ ] **Step 5: Commit the foundation**

```bash
git add docs/superpowers/specs/2026-08-24-cooking-500-recipes-design.md docs/superpowers/plans/2026-08-24-cooking-500-recipes.md src/adventure/v2/cooking/expansion src/lib/server/cooking/expansion src/adventure/v2/cooking/catalog.ts src/lib/server/cooking/recipes.ts src/lib/server/cooking/recipes.test.ts
git commit -m "feat: prepare resumable cooking expansion"
```

### Task 2: Complete one ten-recipe batch

Repeat this task for batch numbers `01` through `38`. Replace `<NN>`, `<before>`, and `<after>` with the literal batch number and catalog counts. Batch 01 uses 120 and 130; every following batch adds ten.

**Files:**
- Create: `src/adventure/v2/cooking/expansion/batch<NN>.ts`
- Create: `src/lib/server/cooking/expansion/batch<NN>.ts`
- Modify: `src/adventure/v2/cooking/expansion/index.ts`
- Modify: `src/lib/server/cooking/expansion/index.ts`
- Modify: `src/lib/server/cooking/recipes.test.ts`
- Create then optimize: `public/images/items/cooking/<ten-recipe-ids>.png`
- Produce: `public/images/items/cooking/<ten-recipe-ids>.webp`

**Interfaces:**
- Public batch produces exactly ten `CookingExpansionRow` values.
- Server batch produces exactly ten `{ recipeId, ingredientIds }` values with matching IDs.
- Batch index order is permanent once committed and determines stable effect profiles.

- [ ] **Step 1: Author the ten-recipe batch test first**

Add a literal table containing all ten expected IDs, Korean names, fields, methods, tiers, and secret ingredient ID sets. Assert the live catalog length is `<after>`, each answer resolves regardless of ingredient order, each effect is non-empty and globally unique, and all ten expected WebP paths exist.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts`

Expected: FAIL with live catalog length `<before>` and missing batch IDs.

- [ ] **Step 3: Add matching public and server batch modules**

Create ten stable public rows and ten secret answer rows. Use only currently obtainable farm, fishing, pantry, and processed ingredient IDs. Match slots to tier: T1=2, T2=3, T3=4, T4/T5=5. Append both batch modules to their respective indexes in the same order.

- [ ] **Step 4: Run the test to reach the expected asset-only failure**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts`

Expected: FAIL only because the ten `/images/items/cooking/<id>.webp` assets are absent.

- [ ] **Step 5: Generate ten individual images with the built-in image tool**

For each recipe issue a separate generation call using this prompt shape, substituting the exact dish name and defining ingredients:

```text
Use case: stylized-concept
Asset type: square cooking item icon for a Korean fantasy adventure game
Primary request: one clearly readable serving of <dish name>, visibly featuring <core ingredients>
Style/medium: detailed hand-painted fantasy game inventory illustration matching the existing cooking icons
Composition/framing: centered single dish, close three-quarter view, generous transparent margin
Lighting/mood: warm appetizing studio light, polished but not photorealistic
Constraints: genuinely transparent background; no text; no letters; no border; no frame; no watermark; no extra dishes
```

Move each generated PNG into `public/images/items/cooking/<recipe-id>.png`, run `npm run optimize-images`, and retain the resulting ID-matched WebP.

- [ ] **Step 6: Verify and commit the complete batch**

Run:

```bash
npm test -- src/lib/server/cooking/recipes.test.ts
npm run check-images
```

Expected: both commands exit 0. Then commit only this batch's data, tests, and ten WebP files with `git commit -m "feat: add cooking expansion batch <NN>"`.

### Task 3: Extend codex milestones for the 500-recipe catalog

**Files:**
- Modify: `src/adventure/v2/cooking/catalog.ts`
- Test: `src/adventure/v2/cooking/state.test.ts`

**Interfaces:**
- Consumes: `COOKING_CODEX_MILESTONES` and existing milestone claim state
- Produces: reachable goals at 150, 200, 300, 400, and 500 without changing existing milestone IDs

- [ ] **Step 1: Write the failing final milestone behavior test**

Construct a cooking state with 500 discovered IDs and assert the claimable milestone goals are exactly `[10, 25, 50, 75, 100, 150, 200, 300, 400, 500]`. Assert a 499-discovery state cannot claim 500.

- [ ] **Step 2: Run the state test and verify RED**

Run: `npm test -- src/adventure/v2/cooking/state.test.ts`

Expected: FAIL because the catalog stops at the 100 milestone.

- [ ] **Step 3: Add the five literal milestones**

Append goals 150, 200, 300, 400, and 500 with progressively higher points while leaving the five existing entries byte-for-byte unchanged.

- [ ] **Step 4: Run the state test and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking/state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit milestones**

```bash
git add src/adventure/v2/cooking/catalog.ts src/adventure/v2/cooking/state.test.ts
git commit -m "feat: extend cooking codex milestones"
```

### Task 4: Final 500-recipe verification

**Files:**
- Verify all files changed by Tasks 1-3

**Interfaces:**
- Consumes: the final 38 public batches, 38 server batches, and 380 WebP assets
- Produces: evidence that the complete catalog is compatible and production-buildable

- [ ] **Step 1: Run focused cooking tests**

Run: `npm test -- src/lib/server/cooking/recipes.test.ts src/lib/server/cooking/research.test.ts src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking/CookingCodexPanel.test.tsx src/adventure/v2/cooking/state.test.ts`

- [ ] **Step 2: Run the full verification suite**

Run each command and require exit 0:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run check-images
npm run build
```

- [ ] **Step 3: Confirm the resumable history and final tree**

Run `git status --short` and `git log --oneline --grep='cooking expansion batch'`. Require 38 batch commits, no uncommitted batch files, 500 live recipes, 500 unique IDs and answers, 380 unique expansion effects, and all referenced images present.
