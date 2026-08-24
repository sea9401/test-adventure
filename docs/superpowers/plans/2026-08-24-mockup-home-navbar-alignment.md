# Mockup Adventure Home and Navbar Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 데스크톱·모바일 목업의 상단 크롬, 캐릭터 요약과 오늘의 모험 체크 화면을 현재 개인화 기능 위에 정확히 적용한다.

**Architecture:** 기존 대시보드 API와 위젯 설정 계약은 유지하고 표현 컴포넌트만 재구성한다. `GameChrome`이 전역 자원을 `V2TopBar`에 전달하고, `V2AdventureHome`이 이미 조회한 캐릭터·장비·효과와 서버 시각을 두 홈 위젯에 전달한다. 각 컴포넌트의 DOM 구조와 반응형 클래스는 집중 렌더 테스트로 고정한다.

**Tech Stack:** Next.js 16 App Router, React 19 client components, Tailwind CSS 4, Phosphor Icons, Vitest, Testing Library

## Global Constraints

- 첨부된 `KakaoTalk_20260824_191809018.png`를 시각적 기준으로 사용한다.
- 상단 크롬은 최대 864px, 게임 본문은 기존 최대 720px 폭을 유지한다.
- 현재 여섯 탭, 드롭다운, 생활 상태, 위젯 편집, 활동 설정과 저장 계약을 유지한다.
- 카드와 목록은 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`의 불투명 표면을 사용한다.
- 기존 전투 결과 관련 미커밋 파일은 수정하지 않는다.
- 운영 배포, 푸시와 점검 모드 변경을 수행하지 않는다.

---

### Task 1: Mockup-Style Persistent Game Chrome

**Files:**
- Modify: `src/adventure/v2/V2TopBar.test.tsx`
- Modify: `src/adventure/v2/MainTabNav.test.tsx`
- Modify: `src/adventure/v2/V2TopBar.tsx`
- Modify: `src/adventure/v2/MainTabNav.tsx`
- Modify: `src/adventure/v2/GameChrome.tsx`

**Interfaces:**
- `V2TopBar` consumes `{ stamina: StaminaState; staminaMax: number; spendableGold: number }`.
- `MainTabNav` keeps its existing public props and menu data contract.
- `GameChrome` passes the existing game-state values without adding an API request.

- [ ] **Step 1: Write failing topbar and tab layout tests**

Change the topbar fixture to render `stamina={{ current: 86, lastUpdatedAt: 0 }}`, `staminaMax={120}` and `spendableGold={128450}`. Assert the markup contains the text brand, `86 / 120`, `128,450`, `max-w-[864px]`, a mobile-hidden gold chip and no 32px brand image. In the main-tab test assert `max-w-[864px]`, `flex-1`, the compact mobile font class and the existing actionable aria-label.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/MainTabNav.test.tsx
```

Expected: FAIL because `V2TopBar` still accepts gathering props and the nav still uses the 720px, large-label layout.

- [ ] **Step 3: Implement the compact two-row chrome**

Replace the icon brand and activity status in `V2TopBar` with the text home link and resource chips. Preserve `NotificationBell` and `V2SettingsMenu`, use an opaque surface, and hide the gold chip below `sm`. Pass `stamina`, `staminaMax` and `spendableGold` from `GameChrome`. Change `MainTabNav` to an equal-width 864px tab row with compact labels and caret icons while preserving dropdown logic, activity dots and life status rows.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/MainTabNav.test.ts
```

Expected: all chrome and menu tests PASS.

### Task 2: Rich Compact Character Summary

**Files:**
- Modify: `src/adventure/v2/CompactCharacterSummary.test.tsx`
- Modify: `src/adventure/v2/CompactCharacterSummary.tsx`
- Modify: `src/adventure/v2/V2AdventureHome.tsx`

**Interfaces:**
- Extend `CompactCharacterSummary` with `levelCap`, `rejobRequiredLevel`, `activePresetName`, `adventureSupport`, `activeFoodBuff`, `equipped` and `owned` props using the existing domain types.
- Keep `expanded`, `onExpandedChange` and `children` behavior unchanged.

- [ ] **Step 1: Write failing compact-card behavior tests**

Render a level 87 character with `exp=46`, `expToNext=100`, an active food, support pass, preset, six equipped IDs and owned instances. Assert the collapsed card contains `EXP`, all three state chips, six elements marked `data-compact-equipment-slot`, responsive portrait classes and the existing expand button. Retain the rerender assertion that expanded mode shows the full child card.

- [ ] **Step 2: Run the character test and verify RED**

Run:

```bash
npm test -- src/adventure/v2/CompactCharacterSummary.test.tsx
```

Expected: FAIL because the current compact card omits EXP, state chips and equipment slots.

- [ ] **Step 3: Implement the approved compact card**

Build the responsive portrait-and-bars header, optional status chips and six-slot equipment strip inside one opaque card. Use 84px portrait sizing on mobile and 112px at `sm`, preserve truncation and minimum touch targets, and keep full-card expansion. Pass the already loaded state and equipment from `V2AdventureHome`.

- [ ] **Step 4: Run the character and home widget tests and verify GREEN**

Run:

```bash
npm test -- src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/AdventureHomeWidgetGrid.test.tsx
```

Expected: both test files PASS.

### Task 3: Mockup Activity Checklist

**Files:**
- Modify: `src/adventure/v2/AdventureActivityChecklist.test.tsx`
- Modify: `src/adventure/v2/AdventureActivityChecklist.tsx`
- Modify: `src/adventure/v2/V2AdventureHome.tsx`

**Interfaces:**
- Add optional `serverNow?: number` to `AdventureActivityChecklist`.
- Export `dailyResetRemainingLabel(now: number): string` for deterministic KST reset display tests.
- Keep existing activity, summary, error and retry props unchanged.

- [ ] **Step 1: Write failing checklist layout and time tests**

Assert the checklist has one `data-checklist-completion-summary` containing `1 / 1`, one `data-checklist-actionable-summary`, no `daily-summary`/`weekly-summary` boxes, and a responsive `sm:grid-cols-2` group wrapper. Test `dailyResetRemainingLabel` with a fixed UTC timestamp that corresponds to 18:30 KST and expect `초기화까지 5시간 30분`.

- [ ] **Step 2: Run the checklist test and verify RED**

Run:

```bash
npm test -- src/adventure/v2/AdventureActivityChecklist.test.tsx
```

Expected: FAIL because the current component renders three summary boxes and has no reset label helper.

- [ ] **Step 3: Implement the warm completion header and dense rows**

Replace the three metrics with a `SURFACE_ACCENT` header containing the orange check tile, title, reset label and combined completion count. Add the actionable banner below it. Render daily activities in the first column and weekly plus ready activities in the second column, with single-column mobile flow and compact row badges. Pass `snapshot.serverNow` from `V2AdventureHome`.

- [ ] **Step 4: Run checklist and dashboard tests and verify GREEN**

Run:

```bash
npm test -- src/adventure/v2/AdventureActivityChecklist.test.tsx src/adventure/v2/AdventureDashboardProvider.test.tsx src/adventure/v2/AdventureHomeWidgetGrid.test.tsx
```

Expected: all dashboard tests PASS.

### Task 4: Integrated Verification and Commit

**Files:**
- Inspect: all modified files from Tasks 1-3
- Test: focused UI suites, TypeScript, ESLint and production build

**Interfaces:**
- Produces a single implementation commit after the previously committed design document.

- [ ] **Step 1: Run the complete focused regression set**

Run:

```bash
npm test -- src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/MainTabNav.test.ts src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/AdventureActivityChecklist.test.tsx src/adventure/v2/AdventureHomeWidgetGrid.test.tsx src/adventure/v2/AdventureDashboardProvider.test.tsx
```

Expected: all selected test files PASS with no warnings.

- [ ] **Step 2: Run static verification**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint src/adventure/v2/V2TopBar.tsx src/adventure/v2/MainTabNav.tsx src/adventure/v2/GameChrome.tsx src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/AdventureActivityChecklist.tsx src/adventure/v2/V2AdventureHome.tsx
npm run check-images
```

Expected: all commands exit 0.

- [ ] **Step 3: Run production build**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

Expected: Next.js production build and postbuild repair exit 0.

- [ ] **Step 4: Review the final diff against the approved mockup**

Confirm the 864px two-row chrome, text brand, resource chips, rich compact character card, amber checklist header, desktop 2-column list, mobile 1-column order, opaque surfaces and preserved personalization contracts are all present. Confirm no battle-result file appears in the diff.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/V2TopBar.tsx src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/MainTabNav.tsx src/adventure/v2/GameChrome.tsx src/adventure/v2/CompactCharacterSummary.test.tsx src/adventure/v2/CompactCharacterSummary.tsx src/adventure/v2/AdventureActivityChecklist.test.tsx src/adventure/v2/AdventureActivityChecklist.tsx src/adventure/v2/V2AdventureHome.tsx docs/superpowers/plans/2026-08-24-mockup-home-navbar-alignment.md
git commit -m "ui: align adventure home with approved mockup"
```
