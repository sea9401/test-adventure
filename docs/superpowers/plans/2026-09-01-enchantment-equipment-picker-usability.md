# Enchantment Equipment Picker Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the enchantment target picker prominent and turn its long list into a searchable, slot-filtered, sortable inventory-style card grid while moving reroll warnings into help.

**Architecture:** Extend the pure liberation view model with display metrics and deterministic filtering/sorting, then extract the interactive picker into its own client component. Keep the workbench responsible only for opening the picker and applying the selection; keep probability and destructive-reroll copy in the guide dialog.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Tailwind CSS, Vitest, Testing Library.

## Global Constraints

- Preserve existing staging-only unexplored content by working from `origin/staging`.
- Do not change enchantment costs, probability rules, API requests, or server behavior.
- Reuse `SURFACE_CARD`, `SURFACE_INSET`, and `SURFACE_ACCENT`; do not introduce translucent content cards.
- Preserve the initial-enchantment confirmation and the confirmation-free reroll request.
- Do not deploy without a separate explicit deployment request.

---

### Task 1: Candidate filtering and sorting view model

**Files:**
- Modify: `src/adventure/v2/liberation/equipmentLiberationViewModel.ts`
- Test: `src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts`

**Interfaces:**
- Produces: `EnchantmentEquipmentSlotFilter`, `EnchantmentEquipmentSortMode`, `ENCHANTMENT_EQUIPMENT_SLOT_TABS`, `enchantmentCandidateCounts(rows)`, and `filterAndSortLiberationCandidates(rows, controls)`.
- Extends: `LiberationCandidateRow` with `acquiredIndex`, `qualityPct`, `effectivePower`, and `stage`.

- [ ] **Step 1: Write failing view-model tests**

Add fixtures with two instances of the same equipment ID but different rolls and liberation stages. Assert:

```ts
expect(enchantmentCandidateCounts(rows)).toMatchObject({
  all: 4,
  weapon: 2,
  armor: 1,
  gloves: 1,
});
expect(filterAndSortLiberationCandidates(rows, {
  query: "빙호",
  slot: "armor",
  sort: "default",
}).map((row) => row.iid)).toEqual(["armor-equipped"]);
expect(filterAndSortLiberationCandidates(rows, {
  query: "",
  slot: "weapon",
  sort: "acquired",
}).map((row) => row.iid)).toEqual(["weapon-latest", "weapon-old"]);
expect(filterAndSortLiberationCandidates(rows, {
  query: "",
  slot: "all",
  sort: "enchantment",
}).map((row) => row.stage)).toEqual([3, 2, 1, 0]);
```

- [ ] **Step 2: Run the view-model test and confirm RED**

Run:

```bash
npx vitest run src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts
```

Expected: FAIL because the new exports and row metrics do not exist.

- [ ] **Step 3: Implement candidate metrics, counts, filtering, and stable sorting**

Add these public types and controls:

```ts
export type EnchantmentEquipmentSlotFilter = "all" | V2EquipSlot;
export type EnchantmentEquipmentSortMode =
  | "default"
  | "acquired"
  | "tier"
  | "roll"
  | "power"
  | "enchantment";

export const ENCHANTMENT_EQUIPMENT_SLOT_TABS = [
  { key: "all", label: "전체" },
  { key: "weapon", label: "무기" },
  { key: "armor", label: "갑옷" },
  { key: "gloves", label: "장갑" },
  { key: "boots", label: "신발" },
  { key: "ring", label: "반지" },
  { key: "necklace", label: "목걸이" },
] as const;
```

Build each row from the owned-array index, `rollQualityPct`, `effectiveStats` plus `powerWithBonuses`, and `enchantmentStage`. Apply the query and slot filters before sorting. Use a deterministic default comparator as the final tie-breaker for every sort mode.

- [ ] **Step 4: Run the view-model tests and confirm GREEN**

Run the Step 2 command and expect all tests to pass.

- [ ] **Step 5: Commit the view-model slice**

```bash
git add src/adventure/v2/liberation/equipmentLiberationViewModel.ts src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts
git commit -m "feat: model enchantment picker filters and sorting"
```

### Task 2: Inventory-style equipment picker dialog

**Files:**
- Create: `src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.tsx`
- Create: `src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.test.tsx`
- Modify: `src/adventure/v2/liberation/EquipmentEnchantmentDialogs.tsx`

**Interfaces:**
- Consumes: Task 1 candidate controls and `LiberationCandidateRow` display metrics.
- Produces: `EquipmentEnchantmentPickerDialog({ candidates, selectedIid, busy, onSelect, onClose })`.

- [ ] **Step 1: Write failing picker-dialog tests**

Render two instances with the same equipment ID and different rolls/liberation options. Assert that:

```ts
expect(screen.getByRole("tab", { name: /전체 3/ })).toBeTruthy();
expect(screen.getByRole("tab", { name: /장갑 2/ })).toBeTruthy();
expect(screen.getByRole("combobox", { name: "장비 정렬 기준" })).toBeTruthy();
expect(screen.getAllByText("재앙독 완갑")).toHaveLength(2);
expect(screen.getByText(/스킬 치명타 피해/)).toBeTruthy();
expect(screen.getByText(/기본 STR/)).toBeTruthy();
```

Click the armor tab and assert glove cards disappear. Change the sort to `enchantment` and assert the 3-stage card precedes unenchanted cards. Click a card and assert `onSelect(iid)` is called.

- [ ] **Step 2: Run the picker-dialog test and confirm RED**

```bash
npx vitest run src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the dedicated picker dialog**

Move the existing selection dialog behavior out of `EquipmentEnchantmentDialogs.tsx`. Add local `query`, `slot`, and `sort` state and derive rows with `filterAndSortLiberationCandidates`.

Use a sticky control area containing search, sort, and this accessible tab structure:

```tsx
<div role="tablist" aria-label="장비 부위">
  {ENCHANTMENT_EQUIPMENT_SLOT_TABS.map((tab) => (
    <button
      key={tab.key}
      type="button"
      role="tab"
      aria-selected={slot === tab.key}
      onClick={() => setSlot(tab.key)}
    >
      {tab.label} {counts[tab.key]}
    </button>
  ))}
</div>
```

Render cards as one column on mobile and two from `sm`. Each card must include slot icon, equipped/locked state, tier, enhancement, quality, effective power, base stat summary, stage/line count, and formatted liberation options. Use `role="option"` and `aria-selected`; clicking the full card calls `onSelect` directly.

- [ ] **Step 4: Run picker-dialog and existing panel tests**

```bash
npx vitest run src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.test.tsx src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx
```

Expected: PASS with no warnings.

- [ ] **Step 5: Commit the picker slice**

```bash
git add src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.tsx src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.test.tsx src/adventure/v2/liberation/EquipmentEnchantmentDialogs.tsx
git commit -m "feat: add inventory-style enchantment picker"
```

### Task 3: Prominent target action and reroll help copy

**Files:**
- Modify: `src/adventure/v2/liberation/EquipmentLiberationPanel.tsx`
- Modify: `src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`
- Modify: `src/adventure/v2/liberation/EquipmentEnchantmentDialogs.tsx`

**Interfaces:**
- Consumes: Task 2 `EquipmentEnchantmentPickerDialog`.
- Preserves: `submit()` request reuse, initial confirmation, and direct reroll behavior.

- [ ] **Step 1: Write failing panel behavior tests**

Change the selection test to assert a prominent button with candidate count:

```ts
expect(screen.getByRole("button", { name: /대상 장비 변경.*2개/ })).toBeTruthy();
```

Change the reroll-help test to assert the destructive copy is absent from the workbench before opening help, then present inside the guide:

```ts
expect(screen.queryByText(/현재 옵션 전체가 즉시 소멸/)).toBeNull();
fireEvent.click(screen.getByRole("button", { name: "마법부여 도움말" }));
expect(screen.getByText(/현재 옵션 전체가 즉시 소멸/)).toBeTruthy();
expect(screen.getByText(/별도 확인 없이 바로 진행/)).toBeTruthy();
```

Keep the existing assertion that clicking `재마법부여` performs one fetch without a dialog.

- [ ] **Step 2: Run the panel test and confirm RED**

```bash
npx vitest run src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx
```

Expected: FAIL because the old small button and inline rose warning still render.

- [ ] **Step 3: Implement the workbench and guide changes**

Replace the small action with a full-width opaque accent action under the title area. Include a selection icon, `대상 장비 변경`, and `${candidates.length}개 선택 가능` in the accessible name. Remove the inline reroll warning block.

Add a `재마법부여 안내` section to `EquipmentEnchantmentGuideDialog` containing the approved three sentences. Import and render `EquipmentEnchantmentPickerDialog` from its new file.

- [ ] **Step 4: Run all liberation UI tests and confirm GREEN**

```bash
npx vitest run src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.test.tsx src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit the workbench slice**

```bash
git add src/adventure/v2/liberation/EquipmentLiberationPanel.tsx src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx src/adventure/v2/liberation/EquipmentEnchantmentDialogs.tsx
git commit -m "ui: emphasize enchantment target selection"
```

### Task 4: Full verification and handoff

**Files:**
- Verify all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: completed picker, panel, guide, and view-model slices.
- Produces: a clean, committed local feature branch ready for an explicit test-server deployment request.

- [ ] **Step 1: Run focused regression tests**

```bash
npx vitest run src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.test.tsx src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts
```

- [ ] **Step 2: Run static verification**

```bash
npx tsc --noEmit
npx eslint src/adventure/v2/liberation/EquipmentLiberationPanel.tsx src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.tsx src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.test.tsx src/adventure/v2/liberation/EquipmentEnchantmentDialogs.tsx src/adventure/v2/liberation/equipmentLiberationViewModel.ts src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts
git diff --check origin/staging...HEAD
```

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

- [ ] **Step 4: Inspect final history and workspace**

```bash
git status --short --branch
git log --oneline --max-count=6
```

Expected: clean feature branch containing the design and implementation commits, with no deployment performed.
