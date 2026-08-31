# Storm Expedition Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폭풍 원정에서 모바일·PC 모두 현재 행동과 다음 경로 선택 사이의 스크롤 왕복을 없앤다.

**Architecture:** 반응형 배치 책임을 작은 `StormExpeditionActiveLayout` 컴포넌트로 분리하고, 모바일 지도 데이터는 현재 노드와 바로 다음 후보만 만드는 순수 함수로 축약한다. 기존 원정 상태·API·행동 컴포넌트는 유지한 채 `V2StormExpeditionView`에서 세 영역을 새 셸에 조립한다.

**Tech Stack:** Next.js App Router, React Client Components, TypeScript, Tailwind CSS, Vitest 정적 렌더링 테스트

## Global Constraints

- 모바일 DOM 순서는 `현재 행동 → 경로 선택 → 원정 지원`이다.
- PC에서는 경로 선택을 왼쪽, 현재 행동과 원정 지원을 오른쪽에 표시한다.
- 모바일 지도는 현재 노드와 바로 다음 후보만 표시하며 높이는 최대 260px이다.
- 분기 규칙, 전투, 보상, API 요청 형식은 변경하지 않는다.
- 배포하지 않는다.

---

### Task 1: 반응형 진행 레이아웃 셸

**Files:**
- Create: `src/adventure/v2/StormExpeditionActiveLayout.tsx`
- Create: `src/adventure/v2/StormExpeditionActiveLayout.test.tsx`

**Interfaces:**
- Consumes: `currentAction`, `routePlanner`, `support` React 노드
- Produces: `StormExpeditionActiveLayout(props)`

- [ ] **Step 1: Write the failing test**

정적 렌더링 결과에서 `현재 행동`, `경로 선택`, `원정 지원`의 DOM 순서를 비교하고, 루트가 PC 2열 Grid 클래스를 갖는지 검사한다.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/adventure/v2/StormExpeditionActiveLayout.test.tsx`
Expected: FAIL because `StormExpeditionActiveLayout` does not exist.

- [ ] **Step 3: Write minimal implementation**

세 영역을 모바일 순서로 렌더링하고 `md:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]`에서 경로 영역은 왼쪽, 나머지는 오른쪽 Grid 위치를 지정한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/adventure/v2/StormExpeditionActiveLayout.test.tsx`
Expected: PASS.

### Task 2: 모바일 현재·다음 축약 지도

**Files:**
- Modify: `src/adventure/v2/stormExpeditionMobileMap.ts`
- Modify: `src/adventure/v2/stormExpeditionMobileMap.test.ts`
- Modify: `src/adventure/v2/StormExpeditionRouteMap.tsx`
- Modify: `src/adventure/v2/StormExpeditionRouteMap.test.tsx`

**Interfaces:**
- Produces: `stormExpeditionMobileWindow(currentNodeId, previewableNodeIds)` returning `{ label, height, nodes }`
- Consumes: `currentNodeId` and `previewableNodeIds` already passed to `StormExpeditionRouteMap`

- [ ] **Step 1: Write the failing tests**

입장 전에는 세 입구만 180px 캔버스에, 진행 중에는 현재 노드와 최대 세 다음 후보만 260px 캔버스에 배치되는 기대값을 추가한다. 지도 렌더 테스트의 모바일 레이블과 높이 기대값도 새 동작으로 바꾼다.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/adventure/v2/stormExpeditionMobileMap.test.ts src/adventure/v2/StormExpeditionRouteMap.test.tsx`
Expected: FAIL because the old 1/3 segment map still returns 300~550px layouts.

- [ ] **Step 3: Write minimal implementation**

현재 노드는 위 중앙, 다음 후보는 아래에 균등 배치하는 순수 함수를 만들고 `StormExpeditionRouteMap`의 모바일 렌더가 이 결과를 사용하게 한다. PC 전체 지도는 그대로 둔다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/adventure/v2/stormExpeditionMobileMap.test.ts src/adventure/v2/StormExpeditionRouteMap.test.tsx`
Expected: PASS.

### Task 3: 진행 화면 통합과 검증

**Files:**
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`

**Interfaces:**
- Consumes: `StormExpeditionActiveLayout`
- Preserves: existing `act`, `RoutePreview`, `BattleControls`, `ChoiceControls`, `RiskEventControls`, loot and practice behavior

- [ ] **Step 1: Integrate the layout**

현재 체크포인트 Card를 `currentAction`, 지도 Card와 선택 `RoutePreview`를 `routePlanner`, 전리품/연습 Card를 `support`로 전달한다. 기존 상하 배치와 지도 밖의 중복 `RoutePreview`를 제거한다.

- [ ] **Step 2: Run focused tests**

Run: `npm test -- src/adventure/v2/StormExpeditionActiveLayout.test.tsx src/adventure/v2/stormExpeditionMobileMap.test.ts src/adventure/v2/StormExpeditionRouteMap.test.tsx src/adventure/v2/V2StormExpeditionView.test.tsx`
Expected: PASS.

- [ ] **Step 3: Run static verification**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx eslint src/adventure/v2/StormExpeditionActiveLayout.tsx src/adventure/v2/StormExpeditionActiveLayout.test.tsx src/adventure/v2/stormExpeditionMobileMap.ts src/adventure/v2/stormExpeditionMobileMap.test.ts src/adventure/v2/StormExpeditionRouteMap.tsx src/adventure/v2/StormExpeditionRouteMap.test.tsx src/adventure/v2/V2StormExpeditionView.tsx`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-18-storm-expedition-layout-design.md docs/superpowers/plans/2026-08-18-storm-expedition-layout.md src/adventure/v2/StormExpeditionActiveLayout.tsx src/adventure/v2/StormExpeditionActiveLayout.test.tsx src/adventure/v2/stormExpeditionMobileMap.ts src/adventure/v2/stormExpeditionMobileMap.test.ts src/adventure/v2/StormExpeditionRouteMap.tsx src/adventure/v2/StormExpeditionRouteMap.test.tsx src/adventure/v2/V2StormExpeditionView.tsx
git commit -m "fix: streamline expedition navigation layout"
```
