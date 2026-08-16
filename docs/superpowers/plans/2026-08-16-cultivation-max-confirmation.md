# Cultivation Max Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 반복 탭 중 일괄 수행 오조작을 막고 일괄 수행을 반드시 별도 확인 뒤 실행한다.

**Architecture:** `CultivationActions`가 확인창 열림 상태를 소유하며 첫 클릭과 실제
`onCultivateMax` 호출을 분리한다. 같은 파일의 `CultivationMaxConfirmDialog`가 기존 모달
접근성 패턴을 담당하고, 부모 화면은 모바일에서 요약과 버튼을 서로 다른 행에 배치한다.

**Tech Stack:** Next.js 16.2 Client Components, React 19, Tailwind CSS 4, Vitest

## Global Constraints

- 어떤 환경에도 배포하지 않는다.
- 장면 배경 위 모달에는 `SURFACE_CARD`와 `SURFACE_INSET` 불투명 표면을 사용한다.
- 서버 수행 로직과 밸런스 값은 변경하지 않는다.

---

### Task 1: 수행 액션 회귀 테스트와 확인창

**Files:**
- Modify: `src/adventure/v2/CultivationActions.test.tsx`
- Modify: `src/adventure/v2/CultivationActions.tsx`
- Modify: `src/adventure/v2/V2CultivationView.tsx`

**Interfaces:**
- Consumes: 기존 `CultivationActions` props와 `onCultivateMax: () => void`.
- Produces: `CultivationMaxConfirmDialog`와 확인 후에만 호출되는 기존 콜백 계약.

- [ ] **Step 1: 실패하는 회귀 테스트 작성**

  처리 중 정적 마크업에도 `수행`, `가능한 만큼 수행` 문구와 고정 그리드 클래스가
  남는지, 일괄 수행 버튼에 `aria-haspopup="dialog"`가 있는지 검증한다. 또한
  `CultivationMaxConfirmDialog`를 정적 렌더링해 `role="dialog"`, `aria-modal="true"`,
  `가능한 만큼 수행 확정`을 검증한다.

- [ ] **Step 2: 테스트 실패 확인**

  Run: `npm test -- src/adventure/v2/CultivationActions.test.tsx`

  Expected: 기존 구현은 처리 중 버튼 문구를 바꾸며 확인 모달을 내보내지 않아 실패한다.

- [ ] **Step 3: 최소 구현**

  `CultivationActions`에 `useState`를 추가해 일괄 수행 첫 클릭은 모달을 열고, 확정 시
  모달을 닫은 뒤 `onCultivateMax()`를 호출한다. 버튼 문구는 고정하고 `aria-busy`만
  상태로 노출한다. `CultivationMaxConfirmDialog`는 기존 `useEscapeKey`,
  `useModalA11y`, `SURFACE_CARD`, `SURFACE_INSET` 패턴을 그대로 사용한다.

  `V2CultivationView`의 수행 요약/액션 행은 모바일 `grid`, `sm:flex`로 바꾸고 액션
  컴포넌트는 `grid-cols-[minmax(0,1fr)_minmax(0,2fr)]`를 사용한다.

- [ ] **Step 4: 관련 검증 실행**

  Run: `npm test -- src/adventure/v2/CultivationActions.test.tsx`

  Expected: PASS.

  Run: `npx eslint src/adventure/v2/CultivationActions.tsx src/adventure/v2/CultivationActions.test.tsx src/adventure/v2/V2CultivationView.tsx`

  Expected: 오류와 경고 없이 종료.

  Run: `npx tsc --noEmit`

  Expected: 타입 오류 없이 종료.

- [ ] **Step 5: 커밋**

  ```bash
  git add docs/superpowers/specs/2026-08-16-cultivation-max-confirmation-design.md docs/superpowers/plans/2026-08-16-cultivation-max-confirmation.md src/adventure/v2/CultivationActions.tsx src/adventure/v2/CultivationActions.test.tsx src/adventure/v2/V2CultivationView.tsx
  git commit -m "fix: confirm max cultivation on mobile"
  ```
