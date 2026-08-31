# Cultivation Reset Level One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every cultivation reset return the character to level 1 without creating reusable growth redistribution points, with explicit confirmation messaging.

**Architecture:** Keep `resetCultivation` as the shared proficiency reset boundary, but make it discard `grown` and `growthRespecPoints`. Each transactional API atomically persists `level: 1` and `exp: 0`; the two entry-point UIs warn before triggering those APIs.

**Tech Stack:** TypeScript, React, Next.js App Router route handlers, Vitest.

## Global Constraints

- Do not deploy or push.
- Preserve cultivation mastery refunds and history.
- Reset level growth and pending redistribution without carrying points into the next life.
- Use failing behavior tests before production changes.

---

### Task 1: Shared cultivation reset semantics

**Files:**
- Modify: `src/adventure/data/v2/proficiency.test.ts`
- Modify: `src/adventure/data/v2/proficiency.ts`

**Interfaces:**
- Consumes: `resetCultivation(p: V2ProficiencyState)`.
- Produces: reset proficiency with empty `caps`, empty `grown`, and `growthRespecPoints: 0` while refunding `cultivationPointsSpent`; parsed legacy pending points also normalize to 0 and cultivation never redistributes them.

- [ ] Change the existing reset test to expect discarded growth and pending redistribution.
- [ ] Run the focused test and verify it fails because the old implementation preserves 11 points.
- [ ] Change `resetCultivation` to store `growthRespecPoints: 0`.
- [ ] Change parsing and cultivation application tests to reject legacy redistribution, then remove its active calculation.
- [ ] Run the focused test and verify it passes.

### Task 2: Atomic character level reset in both APIs

**Files:**
- Modify: `src/app/api/v2/me/cultivate/reset/route.test.ts`
- Modify: `src/app/api/v2/me/cultivate/reset/route.ts`
- Modify: `src/app/api/v2/me/use-cash-item/route.test.ts`
- Modify: `src/app/api/v2/me/use-cash-item/route.ts`

**Interfaces:**
- Produces: successful reset response containing `level: 1`, `exp: 0`, and `growthRespecPoints: 0`.

- [ ] Add route assertions for persisted and returned level/experience and cleared redistribution.
- [ ] Run both route test files and verify the old routes fail those assertions.
- [ ] Update both transactions to atomically save `level: 1` and `exp: 0` with their existing currency/item changes.
- [ ] Return the new level and experience values and run both route tests green.

### Task 3: User-facing warning and completion copy

**Files:**
- Modify: `src/adventure/v2/V2CultivationView.tsx`
- Modify: `src/adventure/v2/V2InventoryView.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.tsx`
- Modify: `src/adventure/v2/V2InventoryView.test.tsx`
- Modify: `src/adventure/v2/CultivationActions.test.tsx`
- Modify: `src/adventure/v2/CultivationActions.tsx`
- Modify: `src/adventure/data/v2/museunCashItems.ts`
- Modify: `src/adventure/data/v2/museunCashItems.test.ts`

**Interfaces:**
- `RareMapsTab` owns confirmation state for the reset potion and calls `onUseCashItem` only after confirmation.

- [ ] Add component/data expectations for level-reset warnings and update descriptions.
- [ ] Remove redistribution counters and messages from the cultivation view and completion formatter.
- [ ] Run the focused UI/data tests and verify they fail against the old immediate-use behavior or old copy.
- [ ] Add the reset potion confirmation panel, update the shrine confirmation, and update success/description copy.
- [ ] Run the focused UI/data tests green.

### Task 4: Verification and commit

**Files:**
- Verify all modified files.

- [ ] Run focused cultivation, route, inventory, and item-data tests.
- [ ] Run `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build`.
- [ ] Confirm `git diff --check` and a clean staged scope.
- [ ] Commit as one local feature commit without pushing or deploying.
