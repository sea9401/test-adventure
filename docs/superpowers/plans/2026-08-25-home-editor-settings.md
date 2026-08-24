# Home Editor Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈의 편집 버튼과 편집 동작을 제거하고 동일한 위젯·체크 항목 편집 기능을 환경설정으로 이동한다.

**Architecture:** 새 `AdventureHomeLayoutSettings`가 순서와 표시 여부 편집만 담당한다. `V2PreferencesView`가 기존 대시보드 공급자와 저장 API를 연결하고, 홈 그리드는 읽기 전용 렌더러로 단순화한다.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- 서버 API와 `AdventureHomePreferences` 저장 형식은 변경하지 않는다.
- 스태미나 위젯의 기본값은 숨김이다.
- 새 카드와 패널은 공용 `Card`와 `Inset` 표면을 사용한다.
- 배포는 수행하지 않는다.

---

### Task 1: 환경설정 홈 레이아웃 편집기

**Files:**
- Create: `src/adventure/v2/AdventureHomeLayoutSettings.tsx`
- Modify: `src/adventure/v2/V2PreferencesView.test.tsx`
- Modify: `src/adventure/v2/V2PreferencesView.tsx`

**Interfaces:**
- Consumes: `order`, `hidden`, `onOrderChange`, `onHiddenChange`, `onReset`
- Produces: `AdventureHomeLayoutSettings` 클라이언트 컴포넌트

- [ ] **Step 1: 환경설정 이동 동작의 실패 테스트 작성**

```tsx
expect(screen.getByRole("heading", { name: "홈 화면 구성" })).not.toBeNull();
fireEvent.click(screen.getByRole("button", { name: "스태미나 표시" }));
expect(updatePreferences).toHaveBeenCalledWith({ hiddenWidgetIds: [] });
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/v2/V2PreferencesView.test.tsx`
Expected: `홈 화면 구성`을 찾지 못해 FAIL

- [ ] **Step 3: 전용 편집기와 저장 연결 구현**

```tsx
<AdventureHomeLayoutSettings
  order={preferences.widgetOrder}
  hidden={preferences.hiddenWidgetIds}
  onOrderChange={(widgetOrder) => persistHomePreferences({ widgetOrder })}
  onHiddenChange={(hiddenWidgetIds) => persistHomePreferences({ hiddenWidgetIds })}
  onReset={() => persistHomePreferences({
    widgetOrder: [...DEFAULT_ADVENTURE_HOME_WIDGET_ORDER],
    hiddenWidgetIds: [...DEFAULT_ADVENTURE_HOME_HIDDEN_WIDGET_IDS],
  })}
/>
```

- [ ] **Step 4: 환경설정 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/V2PreferencesView.test.tsx`
Expected: PASS

### Task 2: 홈을 읽기 전용 배치로 단순화

**Files:**
- Modify: `src/adventure/v2/V2AdventureHome.test.tsx`
- Modify: `src/adventure/v2/V2AdventureHome.tsx`
- Modify: `src/adventure/v2/AdventureHomeWidgetGrid.test.tsx`
- Modify: `src/adventure/v2/AdventureHomeWidgetGrid.tsx`

**Interfaces:**
- Consumes: 저장된 `order`, `hidden`, `widgets`
- Produces: 편집 상태와 콜백이 없는 `AdventureHomeWidgetGrid`

- [ ] **Step 1: 홈 편집 UI 제거 실패 테스트 작성**

```tsx
expect(screen.queryByRole("button", { name: "홈 편집" })).toBeNull();
expect(screen.queryByRole("button", { name: "스태미나 숨기기" })).toBeNull();
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/v2/V2AdventureHome.test.tsx`
Expected: 기존 `홈 편집` 버튼 때문에 FAIL

- [ ] **Step 3: 홈 편집 상태·컨트롤·콜백 제거**

```tsx
<AdventureHomeWidgetGrid
  order={preferences.widgetOrder}
  hidden={preferences.hiddenWidgetIds}
  widgets={widgets}
/>
```

- [ ] **Step 4: 관련 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/V2AdventureHome.test.tsx src/adventure/v2/AdventureHomeWidgetGrid.test.tsx`
Expected: PASS

### Task 3: 전체 검증과 커밋

**Files:**
- Verify: all changed files

**Interfaces:**
- Consumes: Task 1과 Task 2의 완료 상태
- Produces: 검증된 기능 커밋

- [ ] **Step 1: 전체 테스트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS

- [ ] **Step 2: 정적 검증과 빌드 실행**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`
Run: `npx eslint <changed files>`
Run: `npm run build`
Expected: 모두 exit 0

- [ ] **Step 3: 변경 검토와 커밋**

```bash
git diff --check
git add docs/superpowers/specs/2026-08-25-home-editor-settings-design.md docs/superpowers/plans/2026-08-25-home-editor-settings.md src/adventure/v2
git commit -m "feat: move home editor to preferences"
```
