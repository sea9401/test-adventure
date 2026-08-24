# Compact Inventory Implementation Plan

> **For Codex:** Preserve all existing equipment actions and the user's in-progress inventory changes while implementing this plan.

**Goal:** Show all six equipped slots and the first owned-equipment rows together on a mobile viewport without shrinking touch targets or changing inventory rules.

**Architecture:** Extract the currently inline equipped area into a presentational 3-by-2/6-by-1 summary grid that opens the existing detail card. Reduce only duplicated controls, fixed heights, and secondary text in the owned equipment grid; leave mutation handlers and server contracts in `V2InventoryView` intact.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind utilities, existing inventory models and UI surfaces.

---

### Task 1: Extract and test the equipped summary grid

**Files:**
- Create: `src/adventure/v2/inventory/EquippedItemSummaryGrid.tsx`
- Create: `src/adventure/v2/inventory/EquippedItemSummaryGrid.test.tsx`

1. Write failing tests that render six slots, empty and equipped names, enhancement values, long-name truncation, the 3-column/6-column responsive classes, and one whole-slot detail button.
2. Confirm there is no inline `해제` button and that clicking an occupied slot calls `onOpen` with the correct instance and anchor.
3. Implement the grid with `SURFACE_INSET`, an opaque parent surface, 44px minimum controls, semantic labels, and fixed compact slot heights.

### Task 2: Integrate without disturbing existing inventory work

**Files:**
- Modify: `src/adventure/v2/V2InventoryView.tsx`
- Test: `src/adventure/v2/V2InventoryView.test.tsx`

1. Replace only the existing `장착 중` JSX block with `EquippedItemSummaryGrid` and continue opening the existing `V2ItemCard` state.
2. Remove no mutation code: detail-card unequip, compare, lock, sale protection, and codex registration remain connected as before.
3. If combat-power/set summary values are already present in component state, pass them through; otherwise omit the summary row without adding a request.

### Task 3: Densify owned equipment cards

**Files:**
- Modify: `src/adventure/v2/inventory/EquipmentCardGrid.tsx`
- Modify: `src/adventure/v2/inventory/EquipmentCardGrid.test.tsx`

1. Add assertions for a two-column mobile grid, minimum 44px card controls, one-line names, and preserved rarity/enhancement/lock/selection indicators.
2. Remove the oversized minimum height and redundant secondary labels while keeping core stats and important badges.
3. Keep all existing click/selection callbacks and disabled rules unchanged.

### Task 4: Verify and commit this slice

1. Run the equipped summary, equipment grid, inventory view, sale, lock, compare, and codex-related focused tests.
2. Check a 320px-class layout for horizontal overflow from six slots or long Korean names.
3. Stage only the new grid and the exact inventory hunks belonging to this UX change; do not stage the user's other dirty inventory work.
