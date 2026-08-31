# Fishing Daily Catch Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 낚시 화면에서 요리 재료 어획물 5종의 오늘 획득량과 등급별 일일 최대치를 항상 확인하고, 챔질 뒤 즉시 갱신할 수 있게 한다.

**Architecture:** `fishingStock.ts`가 저장 상태를 5행의 표시용 진행 목록으로 변환하는 단일 출처가 된다. 상태 API가 이 목록을 초기 로드하고 `useFishing`이 기존 챔질 응답의 단일 등급 진행값을 병합한다. 전용 표시 컴포넌트가 `SURFACE_INSET` 표면으로 목록을 렌더링한다.

**Tech Stack:** Next.js 16 App Router route handlers, React 19, TypeScript, Vitest, Testing Library, Tailwind CSS surface tokens

## Global Constraints

- 배포하지 않는다.
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`와 `05-server-and-client-components.md`의 현재 프로젝트 Next.js 지침을 따른다.
- 장면 배경 위의 새 콘텐츠 표면은 불투명해야 하며 `src/components/ui/surfaces.ts`의 토큰을 사용한다.
- 어획물 일일 최대치와 지급 확률은 변경하지 않는다.
- 사용자의 기존 `CompactBattlePlayerStatus` 변경과 다른 미추적 문서는 건드리거나 커밋하지 않는다.

---

### Task 1: 일일 어획물 진행 목록 도메인 함수

**Files:**
- Modify: `src/adventure/v2/fishingStock.ts`
- Test: `src/adventure/v2/fishingStock.test.ts`

**Interfaces:**
- Consumes: `FishingStock`, `FISHING_CATCH_ITEM_LIST`, `FISHING_CATCH_ITEM_DAILY_CAP`
- Produces: `FishingCatchItemDailyProgress` and `fishingCatchItemDailyProgress(stock: FishingStock, dayKey: string): FishingCatchItemDailyProgress[]`

- [ ] **Step 1: Write failing tests for current-day and stale-day progress**

```ts
it("오늘 어획물 5종의 획득량과 일일 최대치를 고정 순서로 만든다", () => {
  const progress = fishingCatchItemDailyProgress({
    version: 1,
    items: {},
    daily: { date: "2026-08-25", awarded: { catch_common: 12, catch_special: 8 } },
  }, "2026-08-25");
  expect(progress.map(({ itemId, awarded, cap }) => ({ itemId, awarded, cap }))).toEqual([
    { itemId: "catch_common", awarded: 12, cap: 40 },
    { itemId: "catch_fresh", awarded: 0, cap: 30 },
    { itemId: "catch_quality", awarded: 0, cap: 20 },
    { itemId: "catch_special", awarded: 8, cap: 8 },
    { itemId: "catch_legendary", awarded: 0, cap: 2 },
  ]);
});

it("이전 날짜의 획득량은 오늘 진행량에 포함하지 않는다", () => {
  const progress = fishingCatchItemDailyProgress({
    version: 1,
    items: {},
    daily: { date: "2026-08-24", awarded: { catch_common: 40 } },
  }, "2026-08-25");
  expect(progress.every((row) => row.awarded === 0)).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- src/adventure/v2/fishingStock.test.ts`

Expected: FAIL because `fishingCatchItemDailyProgress` is not exported.

- [ ] **Step 3: Implement the typed projection**

```ts
export type FishingCatchItemDailyProgress = {
  itemId: FishingCatchItemId;
  name: string;
  awarded: number;
  cap: number;
};

export function fishingCatchItemDailyProgress(
  stock: FishingStock,
  dayKey: string,
): FishingCatchItemDailyProgress[] {
  const awarded = stock.daily?.date === dayKey ? stock.daily.awarded : {};
  return FISHING_CATCH_ITEM_LIST.map((item) => ({
    itemId: item.id,
    name: item.name,
    awarded: Math.min(FISHING_CATCH_ITEM_DAILY_CAP[item.id], awarded[item.id] ?? 0),
    cap: FISHING_CATCH_ITEM_DAILY_CAP[item.id],
  }));
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm test -- src/adventure/v2/fishingStock.test.ts`

Expected: PASS.

### Task 2: 상태 API에서 전체 체크표 초기값 제공

**Files:**
- Modify: `src/app/api/v2/fishing/status/route.ts`
- Create: `src/app/api/v2/fishing/status/route.test.ts`

**Interfaces:**
- Consumes: `readSave(db, userId, FISHING_STOCK_KEY, emptyFishingStock())` and `fishingCatchItemDailyProgress`
- Produces: JSON field `dailyCatchItems: FishingCatchItemDailyProgress[]`

- [ ] **Step 1: Write a failing route test**

```ts
it("오늘 어획물 5종의 일일 진행량을 반환한다", async () => {
  saves.set("fishing-stock.v1", {
    version: 1,
    items: {},
    daily: { date: "2026-08-25", awarded: { catch_common: 7 } },
  });
  const response = await GET();
  const body = await response.json();
  expect(body.dailyCatchItems).toHaveLength(5);
  expect(body.dailyCatchItems[0]).toMatchObject({
    itemId: "catch_common",
    name: "일반 어획물",
    awarded: 7,
    cap: 40,
  });
});
```

Mock `ensureUser`, `readFishingCatchCoinProgress`, `readActiveAutoGatheringActivity`, `readSave`, and `kstDailyKey` so the test is deterministic at `2026-08-25`.

- [ ] **Step 2: Run the route test and confirm RED**

Run: `npm test -- src/app/api/v2/fishing/status/route.test.ts`

Expected: FAIL because `dailyCatchItems` is absent.

- [ ] **Step 3: Read and project fishing stock in the route**

```ts
const dayKey = kstDailyKey(new Date());
const [dailyCatchCoins, activeAutoActivity, fishingStockRaw] = await Promise.all([
  readFishingCatchCoinProgress(userId, dayKey),
  readActiveAutoGatheringActivity(db, userId),
  readSave(db, userId, FISHING_STOCK_KEY, emptyFishingStock()),
]);
const dailyCatchItems = fishingCatchItemDailyProgress(
  parseFishingStock(fishingStockRaw),
  dayKey,
);
return Response.json({ ok: true, dailyCatchCoins, dailyCatchItems, activeAutoActivity });
```

- [ ] **Step 4: Run domain and route tests and confirm GREEN**

Run: `npm test -- src/adventure/v2/fishingStock.test.ts src/app/api/v2/fishing/status/route.test.ts`

Expected: PASS.

### Task 3: 클라이언트 상태 파싱과 챔질 후 단일 행 갱신

**Files:**
- Modify: `src/adventure/v2/fishingStock.ts`
- Modify: `src/adventure/v2/useFishing.ts`
- Modify: `src/adventure/v2/FishingView.tsx`
- Test: `src/adventure/v2/fishingStock.test.ts`

**Interfaces:**
- Consumes: status JSON `dailyCatchItems` and reel JSON `catchItemDaily`
- Produces: `parseFishingCatchItemDailyProgress(raw: unknown)` and `replaceFishingCatchItemDailyProgress(rows, raw)`; `FishingHandlers.dailyCatchItems`

- [ ] **Step 1: Write failing parser and replacement tests**

```ts
it("API 진행 목록에서 알려진 5종의 유효한 값만 정규화한다", () => {
  expect(parseFishingCatchItemDailyProgress([
    { itemId: "catch_common", name: "일반 어획물", awarded: 7.9, cap: 40 },
    { itemId: "unknown", name: "알 수 없음", awarded: 2, cap: 3 },
  ])).toEqual([
    { itemId: "catch_common", name: "일반 어획물", awarded: 7, cap: 40 },
  ]);
});

it("챔질 응답으로 해당 등급 진행량만 교체한다", () => {
  const rows = fishingCatchItemDailyProgress(emptyFishingStock(), "2026-08-25");
  const next = replaceFishingCatchItemDailyProgress(rows, {
    itemId: "catch_special", name: "특급 어획물", awarded: 8, cap: 8,
  });
  expect(next.find((row) => row.itemId === "catch_special")?.awarded).toBe(8);
  expect(next.find((row) => row.itemId === "catch_common")?.awarded).toBe(0);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- src/adventure/v2/fishingStock.test.ts`

Expected: FAIL because the parser and replacement helpers are absent.

- [ ] **Step 3: Implement strict parsing and immutable replacement**

Parse only arrays, known `FishingCatchItemId` values, finite numeric values, and caps greater than zero. Normalize `awarded` to `0..cap`, floor both numbers, and use the canonical item name from `FISHING_CATCH_ITEMS` rather than trusting response copy. Replacement must return the original rows when the update is invalid or its item is missing.

- [ ] **Step 4: Wire the state through `useFishing` and `FishingHandlers`**

```ts
const [dailyCatchItems, setDailyCatchItems] =
  useState<FishingCatchItemDailyProgress[] | null>(null);

// status response
const nextItems = parseFishingCatchItemDailyProgress(j.dailyCatchItems);
if (nextItems.length > 0) setDailyCatchItems(nextItems);

// caught reel response, after parsing catchItemDaily
setDailyCatchItems((current) =>
  current ? replaceFishingCatchItemDailyProgress(current, j.catchItemDaily) : current,
);
```

Return `dailyCatchItems` from `useFishing` and accept it in `FishingView` through `FishingHandlers`.

- [ ] **Step 5: Run the focused tests and typecheck**

Run: `npm test -- src/adventure/v2/fishingStock.test.ts`

Run: `npx tsc --noEmit`

Expected: PASS.

### Task 4: 불투명 일일 어획물 체크표 UI

**Files:**
- Create: `src/adventure/v2/FishingDailyCatchChecklist.tsx`
- Create: `src/adventure/v2/FishingDailyCatchChecklist.test.tsx`
- Modify: `src/adventure/v2/FishingView.tsx`

**Interfaces:**
- Consumes: `items: readonly FishingCatchItemDailyProgress[]`
- Produces: accessible `section` labelled `요리 재료 일일 획득`

- [ ] **Step 1: Write failing rendering tests**

```tsx
it("어획물 5종의 오늘 획득량과 최대치를 표시한다", () => {
  const html = renderToStaticMarkup(
    <FishingDailyCatchChecklist items={fishingCatchItemDailyProgress({
      version: 1,
      items: {},
      daily: { date: "2026-08-25", awarded: { catch_common: 12 } },
    }, "2026-08-25")} />,
  );
  expect(html).toContain("요리 재료 일일 획득");
  expect(html).toContain("일반 어획물");
  expect(html).toContain("12 / 40");
  expect(html).toContain("전설의 어획물");
  expect(html).toContain("0 / 2");
});

it("최대치에 도달한 행을 완료 상태로 읽을 수 있다", () => {
  const html = renderToStaticMarkup(<FishingDailyCatchChecklist items={[{
    itemId: "catch_special", name: "특급 어획물", awarded: 8, cap: 8,
  }]} />);
  expect(html).toContain("완료");
  expect(html).toContain("aria-label=\"특급 어획물 완료\"");
});
```

- [ ] **Step 2: Run the component test and confirm RED**

Run: `npm test -- src/adventure/v2/FishingDailyCatchChecklist.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the compact checklist**

Use `SURFACE_INSET` on the outer section, `FishingCatchItemIcon` for each known item, tabular numbers, and a visible/check-reader completion label only when `awarded >= cap`. Keep all five rows visible on mobile and desktop; do not add a modal, tab, or collapsed disclosure.

- [ ] **Step 4: Place the checklist below the existing fishing status summary**

Pass `dailyCatchItems` into `FishingStatusStrip` and render:

```tsx
{dailyCatchItems && dailyCatchItems.length > 0 ? (
  <FishingDailyCatchChecklist items={dailyCatchItems} />
) : null}
```

Also change the touched status strip wrapper from hand-written translucent backgrounds to `SURFACE_INSET`, preserving its sky/amber text and progress accents.

- [ ] **Step 5: Run component, domain, and route tests**

Run: `npm test -- src/adventure/v2/FishingDailyCatchChecklist.test.tsx src/adventure/v2/fishingStock.test.ts src/app/api/v2/fishing/status/route.test.ts`

Expected: PASS.

### Task 5: Full verification and commit

**Files:**
- Verify all files changed in Tasks 1–4

**Interfaces:**
- Consumes: completed feature
- Produces: verified local commit; no deployment

- [ ] **Step 1: Run formatting and static checks**

Run: `git diff --check`

Run: `npx eslint src/adventure/v2/fishingStock.ts src/adventure/v2/fishingStock.test.ts src/adventure/v2/useFishing.ts src/adventure/v2/FishingView.tsx src/adventure/v2/FishingDailyCatchChecklist.tsx src/adventure/v2/FishingDailyCatchChecklist.test.tsx src/app/api/v2/fishing/status/route.ts src/app/api/v2/fishing/status/route.test.ts`

Run: `npx tsc --noEmit`

Expected: all commands exit 0.

- [ ] **Step 2: Run focused regression tests**

Run: `npm test -- src/adventure/v2/FishingDailyCatchChecklist.test.tsx src/adventure/v2/fishingStock.test.ts src/adventure/v2/fishingRewardSummary.test.ts src/lib/server/fishingReelRoute.test.ts src/app/api/v2/fishing/status/route.test.ts`

Expected: PASS.

- [ ] **Step 3: Review the final diff and commit only feature files**

```bash
git add src/adventure/v2/fishingStock.ts \
  src/adventure/v2/fishingStock.test.ts \
  src/adventure/v2/useFishing.ts \
  src/adventure/v2/FishingView.tsx \
  src/adventure/v2/FishingDailyCatchChecklist.tsx \
  src/adventure/v2/FishingDailyCatchChecklist.test.tsx \
  src/app/api/v2/fishing/status/route.ts \
  src/app/api/v2/fishing/status/route.test.ts \
  docs/superpowers/plans/2026-08-25-fishing-daily-catch-checklist.md
git commit -m "feat: show daily fishing ingredient progress"
```

Confirm the user-owned `CompactBattlePlayerStatus` changes and unrelated untracked documents remain unstaged.
