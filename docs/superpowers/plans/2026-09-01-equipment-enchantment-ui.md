# Equipment Enchantment UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 장비 해방의 사용자 노출 명칭과 작업 흐름을 마법부여 중심 UI로 정리하고, 긴 장비 목록과 확률 정보를 모달로 분리하며 재마법부여를 즉시 실행한다.

**Architecture:** 서버 API, 저장 필드, URL 모드의 `liberation` 식별자는 호환성을 위해 유지한다. 클라이언트 표시 모델에서 내부 rank 3/2/1을 사용자 단계 1/2/3으로 변환하고, 메인 패널은 선택 장비와 옵션에 집중하며 장비 선택·도움말·최초 확인은 접근 가능한 별도 다이얼로그로 분리한다.

**Tech Stack:** Next.js 16 Client Components, React 19, TypeScript, Tailwind CSS 4, Phosphor Icons, Vitest, Testing Library

## Global Constraints

- 사용자가 보는 `해방`/`재해방` 문구는 `마법부여`/`재마법부여`로 변경한다.
- API 경로, 데이터 필드, 내부 타입과 모드 키의 `liberation` 명칭은 변경하지 않는다.
- 첫 마법부여에서만 귀속과 옵션 줄 수 영구 고정을 확인한다.
- 재마법부여 버튼은 별도 확인창 없이 즉시 요청하고, 현재 옵션 소멸 경고는 버튼 가까이에 상시 표시한다.
- 단계별 레벨 분포, 승급 확률, 옵션 출현 확률은 `?` 도움말 다이얼로그 안에서만 제공한다.
- 옵션은 불투명한 표면과 절제된 보석색 강조를 사용하고, 성공 직후 기존 `ui-result-highlight` 1회 애니메이션만 적용한다.
- 라이트·다크 모드 표면은 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`를 사용한다.
- 배포하지 않는다.

---

### Task 1: 마법부여 표시 모델과 대장간 탭 문구

**Files:**
- Modify: `src/adventure/v2/liberation/equipmentLiberationViewModel.ts`
- Modify: `src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts`
- Modify: `src/adventure/v2/V2EnhanceView.tsx`
- Modify: `src/adventure/v2/V2EnhanceView.test.tsx`

**Interfaces:**
- Produces: `enchantmentStage(rank: LiberationRank): 1 | 2 | 3`
- Produces: `liberationRankLevelSummary(rank)` returning `마법부여 N단계 · Lv.x~y`
- Consumes: existing internal `LiberationRank` and `liberation` forge mode key

- [x] **Step 1: Write failing display-model and tab tests**

```ts
expect(enchantmentStage(3)).toBe(1);
expect(enchantmentStage(2)).toBe(2);
expect(enchantmentStage(1)).toBe(3);
expect(liberationRankLevelSummary(3)).toContain("마법부여 1단계");
expect(smithyForgeTabs(true)).toContainEqual({ key: "liberation", label: "마법부여" });
```

- [x] **Step 2: Run tests and verify RED**

Run: `npm test -- src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts src/adventure/v2/V2EnhanceView.test.tsx`

Expected: FAIL because `enchantmentStage` does not exist and the tab still says `해방`.

- [x] **Step 3: Implement the stage mapping and visible tab label**

```ts
export function enchantmentStage(rank: LiberationRank): 1 | 2 | 3 {
  return rank === 3 ? 1 : rank === 2 ? 2 : 3;
}
```

Use this mapping in the level summary strings while leaving the internal mode key unchanged.

- [x] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts src/adventure/v2/V2EnhanceView.test.tsx`

Expected: PASS.

### Task 2: 장비 선택·도움말·최초 확인 다이얼로그

**Files:**
- Create: `src/adventure/v2/liberation/EquipmentEnchantmentDialogs.tsx`
- Modify: `src/adventure/v2/liberation/EquipmentLiberationPanel.tsx`
- Modify: `src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

**Interfaces:**
- Produces: `EquipmentSelectionDialog` with candidates, selected iid, busy state, `onSelect`, and `onClose`
- Produces: `EquipmentEnchantmentGuideDialog` with option probability rows and `onClose`
- Produces: `InitialEnchantmentConfirmDialog` with item name, cost, busy state, `onConfirm`, and `onClose`
- Consumes: `LiberationCandidateRow`, `LiberationOptionProbabilityRow`, line-count and rank distribution view-model functions

- [x] **Step 1: Write failing interaction tests**

```tsx
expect(screen.queryByRole("listbox", { name: "마법부여 대상 장비" })).toBeNull();
fireEvent.click(screen.getByRole("button", { name: "장비 선택" }));
expect(screen.getByRole("dialog", { name: "마법부여 장비 선택" })).toBeTruthy();

fireEvent.click(screen.getByRole("button", { name: "마법부여 도움말" }));
expect(screen.getByRole("dialog", { name: "마법부여 도움말" })).toBeTruthy();
expect(screen.getByText(/2·3번째 줄은 이미 선택된 옵션을 제외/)).toBeTruthy();
```

Also assert that the first action opens `최초 마법부여 확인`, while probability tables are absent from the main panel.

- [x] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

Expected: FAIL because the list and probability details are still inline and the requested dialogs do not exist.

- [x] **Step 3: Implement accessible dialog components**

Each dialog must use `useEscapeKey`, `useModalA11y`, an opaque surface token, a labelled `role="dialog"`, backdrop close where safe, and an explicit close button. The equipment dialog includes a name search input and closes after selection. The guide groups first-roll line counts, stage level/promotion information, and option probabilities.

- [x] **Step 4: Replace the two-column panel with the focused workbench**

The main card shows a compact selected-equipment header with `장비 선택` and `마법부여 도움말` controls. It omits inline candidate and probability lists. The initial action opens the confirmation dialog containing both permanent consequences.

- [x] **Step 5: Run the component test and verify GREEN**

Run: `npm test -- src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

Expected: PASS.

### Task 3: 즉시 재마법부여와 옵션 강조

**Files:**
- Modify: `src/adventure/v2/liberation/EquipmentLiberationPanel.tsx`
- Modify: `src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

**Interfaces:**
- Consumes: existing `submit()` request-id reuse and stale-state recovery behavior
- Produces: reroll button that directly calls `submit()` and successful option list keyed by returned revision with `ui-result-highlight`

- [x] **Step 1: Write failing reroll behavior tests**

```tsx
fireEvent.click(screen.getByRole("button", { name: "재마법부여" }));
expect(screen.queryByRole("dialog", { name: /재마법부여 확인/ })).toBeNull();
await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
```

Keep the network retry test, but retry by pressing the direct action once per attempt. Assert the successful status uses `마법부여` terminology.

- [x] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

Expected: FAIL because rerolls still open the confirmation dialog and visible messages still use `재해방`.

- [x] **Step 3: Implement direct rerolls and restrained highlighting**

For unenchanted items, open `InitialEnchantmentConfirmDialog`. For enchanted items, call `submit()` directly. Render each option as its own `SURFACE_INSET` row with a violet `Sparkle` icon, strong option value text, and a compact level badge. After success, key the option list by returned revision and apply `ui-result-highlight` once; do not introduce another result screen or blocking acknowledgement.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts src/adventure/v2/V2EnhanceView.test.tsx`

Expected: PASS.

### Task 4: 완료 검증과 커밋

**Files:**
- Verify all modified files above

**Interfaces:**
- Produces: tested local commit; no deployment or push

- [x] **Step 1: Run TypeScript and lint checks**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/liberation/EquipmentLiberationPanel.tsx src/adventure/v2/liberation/EquipmentEnchantmentDialogs.tsx src/adventure/v2/liberation/equipmentLiberationViewModel.ts src/adventure/v2/V2EnhanceView.tsx src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts src/adventure/v2/V2EnhanceView.test.tsx`

Expected: both exit 0.

- [x] **Step 2: Review the diff and run the focused suite again**

Run: `git diff --check`

Run: `npm test -- src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts src/adventure/v2/V2EnhanceView.test.tsx`

Expected: no whitespace errors and all tests pass.

- [x] **Step 3: Commit the local change**

```bash
git add docs/superpowers/plans/2026-09-01-equipment-enchantment-ui.md \
  src/adventure/v2/liberation/EquipmentEnchantmentDialogs.tsx \
  src/adventure/v2/liberation/EquipmentLiberationPanel.tsx \
  src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx \
  src/adventure/v2/liberation/equipmentLiberationViewModel.ts \
  src/adventure/v2/liberation/equipmentLiberationViewModel.test.ts \
  src/adventure/v2/V2EnhanceView.tsx \
  src/adventure/v2/V2EnhanceView.test.tsx
git commit -m "feat: redesign equipment enchantment workbench"
```
