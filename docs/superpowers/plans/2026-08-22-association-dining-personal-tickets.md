# Association Dining Personal Tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 협회 식당에서 공동 목표와 개인 납품 상한을 없애고, 개인이 주간 식재료 20점을 기여할 때마다 식권 1장을 즉시 얻도록 한다.

**Architecture:** 기존 개인 주간 식당 저장값을 재사용하되 협회 전용 식권 계산 함수를 추가한다. 협회 API는 공용 주간 식당 상태에서 분리하고, 공유 React 패널은 `source`에 따라 길드 공동형 또는 협회 개인형 진행 UI를 렌더링한다. 기존 협회 공용 주간 DB 구조는 배포 호환성을 위해 남긴다.

**Tech Stack:** Next.js 16 App Router route handlers, React 19, TypeScript, Vitest

## Global Constraints

- 협회 식당은 기본 식권을 지급하지 않는다.
- 개인의 해당 주 누적 기여 점수 20점마다 식권 1장을 얻는다.
- 주간 개인 기여 점수와 획득 가능한 식권 수에는 상한을 두지 않는다.
- 매주 월요일 00:00 KST 초기화와 길드·협회 주간 이용처 고정은 유지한다.
- 길드 식당 규칙, 식재료 점수, 메뉴 효과와 시설 레벨별 메뉴 해금은 변경하지 않는다.
- DB 마이그레이션과 배포는 수행하지 않는다.

---

### Task 1: 협회 개인 식권 계산

**Files:**
- Modify: `src/adventure/data/v2/guildDining.ts`
- Modify: `src/adventure/data/v2/guildDining.test.ts`

**Interfaces:**
- Consumes: `GuildDiningUserState.contributionPoints`, `GuildDiningUserState.mealsUsed`
- Produces: `ASSOCIATION_DINING_POINTS_PER_TICKET = 20`, `associationDiningTicketProgress(state)`

- [ ] **Step 1: Write the failing calculation test**

Add expectations proving that 19 points earn zero tickets, 20 points earn one, 40 points earn two, used meals reduce only `available`, and `contributionCap` is `null`.

```ts
expect(associationDiningTicketProgress({ ...state, contributionPoints: 19 })).toMatchObject({
  base: 0,
  earned: 0,
  available: 0,
  contributionCap: null,
});
expect(associationDiningTicketProgress({ ...state, contributionPoints: 40, mealsUsed: 1 })).toMatchObject({
  earned: 2,
  used: 1,
  available: 1,
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/data/v2/guildDining.test.ts`

Expected: FAIL because `associationDiningTicketProgress` is not exported.

- [ ] **Step 3: Implement the minimal calculation**

Add the constant and return the shared ticket fields with `base: 0`, `contributionEarned` and `earned` equal to `Math.floor(contributionPoints / 20)`, `used: mealsUsed`, `available: Math.max(0, earned - mealsUsed)`, and `contributionCap: null`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/adventure/data/v2/guildDining.test.ts`

Expected: PASS.

### Task 2: 협회 API를 개인 기여형으로 전환

**Files:**
- Modify: `src/app/api/v2/association/dining-hall/route.test.ts`
- Modify: `src/app/api/v2/association/dining-hall/route.ts`

**Interfaces:**
- Consumes: `associationDiningTicketProgress(state)`, `weekKey`
- Produces: 협회 응답의 `pantry.ready = true`, 무제한 개인 기부, 20점 단위 식권 주문 판정

- [ ] **Step 1: Write failing route tests**

Extend route tests so `lockSaveForUpdate` state is configurable. Add a wheat donation request and a menu order request proving these cases:

```ts
expect((await donateWheat(20).then((response) => response.json())).tickets).toMatchObject({
  base: 0,
  earned: 1,
  available: 1,
  contributionCap: null,
});
expect(saveAssociationDiningWeekly).not.toHaveBeenCalled();
```

Also start at 40 personal points and donate more than the former Lv.1 32-point cap, expecting status 200. Start at 19 points and order a menu, expecting `no_meal_ticket` even when the mocked shared pantry is complete.

- [ ] **Step 2: Run the route test and verify RED**

Run: `npm test -- src/app/api/v2/association/dining-hall/route.test.ts`

Expected: FAIL because the route still applies the shared 400-point goal and Lv.1 personal cap.

- [ ] **Step 3: Implement the personal route flow**

Replace `AssociationDiningWeekly` arguments with `weekKey`. Stop calling `lockAssociationDiningWeekly` and `saveAssociationDiningWeekly`. Return a compatibility pantry `{ points: 0, target: 0, remaining: 0, ready: true }`, calculate tickets with `associationDiningTicketProgress`, remove contribution-cap and pantry-cap checks from donation, and remove `pantry_not_ready` from ordering.

Keep ingredient ownership, request quantity `<= 999`, rate limit, weekly source claim, menu level, charge capacity and save locking checks unchanged.

- [ ] **Step 4: Run the route test and verify GREEN**

Run: `npm test -- src/app/api/v2/association/dining-hall/route.test.ts`

Expected: PASS.

### Task 3: 협회 전용 이용 안내와 납품 입력

**Files:**
- Modify: `src/adventure/v2/guild/guildDiningAvailability.test.ts`
- Modify: `src/adventure/v2/guild/guildDiningAvailability.ts`
- Modify: `src/adventure/v2/guild/GuildDiningHallPanel.tsx`

**Interfaces:**
- Consumes: `DiningFacilitySource`, `ASSOCIATION_DINING_POINTS_PER_TICKET`, association response with `contributionCap: null`
- Produces: 협회에서는 공동 목표를 요구하지 않는 이용 불가 사유와 개인 기여 UI

- [ ] **Step 1: Write the failing availability tests**

Add `contributionPoints` to the availability fixture and assert that association state ignores an unready pantry and describes the next ticket threshold.

```ts
expect(guildDiningUnavailableReasons({
  ...available,
  currentSource: "association",
  pantry: { ready: false, remaining: 400 },
  contributionPoints: 7,
  availableTickets: 0,
})).toEqual(["사용 가능한 식권이 없습니다. 다음 식권까지 13점이 필요합니다."]);
```

- [ ] **Step 2: Run the availability test and verify RED**

Run: `npm test -- src/adventure/v2/guild/guildDiningAvailability.test.ts`

Expected: FAIL because the helper reports shared pantry progress and the generic exhausted-ticket copy.

- [ ] **Step 3: Implement source-specific behavior and UI**

Make the availability helper skip pantry checks for `currentSource === "association"` and calculate the remaining points to the next multiple of 20. In `GuildDiningHallPanel`, allow `contributionCap: number | null`; for association donations cap only by owned quantity, ingredient batch size, and 999 items per request.

Render association copy and a personal progress bar from `contributionPoints % 20`; keep the guild shared progress block unchanged. Do not disable association donation when the compatibility pantry is ready. Show `20점마다 식권 1장 · 주간 납품 제한 없음`, use `개인 기여 +N점` in the success notice, and make the reset footer source-specific.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/v2/guild/guildDiningAvailability.test.ts src/app/api/v2/association/dining-hall/route.test.ts`

Expected: PASS.

### Task 4: 사용자 설명 갱신

**Files:**
- Modify: `src/app/manual/content/guild.tsx`
- Modify: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: `ASSOCIATION_DINING_POINTS_PER_TICKET`
- Produces: 길드 식당과 협회 식당의 차이를 설명하는 매뉴얼 문구

- [ ] **Step 1: Write the failing manual assertion**

Modify `src/app/manual/current-content.test.tsx` to expect the rendered guild manual to contain `협회 식당은 개인이 식재료 20점을 기여할 때마다 식권 1장`.

- [ ] **Step 2: Run the manual test and verify RED**

Run: `npm test -- src/app/manual/current-content.test.tsx`

Expected: FAIL because the manual only describes the guild shared pantry flow.

- [ ] **Step 3: Add the association-specific manual paragraph**

Import `ASSOCIATION_DINING_POINTS_PER_TICKET` and add a paragraph after the guild dining rules that explains no shared preparation goal, one ticket per 20 personal points, no weekly personal donation cap, and Monday 00:00 KST reset.

- [ ] **Step 4: Run the manual test and verify GREEN**

Run: `npm test -- src/app/manual/current-content.test.tsx`

Expected: PASS.

### Task 5: 통합 검증과 구현 커밋

**Files:**
- Verify all modified production, test and documentation files

**Interfaces:**
- Consumes: Tasks 1-4
- Produces: 검증된 단일 기능 커밋

- [ ] **Step 1: Run all dining and manual tests**

Run: `npm test -- src/adventure/data/v2/guildDining.test.ts src/adventure/v2/guild/guildDiningAvailability.test.ts src/app/api/v2/guild/dining-hall/route.test.ts src/app/api/v2/association/dining-hall/route.test.ts src/app/manual/current-content.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/guildDining.ts src/adventure/data/v2/guildDining.test.ts src/app/api/v2/association/dining-hall/route.ts src/app/api/v2/association/dining-hall/route.test.ts src/adventure/v2/guild/guildDiningAvailability.ts src/adventure/v2/guild/guildDiningAvailability.test.ts src/adventure/v2/guild/GuildDiningHallPanel.tsx src/app/manual/content/guild.tsx src/app/manual/current-content.test.tsx`

Expected: both PASS.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; only intended files plus the user's pre-existing `.superpowers/` entry are present.

- [ ] **Step 4: Commit the implementation**

```bash
git add src/adventure/data/v2/guildDining.ts src/adventure/data/v2/guildDining.test.ts src/app/api/v2/association/dining-hall/route.ts src/app/api/v2/association/dining-hall/route.test.ts src/adventure/v2/guild/guildDiningAvailability.ts src/adventure/v2/guild/guildDiningAvailability.test.ts src/adventure/v2/guild/GuildDiningHallPanel.tsx src/app/manual/content/guild.tsx src/app/manual/current-content.test.tsx docs/superpowers/plans/2026-08-22-association-dining-personal-tickets.md
git commit -m "feat: make association dining tickets personal"
```
