# Pig Shipment Ranch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated pig shipment loop with one pig included at unlock, four compound feed for each post-shipment replacement, and pork usable in one level-50 cooking recipe.

**Architecture:** Extend the definition-driven ranch engine with per-cycle feed cost and a shipment mode while preserving the version-1 save shape. Unlocking the pigsty starts the included first pig, collecting performs shipment, and the existing feed route spends four feed only to bring in a replacement after shipment. Add one farm inventory item and one cooking recipe, then specialize the ranch card copy and controls for the shipment state.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router route handlers, Vitest, Tailwind CSS, Sharp image optimization.

## Global Constraints

- Do not deploy to any environment.
- Preserve existing dirty-worktree changes and unrelated untracked files.
- Read the installed Next.js route-handler and client-component documentation before editing route or client code.
- Use opaque `SURFACE_INSET` and `SURFACE_CARD` classes for ranch panels and nested cards.
- Image filenames must match the referenced identifiers, and `npm run check-images` must pass.
- Write a failing behavioral regression test before each production behavior change.

---

### Task 1: Ranch shipment state machine

**Files:**
- Modify: `src/adventure/v2/ranch.test.ts`
- Modify: `src/adventure/v2/ranch.ts`

**Interfaces:**
- Produces: `RanchAnimalId` including `pig`, `RanchProductItemId` including `pork`, `RanchPenId` including `pigsty-1`.
- Produces: `RanchPenDefinition.feedPerCycle: number` and `RanchPenDefinition.mode: "recurring" | "shipment"`.
- Produces: the existing `addRanchFeed`, `settleRanch`, and `collectRanchProducts` APIs with pig shipment behavior.

- [ ] **Step 1: Write failing shipment tests**

Add literal, behavior-level tests that unlock `pigsty-1` with its first pig included, require exactly four feed for post-shipment replacement, finish only at sixteen hours, yield `{ pork: 8 }` once, return the pen to empty after collection, reject replacement during fattening or while shipment waits, and migrate a save without the new pen to a locked empty pigsty.

- [ ] **Step 2: Run the ranch tests and verify RED**

Run: `npm test -- src/adventure/v2/ranch.test.ts --maxWorkers=1`

Expected: FAIL because `pigsty-1`, `pig`, `pork`, and shipment validation do not exist.

- [ ] **Step 3: Implement the minimal definition-driven shipment behavior**

Add the pig animal and pigsty definition with `cycleMs: 16 * HOUR`, `outputAmount: 8`, `feedCapacity: 4`, `feedPerCycle: 4`, `xpPerCycle: 16`, `requiredLevel: 50`, and `costReputation: 180`. Start the first shipment cycle on unlock, generalize settlement to subtract `completed * feedPerCycle`, enforce exact replacement feed and no restart before collection, and extend cycle and collection statistics with pig/pork fields.

- [ ] **Step 4: Run the ranch tests and verify GREEN**

Run: `npm test -- src/adventure/v2/ranch.test.ts --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit the ranch engine slice**

```bash
git add src/adventure/v2/ranch.test.ts src/adventure/v2/ranch.ts
git commit -m "feat: add pig shipment ranch cycle"
```

### Task 2: Farm inventory integration

**Files:**
- Modify: `src/adventure/v2/farm.test.ts`
- Modify: `src/adventure/v2/farm.ts`

**Interfaces:**
- Consumes: `collectRanchProducts()` returning `pork`.
- Produces: `FarmItemId` and `FARM_ITEMS` entry `pork` with `/images/items/farm/pork.webp`.
- Preserves: `feedFarmRanch()` and `collectFarmRanch()` signatures.

- [ ] **Step 1: Write failing farm integration tests**

Add a test that unlocks the pigsty with no feed charge, advances sixteen hours, collects eight pork into farm inventory, then spends four compound feed to bring in the next pig. Extend the identifier-matched asset assertion to pork.

- [ ] **Step 2: Run the farm tests and verify RED**

Run: `npm test -- src/adventure/v2/farm.test.ts --maxWorkers=1`

Expected: FAIL because `pork` is not a farm item and cannot be stored.

- [ ] **Step 3: Add pork to farm item data**

Add `pork` to `FarmItemId` and `FARM_ITEMS` with name `돼지고기`, icon `🥩`, and image `/images/items/farm/pork.webp`. Keep collection generic so the new item flows through the existing inventory loop.

- [ ] **Step 4: Run farm and ranch tests and verify GREEN**

Run: `npm test -- src/adventure/v2/farm.test.ts src/adventure/v2/ranch.test.ts --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit the farm integration slice**

```bash
git add src/adventure/v2/farm.test.ts src/adventure/v2/farm.ts
git commit -m "feat: store ranch pork in farm inventory"
```

### Task 3: Shipment-aware ranch UI

**Files:**
- Modify: `src/adventure/v2/FarmRanchPanel.test.tsx`
- Modify: `src/adventure/v2/FarmRanchPanel.tsx`

**Interfaces:**
- Consumes: `RanchPenDefinition.mode`, `feedPerCycle`, and the existing ranch callbacks.
- Produces: shipment-aware pigsty states while retaining the `FarmRanchPanel` prop contract.

- [ ] **Step 1: Write failing rendered-output tests**

Render a newly unlocked pigsty and assert `비육 중` with sixteen hours remaining. Render an empty post-shipment pigsty and assert `돼지우리`, `비어 있음`, and `사료 4개로 새 돼지 데려오기`. Render it after sixteen hours and assert `돼지고기 8개`, `출하 대기`, and the global `모두 수확·출하` button.

- [ ] **Step 2: Run the component tests and verify RED**

Run: `npm test -- src/adventure/v2/FarmRanchPanel.test.tsx --maxWorkers=1`

Expected: FAIL because the pig card and shipment copy do not render.

- [ ] **Step 3: Implement shipment-specific card presentation**

Extract a local pen-name helper for `닭장`, `외양간`, and `돼지우리`. For shipment pens, replace the quantity selector with one fixed replacement button that calls `onFeed(definition.id, definition.feedPerCycle)`, disable it unless the pen is empty after shipment and four feed are owned, and show `비육 중` or `출하 대기` state copy. Change the header description and global action label to include shipment.

- [ ] **Step 4: Run the UI tests and verify GREEN**

Run: `npm test -- src/adventure/v2/FarmRanchPanel.test.tsx --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit the UI slice**

```bash
git add src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/FarmRanchPanel.tsx
git commit -m "feat: add pig shipment ranch UI"
```

### Task 4: Pork cooking sink and image assets

**Files:**
- Modify: `src/adventure/v2/cooking.test.ts`
- Modify: `src/adventure/v2/cooking.ts`
- Create: `public/images/items/farm/pig.webp`
- Create: `public/images/items/farm/pork.webp`
- Create: `public/images/items/cooking/herb_roasted_pork.webp`

**Interfaces:**
- Consumes: `FarmItemId` value `pork`.
- Produces: cooking recipe ID `herb_roasted_pork`.

- [ ] **Step 1: Write a failing cooking recipe test**

Assert that `COOKING_RECIPE_BY_ID.get("herb_roasted_pork")` has required level 50, farm ingredients `{ pork: 8, onion: 8, herb: 6 }`, XP 130, and base stats `{ str: 15, vit: 8 }`. Assert the cooking search query `돼지고기` finds the recipe.

- [ ] **Step 2: Run the cooking tests and verify RED**

Run: `npm test -- src/adventure/v2/cooking.test.ts --maxWorkers=1`

Expected: FAIL because the recipe does not exist.

- [ ] **Step 3: Add the recipe and generated assets**

Add `허브 돼지고기 구이` to the level-50 recipe group with icon `🍖`, the tested ingredients/effects, and a concise ranch-themed description. Copy the generated pig and pork source images into their identifier-matched farm paths, chroma-key the generated roast image, then run the existing optimizer to emit WebP assets.

- [ ] **Step 4: Run cooking and image checks and verify GREEN**

Run: `npm test -- src/adventure/v2/cooking.test.ts --maxWorkers=1`

Run: `npm run check-images`

Expected: both PASS with no missing references or orphan warnings for the three new assets.

- [ ] **Step 5: Commit the content slice**

```bash
git add src/adventure/v2/cooking.test.ts src/adventure/v2/cooking.ts public/images/items/farm/pig.webp public/images/items/farm/pork.webp public/images/items/cooking/herb_roasted_pork.webp
git commit -m "feat: add pork cooking content"
```

### Task 5: Cross-layer verification

**Files:**
- Modify only if verification exposes a feature regression.

**Interfaces:**
- Consumes all preceding task outputs.

- [ ] **Step 1: Run focused regression tests**

Run: `npm test -- src/adventure/v2/ranch.test.ts src/adventure/v2/farm.test.ts src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/cooking.test.ts --maxWorkers=1`

Expected: PASS.

- [ ] **Step 2: Run static and asset verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/ranch.ts src/adventure/v2/ranch.test.ts src/adventure/v2/farm.ts src/adventure/v2/farm.test.ts src/adventure/v2/FarmRanchPanel.tsx src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/cooking.ts src/adventure/v2/cooking.test.ts`

Run: `npm run check-images`

Expected: all commands exit 0.

- [ ] **Step 3: Run the complete test suite with bounded workers**

Run: `npm test -- --maxWorkers=4`

Expected: all non-skipped suites pass.

- [ ] **Step 4: Review the diff for unrelated changes**

Run: `git status --short` and `git diff --check`.

Expected: only this feature, its docs/assets, and pre-existing user files are present; whitespace check is clean.

- [ ] **Step 5: Commit any verification-only correction**

If and only if Step 2 or 3 required a code correction, stage only that correction and commit it with a narrow `fix:` message. Do not stage `NUL`, `_workspace/`, or unrelated user changes.
