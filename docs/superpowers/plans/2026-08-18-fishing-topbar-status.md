# Fishing Top Bar Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 낚시가 진행되는 동안 좌상단 생활 상태를 `낚시 중`으로 표시하고 낚시가 끝나면 `휴식 중`으로 되돌린다.

**Architecture:** `FishingView`가 단계별 활성 여부를 계산해 `FishingPanel`에 알리고, 패널은 이를 영속적인 `GameStateProvider` 상태에 저장한다. `GameChrome`은 그 상태를 `V2TopBar`에 전달하며, 상단바는 자동 벌목·채광을 먼저 표시하고 그 다음 낚시, 마지막으로 휴식을 표시한다.

**Tech Stack:** Next.js 16.2.11 App Router, React 19, TypeScript, Vitest, server-side static markup tests

## Global Constraints

- `casting`, `waiting`, `biting`, `resolving` 단계만 낚시 중이다.
- `idle`, `result` 단계는 휴식 중이다.
- 화면이 언마운트되면 낚시 상태를 반드시 해제한다.
- 자동 벌목·채광 상태는 낚시 상태보다 우선한다.
- 낚시 상태 표시는 `/town/fishing`으로 이동하는 링크다.
- 배포하지 않는다.

---

### Task 1: 낚시 단계 활성 판정

**Files:**
- Modify: `src/adventure/v2/FishingView.test.ts`
- Modify: `src/adventure/v2/FishingView.tsx`

**Interfaces:**
- Produces: `isFishingActivePhase(phase: FishingPhase): boolean`
- Produces: `onFishingActiveChange?: (active: boolean) => void` prop on `FishingView`

- [x] **Step 1: Write the failing phase-mapping test**

```tsx
import {
  fishingTapAction,
  isFishingActivePhase,
  type FishingPhase,
} from "./FishingView";

it.each<[FishingPhase, boolean]>([
  ["idle", false],
  ["casting", true],
  ["waiting", true],
  ["biting", true],
  ["resolving", true],
  ["result", false],
])("%s 단계의 낚시 진행 상태는 %s다", (phase, active) => {
  expect(isFishingActivePhase(phase)).toBe(active);
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/adventure/v2/FishingView.test.ts`

Expected: FAIL because `isFishingActivePhase` is not exported.

- [x] **Step 3: Implement phase mapping and lifecycle reporting**

```tsx
export function isFishingActivePhase(phase: FishingPhase): boolean {
  return (
    phase === "casting" ||
    phase === "waiting" ||
    phase === "biting" ||
    phase === "resolving"
  );
}

useEffect(() => {
  onFishingActiveChange?.(isFishingActivePhase(phase));
}, [onFishingActiveChange, phase]);

useEffect(
  () => () => {
    onFishingActiveChange?.(false);
  },
  [onFishingActiveChange],
);
```

Add `onFishingActiveChange?: (active: boolean) => void` to `FishingView`'s local props and destructure it.

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run src/adventure/v2/FishingView.test.ts`

Expected: PASS.

### Task 2: 전역 낚시 상태 연결

**Files:**
- Modify: `src/adventure/v2/GameStateProvider.tsx`
- Modify: `src/adventure/v2/FishingPanel.tsx`
- Modify: `src/adventure/v2/GameChrome.tsx`

**Interfaces:**
- Consumes: `onFishingActiveChange?: (active: boolean) => void`
- Produces: `fishingActive: boolean` and `setFishingActive: React.Dispatch<React.SetStateAction<boolean>>` from `useGameState()`
- Produces: `fishingActive` prop for `V2TopBar`

- [x] **Step 1: Add provider state and expose it through the memoized context value**

```tsx
fishingActive: boolean;
setFishingActive: React.Dispatch<React.SetStateAction<boolean>>;

const [fishingActive, setFishingActive] = useState(false);
```

Add both values to the returned context object and its dependency array.

- [x] **Step 2: Report `FishingView` lifecycle through `FishingPanel`**

```tsx
const { setFishingActive } = useGameState();

<FishingView
  {...handlers}
  onFishingActiveChange={setFishingActive}
  // existing props remain unchanged
/>
```

- [x] **Step 3: Pass provider state from `GameChrome` to `V2TopBar`**

```tsx
const { autoGathering, fishingActive } = useGameState();

<V2TopBar
  autoGathering={autoGathering}
  fishingActive={fishingActive}
/>
```

- [x] **Step 4: Run TypeScript validation for the new interface**

Run: `npx tsc --noEmit`

Expected: PASS after Task 3 completes the `V2TopBar` prop.

### Task 3: 좌상단 낚시 상태와 우선순위

**Files:**
- Modify: `src/adventure/v2/V2TopBar.test.tsx`
- Modify: `src/adventure/v2/V2TopBar.tsx`

**Interfaces:**
- Consumes: `fishingActive: boolean`
- Preserves: `autoGathering: AutoGatheringStatus | null` as the higher-priority state

- [x] **Step 1: Write failing rendering and priority tests**

```tsx
it("낚시 진행 중에는 낚시 화면 링크를 표시한다", () => {
  const html = renderToStaticMarkup(
    <V2TopBar autoGathering={null} fishingActive />,
  );

  expect(html).toContain("낚시 중");
  expect(html).toContain('href="/town/fishing"');
  expect(html).toContain('aria-label="낚시 화면으로 이동"');
  expect(html).not.toContain("휴식 중");
});

it("자동 채집과 낚시가 겹치면 자동 채집을 우선 표시한다", () => {
  const html = renderToStaticMarkup(
    <V2TopBar
      autoGathering={{
        activity: "woodcutting",
        sourceId: "birch",
        sourceName: "자작나무",
        readyAt: Date.now() + 60_000,
      }}
      fishingActive
    />,
  );

  expect(html).toContain('href="/town/logging?spot=birch_grove"');
  expect(html).not.toContain('href="/town/fishing"');
});
```

Update existing calls to pass `fishingActive={false}`.

- [x] **Step 2: Run the focused top-bar test and verify it fails**

Run: `npx vitest run src/adventure/v2/V2TopBar.test.tsx`

Expected: FAIL because `fishingActive` is not accepted or rendered.

- [x] **Step 3: Implement fishing display after auto-gathering priority**

Accept `fishingActive: boolean` in `V2TopBar`. Keep the existing automatic gathering branch first, then add this branch before the rest state:

```tsx
{activityHref ? (
  // existing automatic gathering link
) : fishingActive ? (
  <Link
    href="/town/fishing"
    aria-label="낚시 화면으로 이동"
    className="flex h-10 min-w-0 items-center rounded-lg border border-zinc-200 bg-white px-3 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
  >
    <span className="text-[10px] font-medium text-emerald-700 sm:text-[11px] dark:text-emerald-300">
      낚시 중
    </span>
  </Link>
) : (
  // existing rest state
)}
```

- [x] **Step 4: Run focused tests and validate types**

Run: `npx vitest run src/adventure/v2/FishingView.test.ts src/adventure/v2/V2TopBar.test.tsx`

Run: `npx tsc --noEmit`

Expected: all PASS.

### Task 4: 전체 검증과 커밋

**Files:**
- Verify all modified source, test, spec, and plan files

**Interfaces:**
- Consumes: completed Tasks 1-3
- Produces: verified local commit with no deployment

- [x] **Step 1: Inspect the complete diff for scope and stale markers**

Run: `git diff --check`

Expected: no whitespace errors.

- [x] **Step 2: Run lint and the full test suite**

Run: `npx eslint src/adventure/v2/FishingView.tsx src/adventure/v2/FishingView.test.ts src/adventure/v2/FishingPanel.tsx src/adventure/v2/GameStateProvider.tsx src/adventure/v2/GameChrome.tsx src/adventure/v2/V2TopBar.tsx src/adventure/v2/V2TopBar.test.tsx`

Run: `npm test -- --maxWorkers=1`

Expected: all PASS.

- [x] **Step 3: Commit the verified implementation**

```bash
git add docs/superpowers/plans/2026-08-18-fishing-topbar-status.md \
  src/adventure/v2/FishingView.tsx \
  src/adventure/v2/FishingView.test.ts \
  src/adventure/v2/FishingPanel.tsx \
  src/adventure/v2/GameStateProvider.tsx \
  src/adventure/v2/GameChrome.tsx \
  src/adventure/v2/V2TopBar.tsx \
  src/adventure/v2/V2TopBar.test.tsx
git commit -m "feat: show fishing activity in topbar"
```
