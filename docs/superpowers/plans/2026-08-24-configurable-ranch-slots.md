# Configurable Ranch Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed five-pen ranch with ten sequentially unlocked slots whose animal type is selected at construction and can be changed by rebuilding an idle slot.

**Architecture:** Ranch persistence moves from version 1 fixed pen IDs to version 2 slot IDs, while the parser migrates existing saves without losing production progress or statistics. Domain functions own settlement, construction, and rebuild validation; farm wrappers make reputation and ranch mutations atomic, and thin route/hook/UI layers consume those operations.

**Tech Stack:** TypeScript, Next.js App Router route handlers, React, Vitest, Testing Library, Tailwind surface constants

## Global Constraints

- Do not change animal production amounts, cycle times, feed capacities, farming XP, feed recipes, or product items.
- Slots unlock sequentially with levels `1, 10, 20, 35, 50, 60, 70, 80, 90, 100` and costs `0, 30, 60, 120, 180, 1000, 2000, 4000, 8000, 16000` reputation.
- Animal minimum levels are chicken `1`, cow `20`, and pig `50`; construction includes the building cost and a pig starts with its first pig/feed state.
- Rebuild costs are chicken `500`, cow `1000`, and pig `2000` reputation and require zero feed, progress, ready items, and ready cycles.
- Version 1 saves map `coop-1`, `coop-2`, `cowshed-1`, `cowshed-2`, `pigsty-1` to `slot-1` through `slot-5` respectively, preserving all valid state and statistics.
- The endgame shop remains unlocked when slots 1-5 are open and continues displaying paid ranch progress as `4/4`.
- Use opaque `SURFACE_CARD` and `SURFACE_INSET` styles for ranch cards and controls; do not apply opacity to whole locked cards.
- Preserve unrelated working-tree changes, do not deploy, and do not push or create a PR.

---

### Task 1: Ranch Version 2 Domain and Migration

**Files:**
- Modify: `src/adventure/v2/ranch.ts`
- Test: `src/adventure/v2/ranch.test.ts`

**Interfaces:**
- Produces: `RanchSlotId`, `RanchSlotDefinition`, `RanchSlotState`, `RanchState` version 2, `RANCH_SLOT_DEFINITIONS`, `RANCH_ANIMAL_DEFINITIONS`, `RANCH_REBUILD_COSTS`, `isRanchSlotId()`, `isRanchAnimalId()`.
- Produces: `unlockRanchSlot(state, slotId, animalId, farmingLevel, now)`, `rebuildRanchSlot(state, slotId, animalId, farmingLevel, now)`, `ranchReadySlotCount(state)` plus slot-based settlement, feed, and collection functions.

- [ ] **Step 1: Replace fixed-pen tests with failing version 2 behavior tests**

Add focused tests that assert the exact slot table, default `slot-1` chicken state, sequential unlock validation, separate slot and animal level validation, construction pig feed `4`, arbitrary mixed-slot production, rebuild eligibility/cost metadata, and no mutation on rejected operations. Use fixed UTC timestamps so cycle boundaries remain deterministic.

```ts
expect(RANCH_SLOT_DEFINITIONS.map(({ requiredLevel, costReputation }) => [requiredLevel, costReputation])).toEqual([
  [1, 0], [10, 30], [20, 60], [35, 120], [50, 180],
  [60, 1000], [70, 2000], [80, 4000], [90, 8000], [100, 16000],
]);
expect(() => rebuildRanchSlot(state, "slot-2", "cow", 20, now)).toThrow("slot_not_empty");
```

- [ ] **Step 2: Add a failing version 1 migration test**

Build a complete version 1 payload with distinct values for each old pen and statistics. Assert `parseRanchState()` returns version 2, maps unlocked old pens to the specified animal types, maps locked old pens to `animalId: null`, preserves feed/timestamps/progress/ready state/stats, and adds locked slots 6-10.

- [ ] **Step 3: Run the ranch tests and confirm the red state**

Run: `npm test -- src/adventure/v2/ranch.test.ts`

Expected: FAIL because slot types/constants/functions and version 2 parsing do not exist.

- [ ] **Step 4: Implement the slot model and parser migration**

Define slot IDs and immutable slot metadata separately from animal production metadata. Implement `emptyRanchState()` with a free `slot-1` chicken and nine locked null-animal slots. Parse version 2 defensively and migrate version 1 through a local legacy pen map before normalizing with the target animal definition.

```ts
export type RanchSlotId = `slot-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;

export interface RanchSlotState {
  unlocked: boolean;
  animalId: RanchAnimalId | null;
  feed: number;
  lastSettledAt: string;
  progressMs: number;
  readyItems: number;
  readyCycles: number;
}

export interface RanchState {
  version: 2;
  slots: Record<RanchSlotId, RanchSlotState>;
  stats: RanchStats;
}
```

- [ ] **Step 5: Implement slot-aware production, construction, and rebuild**

Resolve production rules from each unlocked slot's `animalId`. Require the immediately preceding slot to be open before construction. Return the applicable construction/rebuild reputation cost from the domain result so the farm wrapper spends the same validated value. Rebuild only after settling to `now`, reject the same animal and non-empty states, reset timing/progress, and start pigs at feed `4`.

- [ ] **Step 6: Run ranch tests and commit**

Run: `npm test -- src/adventure/v2/ranch.test.ts`

Expected: PASS.

```bash
git add src/adventure/v2/ranch.ts src/adventure/v2/ranch.test.ts
git commit -m "feat: add configurable ranch slot domain"
```

### Task 2: Farm Transactions and Endgame Compatibility

**Files:**
- Modify: `src/adventure/v2/farm.ts`
- Test: `src/adventure/v2/farm.test.ts`
- Modify: `src/adventure/v2/farmEndgameShop.ts`
- Test: `src/adventure/v2/farmEndgameShop.test.ts`

**Interfaces:**
- Consumes: slot-based ranch domain functions from Task 1.
- Produces: `feedFarmRanch(state, slotId, amount, now)`, `buyFarmRanchSlot(state, slotId, animalId, now)`, `rebuildFarmRanchSlot(state, slotId, animalId, now)` and result objects containing `slotId`, `animalId`, and validated reputation cost.

- [ ] **Step 1: Write failing farm transaction tests**

Assert construction spends the slot cost once, rebuild spends the target animal cost once, failed level/order/empty-state checks leave reputation and ranch state unchanged, and pig construction/rebuild grants initial feed without consuming inventory feed.

```ts
const result = buyFarmRanchSlot(state, "slot-2", "cow", now);
expect(result.ranchUpgradeResult).toMatchObject({ slotId: "slot-2", animalId: "cow", costReputation: 30 });
expect(result.state.reputation).toBe(before - 30);
```

- [ ] **Step 2: Write a failing endgame compatibility test**

Create a version 2 farm with slots 1-5 open in any animal combination and slots 6-10 locked. Assert the endgame ranch requirement is complete and reports current/max `4/4`; also assert opening or rebuilding later slots does not alter the count.

- [ ] **Step 3: Run focused tests and confirm the red state**

Run: `npm test -- src/adventure/v2/farm.test.ts src/adventure/v2/farmEndgameShop.test.ts`

Expected: FAIL on old pen fields and missing slot transaction functions.

- [ ] **Step 4: Implement atomic farm wrappers and compatibility counting**

Settle through the domain function before applying its returned state. Check reputation before returning a new farm state, subtract only after every ranch validation succeeds, and update results to use `slotId`. Count paid endgame progress strictly from open slots 2-5.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- src/adventure/v2/farm.test.ts src/adventure/v2/farmEndgameShop.test.ts`

Expected: PASS.

```bash
git add src/adventure/v2/farm.ts src/adventure/v2/farm.test.ts src/adventure/v2/farmEndgameShop.ts src/adventure/v2/farmEndgameShop.test.ts
git commit -m "feat: add ranch slot farm transactions"
```

### Task 3: Ranch Route Contracts

**Files:**
- Modify: `src/app/api/v2/farm/ranch/feed/route.ts`
- Modify: `src/app/api/v2/farm/ranch/upgrade/route.ts`
- Create: `src/app/api/v2/farm/ranch/rebuild/route.ts`
- Modify: `src/lib/server/runtimeProfiler/routeClassifier.ts`
- Test: `src/lib/server/ranchRoutes.test.ts`

**Interfaces:**
- Consumes: farm transaction functions and `isRanchSlotId()` / `isRanchAnimalId()`.
- Produces: feed body `{ slotId, amount }`, upgrade body `{ slotId, animalId }`, rebuild body `{ slotId, animalId }`; successful JSON includes updated `farm` plus `ranchFeedResult`, `ranchUpgradeResult`, or `ranchRebuildResult`.

- [ ] **Step 1: Update route tests to the slot contract and add rebuild failures**

Test malformed slot/animal IDs as `400`, construction and rebuild success, insufficient reputation, production-in-progress rebuild rejection, and repeated request behavior. Assert mocked persistence receives no save on validation errors and exactly one save on success.

- [ ] **Step 2: Run route tests and confirm the red state**

Run: `npm test -- src/lib/server/ranchRoutes.test.ts`

Expected: FAIL because routes still accept `penId` and rebuild is missing.

- [ ] **Step 3: Implement route parsing and the rebuild endpoint**

Use the existing authenticated farm transaction/save pattern. Validate both identifiers before entering the transaction, invoke the matching wrapper inside it, and map the domain's existing typed errors through the shared farm error response behavior.

- [ ] **Step 4: Register the rebuild profiler route and run tests**

Add `/api/v2/farm/ranch/rebuild` next to the other farm mutation routes.

Run: `npm test -- src/lib/server/ranchRoutes.test.ts src/lib/server/runtimeProfiler/routeClassifier.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the route slice**

```bash
git add src/app/api/v2/farm/ranch src/lib/server/ranchRoutes.test.ts src/lib/server/runtimeProfiler/routeClassifier.ts
git commit -m "feat: expose ranch slot construction and rebuild routes"
```

### Task 4: Ranch Client State and Ten-Slot UI

**Files:**
- Modify: `src/adventure/v2/useFarm.ts`
- Modify: `src/adventure/v2/FarmRanchPanel.tsx`
- Test: `src/adventure/v2/FarmRanchPanel.test.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx`
- Test: `src/adventure/v2/AdventurerFarmPanel.test.tsx`

**Interfaces:**
- Consumes: slot/animal metadata and the three route contracts from Task 3.
- Produces from `useFarm`: `feedRanchSlot(slotId, amount)`, `buyRanchSlot(slotId, animalId)`, `rebuildRanchSlot(slotId, animalId)` plus `busyFeedSlotId`, `busyUpgradeSlotId`, `busyRebuildSlotId`.
- Produces from `FarmRanchPanel`: handlers using `(RanchSlotId, RanchAnimalId)` and a two-column ten-card layout.

- [ ] **Step 1: Write failing panel rendering and interaction tests**

Render a farm with a mixture of open and locked slots. Assert ten slot headings exist, only the next locked slot exposes three construction choices, animal choices show level reasons, later slots show sequential locking, and all unlocked slots display their selected animal production data.

- [ ] **Step 2: Write failing rebuild interaction tests**

Assert an idle slot offers only different animal types with exact target costs; confirming calls `onRebuild(slotId, animalId)`. Assert fed, partially progressed, or ready slots do not offer rebuild controls.

- [ ] **Step 3: Run UI tests and confirm the red state**

Run: `npm test -- src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: FAIL because components and hook still use fixed pens.

- [ ] **Step 4: Update `useFarm` request, busy, and notice state**

Replace pen IDs with slot IDs, pass animal IDs for construction, add the rebuild mutation, apply only server-returned farm state, and translate `slot_not_found`, `slot_not_empty`, `same_animal`, and `animal_level_required` into concise Korean notices.

- [ ] **Step 5: Build the ten-slot panel and wire the parent**

Use `RANCH_SLOT_DEFINITIONS` for card order and animal metadata for production details. Keep two columns, show open/max summary and next cost, use `SURFACE_CARD`/`SURFACE_INSET`, disable individual unavailable buttons with their level reason, and use confirmation dialogs that name the animal and cost for construction/rebuild.

- [ ] **Step 6: Run UI tests and commit**

Run: `npm test -- src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: PASS.

```bash
git add src/adventure/v2/useFarm.ts src/adventure/v2/FarmRanchPanel.tsx src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx
git commit -m "feat: add configurable ten-slot ranch interface"
```

### Task 5: Manual, Integration Cleanup, and Verification

**Files:**
- Modify: `src/app/manual/content/pastimes.tsx`
- Modify only if compiler/search reveals slot migration consumers: other ranch references under `src/`

**Interfaces:**
- Consumes: all prior task interfaces.
- Produces: user-facing documentation and a repository with no stale fixed-pen consumers outside the intentional version 1 migration parser/tests.

- [ ] **Step 1: Update the farming manual**

Document ten sequential ranch slots, selectable chicken/cow/pig buildings, the exact slot 6-10 costs, rebuild idle-state rule and `500/1000/2000` costs, and the compatible endgame requirement of slots 1-5 (`유료 축사 4/4`).

- [ ] **Step 2: Scan for stale fixed-pen consumers and correct them**

Run: `rg "RanchPen|RANCH_PEN|ranch\\.pens|coop-1|coop-2|cowshed-1|cowshed-2|pigsty-1" src`

Expected: matches remain only in explicit legacy migration declarations and migration tests. Convert every runtime/UI consumer to slot terminology.

- [ ] **Step 3: Run focused ranch and farm verification**

Run: `npm test -- src/adventure/v2/ranch.test.ts src/adventure/v2/farm.test.ts src/adventure/v2/farmEndgameShop.test.ts src/lib/server/ranchRoutes.test.ts src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx`

Expected: PASS.

- [ ] **Step 4: Run static checks**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/ranch.ts src/adventure/v2/ranch.test.ts src/adventure/v2/farm.ts src/adventure/v2/farm.test.ts src/adventure/v2/farmEndgameShop.ts src/adventure/v2/farmEndgameShop.test.ts src/app/api/v2/farm/ranch src/lib/server/ranchRoutes.test.ts src/lib/server/runtimeProfiler/routeClassifier.ts src/adventure/v2/useFarm.ts src/adventure/v2/FarmRanchPanel.tsx src/adventure/v2/FarmRanchPanel.test.tsx src/adventure/v2/AdventurerFarmPanel.tsx src/adventure/v2/AdventurerFarmPanel.test.tsx src/app/manual/content/pastimes.tsx`

Expected: both commands exit `0`.

- [ ] **Step 5: Run the complete test suite**

Run: `npm test`

Expected: all tests pass with no regressions.

- [ ] **Step 6: Review the final diff and commit documentation/cleanup**

Run: `git diff --check`

Run: `git status --short`

Confirm the two pre-existing ChatPanel modifications are not staged.

```bash
git add src/app/manual/content/pastimes.tsx
git commit -m "docs: explain configurable ranch slots"
```
