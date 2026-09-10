# CloudFront Request Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 희귀 지도 조회의 재렌더 중복 호출과 숨겨진 탭의 정기 요청을 제거해 게임 동작을 바꾸지 않고 CloudFront 요청량을 줄인다.

**Architecture:** 희귀 지도 effect는 콜백 객체가 아니라 조회를 결정하는 값만 의존하고, effect 안에서 필요한 최신 콜백은 ref로 읽는다. presence와 제재 정기 폴링은 Page Visibility 상태를 확인하되 visible 복귀 즉시 동기화하는 기존 동작은 유지한다.

**Tech Stack:** Next.js 16.2 App Router, React 19.2 client components, TypeScript, Vitest 4, Testing Library

## Global Constraints

- 사용자에게 보이는 폴링 주기와 게임 규칙은 변경하지 않는다.
- 낚시 체크포인트, 자동사냥, 채팅·피드·알림 주기는 범위 밖이다.
- 기존 `tsconfig.json` 변경은 사용자 작업이므로 건드리거나 커밋하지 않는다.
- 운영 배포와 CloudFront 플랜 변경은 하지 않는다.

---

### Task 1: 희귀 지도 조회의 콜백 재렌더 중복 제거

**Files:**
- Modify: `src/adventure/v2/V2DungeonFloorView.rareMapState.test.tsx`
- Modify: `src/adventure/v2/V2DungeonList.render.test.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.tsx`
- Modify: `src/adventure/v2/V2DungeonList.tsx`

**Interfaces:**
- Consumes: `rareMapIid`, `onEnterRareMap`, `onReturnToNormalHunt`, `onSelectRareMap` props
- Produces: 콜백 객체 교체로는 재실행되지 않고 기능 활성 여부 또는 `rareMapIid` 변경으로만 재실행되는 GET effect

- [ ] **Step 1: Write failing callback-identity regression tests**

두 컴포넌트를 정상 응답으로 렌더한 뒤 새 `vi.fn()` 콜백으로 rerender하고
`/api/v2/me/rare-maps` GET 호출 수가 1회인지 단언한다. floor 테스트는 새
`rareMapIid`로 rerender하면 두 번째 조회가 실행되는 기존 요구도 유지한다.

- [ ] **Step 2: Run tests and verify RED**

Run:
`npm test -- src/adventure/v2/V2DungeonFloorView.rareMapState.test.tsx src/adventure/v2/V2DungeonList.render.test.tsx`

Expected: 콜백만 바꾼 rerender 뒤 GET 호출 수가 2회가 되어 실패한다.

- [ ] **Step 3: Implement minimal stable dependencies**

`V2DungeonFloorView`에서 `onReturnToNormalHunt`를 ref에 매 렌더 반영하고 조회
effect는 `rareMapIid`와 `onEnterRareMap != null` 불리언만 의존한다. 만료 처리에는
ref의 최신 콜백을 호출한다. `V2DungeonList` 조회 effect는
`onSelectRareMap != null` 불리언만 의존한다.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run:
`npm test -- src/adventure/v2/V2DungeonFloorView.rareMapState.test.tsx src/adventure/v2/V2DungeonList.render.test.tsx`

Expected: 두 테스트 파일 전체 통과.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/V2DungeonFloorView.rareMapState.test.tsx src/adventure/v2/V2DungeonList.render.test.tsx src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/V2DungeonList.tsx
git commit -m "fix: stop duplicate rare map requests"
```

### Task 2: 숨겨진 탭의 presence 정기 요청 중단

**Files:**
- Create: `src/lib/usePresenceHeartbeat.test.tsx`
- Modify: `src/lib/usePresenceHeartbeat.ts`

**Interfaces:**
- Consumes: `document.visibilityState`, 기존 `HEARTBEAT_INTERVAL_MS` 30초
- Produces: visible에서만 주기적으로 ping하고 visible 복귀 시 즉시 ping하는 heartbeat

- [ ] **Step 1: Write the failing visibility test**

hook 하니스로 최초 ping을 확인한 뒤 `visibilityState`를 `hidden`으로 바꾸고 30초를
진행해 추가 fetch가 없음을 단언한다. 다시 `visible`로 바꾸고 `visibilitychange`를
발생시켜 즉시 두 번째 fetch가 생기는지도 단언한다.

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/lib/usePresenceHeartbeat.test.tsx`

Expected: hidden 30초 뒤 fetch가 2회가 되어 실패한다.

- [ ] **Step 3: Guard the interval tick**

정기 interval 콜백에 `document.visibilityState === "visible"` 조건을 추가한다. 최초
ping과 visible 복귀 핸들러, 세션 무효화 및 빌드 버전 처리는 변경하지 않는다.

- [ ] **Step 4: Run test and verify GREEN**

Run: `npm test -- src/lib/usePresenceHeartbeat.test.tsx`

Expected: 전체 통과.

- [ ] **Step 5: Commit**

```bash
git add src/lib/usePresenceHeartbeat.test.tsx src/lib/usePresenceHeartbeat.ts
git commit -m "fix: pause presence heartbeat in hidden tabs"
```

### Task 3: 숨겨진 탭의 제재 정기 요청 중단

**Files:**
- Modify: `src/adventure/v2/PlayerSanctionGate.test.tsx`
- Modify: `src/adventure/v2/PlayerSanctionGate.tsx`

**Interfaces:**
- Consumes: `document.visibilityState`, `PLAYER_SANCTION_POLL_MS`
- Produces: visible에서만 정기 조회하고 visible 복귀 시 즉시 조회하는 제재 게이트

- [ ] **Step 1: Write the failing visibility test**

최초 정상 상태를 받은 뒤 hidden 상태에서 `PLAYER_SANCTION_POLL_MS`만큼 fake timer를
진행해 추가 GET이 없는지 단언한다. visible 복귀 이벤트에는 즉시 한 번 조회되는지
확인한다.

- [ ] **Step 2: Run test and verify RED**

Run: `npm test -- src/adventure/v2/PlayerSanctionGate.test.tsx`

Expected: hidden 인터벌 뒤 GET이 한 번 더 호출되어 실패한다.

- [ ] **Step 3: Guard the regular interval**

정기 interval 콜백에서 visible일 때만 `refresh()`를 호출한다. 최초 확인 실패의 예약
재시도와 visible 복귀 즉시 조회는 보안 동작이므로 유지한다.

- [ ] **Step 4: Run test and verify GREEN**

Run: `npm test -- src/adventure/v2/PlayerSanctionGate.test.tsx`

Expected: 전체 통과.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/v2/PlayerSanctionGate.test.tsx src/adventure/v2/PlayerSanctionGate.tsx
git commit -m "fix: pause sanction polling in hidden tabs"
```

### Task 4: 전체 회귀 검증

**Files:**
- Verify only

**Interfaces:**
- Consumes: Tasks 1-3의 변경
- Produces: 타입, lint, 전체 테스트, production build 검증 기록

- [ ] **Step 1: Review the diff and whitespace**

Run: `git diff --check HEAD~3` and `git status --short`

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Run: `npm run lint -- src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/V2DungeonList.tsx src/lib/usePresenceHeartbeat.ts src/adventure/v2/PlayerSanctionGate.tsx`

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: all commands exit 0. The prebuild image checks may print orphan warnings but must not fail.
