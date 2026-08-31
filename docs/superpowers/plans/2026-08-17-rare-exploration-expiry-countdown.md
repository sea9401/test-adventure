# Rare Exploration Expiry Countdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 희귀 탐사의 발견 알림, 열린 레어맵 카드, 진행 배너에 서버 기준 30분 만료 카운트다운을 표시하고 만료 상태를 자동 정리한다.

**Architecture:** 희귀 지도 조회 API가 필터링에 사용한 `serverNow`를 함께 반환한다. 공용 클라이언트 컴포넌트가 `foundAt`, `serverNow`, `RARE_MAP_TTL_MS`로 보정 만료 시각을 계산해 초 단위로 표시하고, 만료 콜백을 한 번만 호출한다.

**Tech Stack:** Next.js 16 App Router Route Handler, React 19 Client Components, TypeScript, Vitest

## Global Constraints

- 30분 만료 규칙과 저장 데이터 형식은 변경하지 않는다.
- 희귀 탐사에만 새 카운트다운을 표시하고 희귀 장소·비밀 상점의 기존 UI는 유지한다.
- 서버 만료 검증을 최종 권위로 유지한다.
- 배포하지 않는다.

---

### Task 1: 서버 기준 희귀 지도 시간 계약

**Files:**
- Modify: `src/app/api/v2/me/rare-maps/route.test.ts`
- Modify: `src/app/api/v2/me/rare-maps/route.ts`
- Create: `src/adventure/v2/rareMapCountdown.test.ts`
- Create: `src/adventure/v2/rareMapCountdown.ts`

**Interfaces:**
- Produces: GET JSON `serverNow: number`
- Produces: `correctedRareMapExpiry(foundAt: number, serverNow: number, clientNow: number): number`
- Produces: `formatRareMapRemaining(ms: number): string`

- [ ] **Step 1: Write failing API and time utility tests**

Add a GET test with fixed `Date.now()` that expects `{ ok: true, serverNow: NOW, rareMaps: [fresh] }`, and pure utility cases that expect a server-side 10-minute remainder to become the same client-side remainder and `29:59`, `00:01`, `00:00` formatting.

- [ ] **Step 2: Run tests to verify RED**

Run: `npx vitest run src/app/api/v2/me/rare-maps/route.test.ts src/adventure/v2/rareMapCountdown.test.ts`

Expected: FAIL because GET omits `serverNow` and the time utility module does not exist.

- [ ] **Step 3: Implement the minimum contract and pure utilities**

Read `Date.now()` once in GET, pass it to `parseRareMaps`, and return it as `serverNow`. Implement clock correction as `clientNow + max(0, foundAt + TTL - serverNow)` and format remaining time with ceiling seconds and zero clamping.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npx vitest run src/app/api/v2/me/rare-maps/route.test.ts src/adventure/v2/rareMapCountdown.test.ts`

Expected: PASS.

### Task 2: 공용 희귀 탐사 카운트다운 표시

**Files:**
- Create: `src/adventure/v2/RareMapCountdownText.tsx`
- Modify: `src/adventure/v2/HuntResultCard.test.tsx`
- Modify: `src/adventure/v2/HuntResultCard.tsx`
- Modify: `src/adventure/v2/BatchSummaryCard.tsx`

**Interfaces:**
- Consumes: Task 1의 `correctedRareMapExpiry`, `formatRareMapRemaining`
- Produces: `RareMapCountdownText({ foundAt, serverNow, onExpire? })`

- [ ] **Step 1: Extend discovery rendering tests first**

Update the existing single and batch rare-map discovery tests to require `30분 동안 개방` and `남은 시간 30:00` for hunt maps.

- [ ] **Step 2: Run the discovery test to verify RED**

Run: `npx vitest run src/adventure/v2/HuntResultCard.test.tsx`

Expected: FAIL because discovery notices omit expiry text.

- [ ] **Step 3: Implement the countdown component and discovery copy**

The component anchors the corrected expiry at mount, ticks once per second, renders `남은 시간 MM:SS`, and invokes `onExpire` at most once. Newly discovered maps pass `serverNow={map.foundAt}` so the freshly issued map starts from the full shared TTL without depending on the device clock.

- [ ] **Step 4: Run the discovery test to verify GREEN**

Run: `npx vitest run src/adventure/v2/HuntResultCard.test.tsx src/adventure/v2/rareMapCountdown.test.ts`

Expected: PASS.

### Task 3: 열린 목록과 진행 화면 연결

**Files:**
- Modify: `src/adventure/v2/V2DungeonList.test.ts`
- Modify: `src/adventure/v2/V2DungeonList.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.test.tsx`
- Modify: `src/adventure/v2/V2DungeonFloorView.tsx`

**Interfaces:**
- Consumes: GET JSON `{ rareMaps: RareMapInstance[], serverNow: number }`
- Consumes: `RareMapCountdownText`
- Produces: `removeExpiredRareMap(maps: RareMapInstance[], iid: string): RareMapInstance[]`

- [ ] **Step 1: Write failing list and banner tests**

Add a pure list-removal test that proves only the expired iid is removed. Extend the rare exploration banner test to provide a known map snapshot and require both `남은 N판` and `남은 시간 MM:SS`.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npx vitest run src/adventure/v2/V2DungeonList.test.ts src/adventure/v2/V2DungeonFloorView.test.tsx`

Expected: FAIL because removal helper and time display are absent.

- [ ] **Step 3: Wire the list to server time**

Store `serverNow` from GET, pass it to hunt-map cards, and use `onExpire` to remove only the expired item. Keep location-card copy unchanged.

- [ ] **Step 4: Wire the active exploration banner**

When `rareMapIid` exists, fetch the same snapshot, initialize remaining runs, and show the corrected countdown. On expiry, mark the banner expired and invoke `onReturnToNormalHunt` once.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run: `npx vitest run src/adventure/v2/V2DungeonList.test.ts src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/HuntResultCard.test.tsx src/app/api/v2/me/rare-maps/route.test.ts src/adventure/v2/rareMapCountdown.test.ts`

Expected: PASS.

### Task 4: 전체 검증과 구현 커밋

**Files:**
- Verify all files changed in Tasks 1-3

- [ ] **Step 1: Run static and regression checks**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/rareMapCountdown.ts src/adventure/v2/RareMapCountdownText.tsx src/adventure/v2/V2DungeonList.tsx src/adventure/v2/V2DungeonFloorView.tsx src/adventure/v2/HuntResultCard.tsx src/adventure/v2/BatchSummaryCard.tsx src/app/api/v2/me/rare-maps/route.ts src/app/api/v2/me/rare-maps/route.test.ts src/adventure/v2/rareMapCountdown.test.ts src/adventure/v2/V2DungeonList.test.ts src/adventure/v2/V2DungeonFloorView.test.tsx src/adventure/v2/HuntResultCard.test.tsx`

Run: `npm run build`

Expected: all exit 0.

- [ ] **Step 2: Review the diff and commit only this feature**

Confirm unrelated combat and guild trade-post changes remain outside the commit, then commit the countdown implementation and tests with `feat: show rare exploration expiry countdown`.
