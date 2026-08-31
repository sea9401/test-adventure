# Equipment Lock Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add locked-first sorting and a locked-only inventory filter using the existing equipment lock state.

**Architecture:** Extend the shared pure equipment sorter with a locked-first mode, then let `V2InventoryView` own a current-slot locked-only toggle passed to `EquipmentTab`. `EquipmentTab` filters before pagination and supplies a filter-aware empty state to the existing card grid.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript, Vitest, Tailwind CSS

## Global Constraints

- Do not add a separate favorite persistence model; reuse `V2EquipInstance.locked`.
- Do not change equipment sale protection or any server behavior.
- Content wrappers and controls must keep opaque light/dark surfaces.
- Do not deploy.

---

### Task 1: Locked-first pure sorting

**Files:**
- Modify: `src/adventure/v2/v2ItemListShared.ts`
- Test: `src/adventure/v2/v2ItemListShared.test.ts`

**Interfaces:**
- Produces: `SortMode` accepts `"locked"`; `sortEquipInstances(list, "locked")` returns locked entries first and preserves default order within both groups.

- [x] **Step 1: Write the failing test**

Add a test with mixed locked and unlocked swords in non-default order. Assert the literal expected iid order has locked equipment first, default ordering inside both groups, and the input array is unchanged.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/adventure/v2/v2ItemListShared.test.ts`

Expected: FAIL because `"locked"` is not a supported sort mode and locked equipment is not prioritized.

- [x] **Step 3: Write minimal implementation**

Add `"locked"` to `SortMode`, add its label only to the inventory selector, and implement locked-first comparison as `(Number(b.locked === true) - Number(a.locked === true)) || compareEquipInstancesDefault(a, b)`. Keep marketplace `SORT_CYCLE` unchanged.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/adventure/v2/v2ItemListShared.test.ts`

Expected: PASS.

### Task 2: Locked-only inventory projection and UI

**Files:**
- Modify: `src/adventure/v2/V2InventoryView.tsx`
- Modify: `src/adventure/v2/inventory/EquipmentTab.tsx`
- Modify: `src/adventure/v2/inventory/EquipmentCardGrid.tsx`
- Test: `src/adventure/v2/inventory/EquipmentTab.test.tsx`

**Interfaces:**
- `EquipmentTab` consumes `lockedOnly: boolean` and `setLockedOnly: Dispatch<SetStateAction<boolean>>`.
- `EquipmentCardGrid` consumes optional `emptyState: { title: string; message: string }`.

- [x] **Step 1: Write the failing tests**

Render `EquipmentTab` with one locked and one unlocked sword and `lockedOnly={true}`. Assert only the locked card appears, the toggle says `잠금만 보기 (1)` with `aria-pressed="true"`, the locked-first sort option is present, and a zero-match render shows the lock-specific empty state while retaining the toggle.

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/adventure/v2/inventory/EquipmentTab.test.tsx`

Expected: FAIL because the controlled filter props and UI do not exist.

- [x] **Step 3: Write minimal implementation**

Own `lockedOnly` in `V2InventoryView`. In `EquipmentTab`, sort the complete slot list, filter locked entries when enabled, include the filter in the pagination reset key, render an opaque pressed-state toggle with its count, and pass the lock-specific empty-state copy to `EquipmentCardGrid`.

- [x] **Step 4: Run focused tests**

Run: `npm test -- src/adventure/v2/v2ItemListShared.test.ts src/adventure/v2/inventory/EquipmentTab.test.tsx src/adventure/v2/inventory/EquipmentCardGrid.test.tsx src/adventure/v2/V2InventoryView.test.tsx`

Expected: PASS.

- [x] **Step 5: Verify and commit**

Run `npx tsc --noEmit`, `npx eslint` on the changed source/test files, `npm run build`, inspect `git diff --check` and `git status --short`, then commit only the feature files and these design/plan documents with message `feat: filter inventory by locked equipment`.
