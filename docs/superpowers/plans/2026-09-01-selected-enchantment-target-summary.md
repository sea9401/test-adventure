# Selected Enchantment Target Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마법부여 작업대에서 현재 선택된 장비의 핵심 개체 정보를 실행 전까지 계속 보여준다.

**Architecture:** `EquipmentLiberationPanel`이 기존 `LiberationCandidateRow`의 파생 표시값과 공용 장비 배지를 사용해 읽기 전용 요약 카드를 렌더링한다. 기존 선택 상태가 바뀌면 별도 동기화 상태 없이 선택 후보로부터 카드가 즉시 갱신된다.

**Tech Stack:** Next.js 16 Client Components, React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library

## Global Constraints

- 서버 API, 마법부여 비용·확률·실행 동작은 변경하지 않는다.
- `SURFACE_INSET`과 기존 공용 장비 배지를 사용해 라이트·다크 모드 모두 불투명하게 표시한다.
- 장비 이름, 부위, 표시 티어, 강화, 장착 여부, 잠금 여부, 위력, 품질을 표시한다.
- 장비 선택 변경 시 요약 카드가 즉시 갱신되어야 한다.
- 배포하지 않는다.

---

### Task 1: 현재 선택 장비 요약 카드

**Files:**
- Modify: `src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`
- Modify: `src/adventure/v2/liberation/EquipmentLiberationPanel.tsx`

**Interfaces:**
- Consumes: `LiberationCandidateRow`의 `name`, `displayTier`, `effectivePower`, `qualityPct`, `isEquipped`, `item`
- Produces: `aria-labelledby="current-enchantment-target-title"`인 읽기 전용 현재 대상 요약 영역

- [x] **Step 1: 선택 전후 장비 요약을 검증하는 실패 테스트 작성**

```tsx
const summary = screen.getByRole("region", { name: "현재 선택 장비" });
expect(within(summary).getByRole("heading", { name: "재앙독 완갑" })).toBeTruthy();
expect(within(summary).getByText(/위력/)).toBeTruthy();
expect(within(summary).getByText(/품질/)).toBeTruthy();
expect(within(summary).getByText("장착 중")).toBeTruthy();

fireEvent.click(screen.getByRole("button", { name: /대상 장비 변경/ }));
fireEvent.click(screen.getByRole("option", { name: /빙호 갑주/ }));
expect(within(summary).getByRole("heading", { name: "빙호 갑주" })).toBeTruthy();
```

- [x] **Step 2: 테스트를 실행해 RED 확인**

Run: `npm test -- src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

Expected: `현재 선택 장비` region이 없어 실패한다.

- [x] **Step 3: 최소 요약 카드 구현**

`EquipmentLiberationPanel.tsx`에서 `ItemTypeChip`, `equipmentPowerDisplayValue`, 공용 티어·강화·품질 배지를 가져온다. 대상 변경 버튼 아래에 `SURFACE_INSET` 영역을 만들고 현재 선택 후보의 이름, 부위, 티어, 강화, 장착·잠금, 위력, 품질을 렌더링한다. 상단 장비명 heading은 요약 카드로 옮기고 작업대 상단 heading은 일반 작업대 제목으로 정리한다.

- [x] **Step 4: 컴포넌트 테스트를 실행해 GREEN 확인**

Run: `npm test -- src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

Expected: 모든 테스트가 통과한다.

- [x] **Step 5: 변경 파일 정적 검사와 전체 검증**

Run: `npx eslint src/adventure/v2/liberation/EquipmentLiberationPanel.tsx src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx`

Run: `npx tsc --noEmit`

Run: `npm test -- src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx src/adventure/v2/liberation/EquipmentEnchantmentPickerDialog.test.tsx`

Run: `npm run build`

Expected: 모든 명령이 종료 코드 0으로 끝난다.

- [x] **Step 6: 로컬 커밋**

```bash
git add docs/superpowers/specs/2026-09-01-selected-enchantment-target-summary-design.md \
  docs/superpowers/plans/2026-09-01-selected-enchantment-target-summary.md \
  src/adventure/v2/liberation/EquipmentLiberationPanel.tsx \
  src/adventure/v2/liberation/EquipmentLiberationPanel.test.tsx
git commit -m "feat: show selected enchantment target"
```
