# Fishing Codex Weekly Rank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every fish name, the player's current weekly rank, lifetime best size, and a weekly-unregistered filter in the Adventure Codex fish tab.

**Architecture:** Extract the fish-tab UI from `V2CodexView` into a focused client component. It mounts only while the fish tab is active, reuses `useFishingLeaderboard`, derives the player's rank from each fish's `isMe` entry, and keeps filter state local. A controlled list and pure helpers provide deterministic server-rendered unit tests without a browser test dependency.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Vitest, `react-dom/server`.

## Global Constraints

- Follow the installed Next.js client-component and Vitest guides.
- Reuse `/api/v2/fishing/leaderboard`; add no API, database table, or save key.
- Reveal every fish name but keep undiscovered descriptions hidden.
- Preserve `등재`, `미등록`, `미발견`, specimen extraction, and codex progress.
- Use existing opaque `Card` and `SURFACE_INSET` surfaces.
- Do not deploy or include unrelated working-tree changes.

---

### Task 1: Specify and build the focused fish-codex panel

**Files:**
- Create: `src/adventure/v2/FishingCodexPanel.test.tsx`
- Create: `src/adventure/v2/FishingCodexPanel.tsx`

**Interfaces:**
- Consumes: `FishingLeaderboardData`, `FishId`, codex registration/catch sets, the best-size map, and the specimen extraction callback.
- Produces: `weeklyFishingRanks`, `weeklyFishingStatusLabel`, `fishCodexCardState`, `FishingCodexList`, and `FishingCodexPanel`.

- [x] **Step 1: Write the failing rendering tests**

Create a `renderToStaticMarkup` test that renders `FishingCodexList` with `carp` registered, caught, ranked 17th, and a 92cm best. Assert that:

```ts
expect(html).toContain("붕어");
expect(html).toContain("미발견");
expect(html).not.toContain(FISH.crucian_carp.description);
expect(html).toContain("주간 17위");
expect(html).toContain("최대어 92cm");
expect(html).toContain("주간 미등록");
```

Add these explicit cases:

- `showUnrankedOnly={true}` with every fish ranked except `crucian_carp`: only 붕어 remains, ranked tier cards disappear, and the toggle has `aria-pressed="true"`.
- every fish ranked with the filter active: `이번 주 모든 어종에 기록을 등록했습니다.` appears.
- loading and error states: the toggle is disabled, the matching status appears, and no fish is classified as `주간 미등록`.
- registered fish retains the specimen-extraction button; an unregistered fish does not.

- [x] **Step 2: Run the new test and verify RED**

Run `npm test -- src/adventure/v2/FishingCodexPanel.test.tsx`.

Expected: FAIL because `FishingCodexPanel` does not exist.

- [x] **Step 3: Implement the rank helpers**

Implement these exact contracts:

```ts
export type FishingWeeklyState = "loading" | "ready" | "error";

export function weeklyFishingRanks(
  data: FishingLeaderboardData | null,
): Partial<Record<FishId, number>>;

export function weeklyFishingStatusLabel(
  rank: number | undefined,
  state: FishingWeeklyState,
): string;
```

`weeklyFishingRanks` iterates `FISH_IDS`, finds `data.byFish[id]?.find(entry => entry.isMe)`, and stores its real rank. The label helper returns `주간 확인 중`, `주간 순위 확인 불가`, `주간 미등록`, or `주간 N위` according to state and rank.

- [x] **Step 4: Implement the controlled list**

`FishingCodexList` must:

- render the existing progress and tier cards;
- always render `fish.name` while retaining grayscale/decorative treatment and hiding the description when `cardState.visible` is false;
- render weekly status before `최대어 ${formatFishSize(best)}` or `최대어 —`;
- stack row metadata on mobile and use `sm:flex-row` on wider screens;
- render a controlled `Button` labelled `주간 미등록만 N` when ready and `주간 미등록만 —` otherwise;
- set `aria-pressed`, disable the button unless ready, and show an adjacent loading/error explanation;
- omit fully ranked tiers while filtered and show the completion empty state when none remain;
- retain specimen extraction only when `cardState.canExtract` is true.

- [x] **Step 5: Implement the mounted wrapper**

`FishingCodexPanel` owns `showUnrankedOnly` with `useState(false)`, calls `useFishingLeaderboard()`, derives ranks, and maps hook state using:

```ts
const weeklyState: FishingWeeklyState = error
  ? "error"
  : loading || !data
    ? "loading"
    : "ready";
```

Because the parent only renders it for `tab === "fish"`, the fetch is lazy and filter state resets on tab exit.

- [x] **Step 6: Run the new test and verify GREEN**

Run `npm test -- src/adventure/v2/FishingCodexPanel.test.tsx`.

Expected: PASS with no failed tests.

### Task 2: Integrate and verify the Adventure Codex

**Files:**
- Modify: `src/adventure/v2/V2CodexView.tsx`
- Modify: `src/adventure/v2/V2CodexView.test.ts`

**Interfaces:**
- Consumes: `FishingCodexPanel` from Task 1.
- Produces: the live fish tab wired to weekly leaderboard data and the existing extraction preview.

- [x] **Step 1: Move the existing state regression import**

Import `fishCodexCardState` in `V2CodexView.test.ts` from `./FishingCodexPanel` and leave its four existing state assertions unchanged.

- [x] **Step 2: Run both codex tests before integration**

Run `npm test -- src/adventure/v2/FishingCodexPanel.test.tsx src/adventure/v2/V2CodexView.test.ts`.

Expected: PASS before replacing the old inline markup.

- [x] **Step 3: Replace the inline fish-tab markup**

Import `FishingCodexPanel`, remove fish-list-only constants/imports, and replace the existing `tab === "fish"` block with:

```tsx
{tab === "fish" && (
  <FishingCodexPanel
    registeredIds={fishDiscovered}
    caughtIds={fishCaught}
    best={fishBest}
    meta={fishingCodexMeta}
    extractBusy={extractBusy}
    onPreviewExtraction={(fishId) => void previewFishExtraction(fishId)}
  />
)}
```

- [x] **Step 4: Run focused verification**

Run:

```text
npm test -- src/adventure/v2/FishingCodexPanel.test.tsx src/adventure/v2/V2CodexView.test.ts src/adventure/v2/fishingLeaderboard.test.ts
npx eslint src/adventure/v2/FishingCodexPanel.tsx src/adventure/v2/FishingCodexPanel.test.tsx src/adventure/v2/V2CodexView.tsx src/adventure/v2/V2CodexView.test.ts
npx tsc --noEmit
git diff --check
```

Expected: all commands exit 0. Review the scoped diff to confirm it contains only the approved codex UI, tests, integration, and this plan.

- [x] **Step 5: Commit only feature files and the plan**

Stage the plan, `FishingCodexPanel.tsx`, its test, `V2CodexView.tsx`, and `V2CodexView.test.ts`. Commit with `feat: show weekly fishing ranks in codex`.
