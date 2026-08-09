# Battle Log Action Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered battle log lines with side-aligned action cards that keep common results visible and place repetitive defense calculations behind an optional detail disclosure.

**Architecture:** Keep combat engines and replay data unchanged. Add a pure presentation grouping step inside `BattleLogList.tsx` that associates leading defense calculations and trailing effects with a direct attack, then render the resulting action item with existing opaque surface tokens and native disclosure markup. Pass actor names from UI call sites with safe fallbacks for old/dev callers.

**Tech Stack:** Next.js 16.2, React 19, TypeScript, Tailwind CSS 4, Vitest, `react-dom/server`

## Global Constraints

- Preserve left-player/right-opponent lane placement.
- Hide repetitive reduction calculations by default and expose them through `계산 상세`.
- Keep complete dodge, shield absorption, healing, status changes, reflection, and defeat visible.
- Use `SURFACE_CARD` and `SURFACE_INSET`; do not add translucent content surfaces.
- Preserve old replay compatibility and do not change `BattleLogEntry` or combat engine behavior.
- Preserve all unrelated working-tree changes and commit only this task's files.
- Do not deploy.

---

### Task 1: Define action association behavior

**Files:**
- Modify: `src/adventure/battle/BattleLogList.test.tsx`
- Modify: `src/adventure/battle/BattleLogList.tsx`

**Interfaces:**
- Produces: `groupBattleLogActions(entries: BattleLogEntry[]): BattleLogDisplayItem[]`
- Produces: action items with `main`, `calculations`, and `effects` fields; non-action entries remain standalone.

- [x] **Step 1: Write the failing association test**

Create a literal sequence containing `성전의 심판`, its heal/buff results, two leading calculation lines, `만독개화`, a status effect, and a reflection effect. Assert that the calculation lines attach to `만독개화`, while the heal/buff remain attached to `성전의 심판`.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/adventure/battle/BattleLogList.test.tsx`

Expected: FAIL because `groupBattleLogActions` and action item output do not exist.

- [x] **Step 3: Implement the minimal pure grouping function**

Add a calculation-label predicate for `회피 경감`, `받피감`, `결의`, `인내`, `가드`, and `굳건한 의지`. Buffer those entries until the next non-effect attack, attach following effect/info entries to the current action, and keep markers/snapshots as standalone boundaries.

- [x] **Step 4: Run the focused test and confirm GREEN**

Run: `npx vitest run src/adventure/battle/BattleLogList.test.tsx`

Expected: the new association test and existing display tests pass.

### Task 2: Render the approved action card and disclosure

**Files:**
- Modify: `src/adventure/battle/BattleLogList.test.tsx`
- Modify: `src/adventure/battle/BattleLogList.tsx`

**Interfaces:**
- Consumes: `groupBattleLogActions(...)` from Task 1.
- Produces: `BattleLogList` optional props `playerName?: string` and `enemyName?: string`.

- [x] **Step 1: Write failing render tests**

Render the screenshot-inspired sequence with `playerName="Allure"` and `enemyName="동키오"`. Assert the output contains both actor names, an action-card marker, visible status/reflection text, and `계산 상세`, but does not contain `└` or `┘` inside the action output. Assert that a calculation-free action omits the disclosure.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/adventure/battle/BattleLogList.test.tsx`

Expected: FAIL because the current renderer emits separate bubbles/effect branches and has no action disclosure.

- [x] **Step 3: Implement the minimal action renderer**

Split the action body at the first `!`, normalize `공격` to `기본 공격`, preserve label pills, show the actor name and final result in the header, render non-calculation effects in an opaque inset, and render calculations inside `<details name="battle-log-action-details"><summary>계산 상세</summary>…</details>`.

- [x] **Step 4: Run the focused test and confirm GREEN**

Run: `npx vitest run src/adventure/battle/BattleLogList.test.tsx`

Expected: all `BattleLogList` tests pass.

### Task 3: Supply actor names and run regressions

**Files:**
- Modify: `src/adventure/battle/BattleScene.tsx`
- Modify: `src/adventure/v2/SparringFullLogDialog.tsx`
- Modify: `src/adventure/v2/V2SparringView.tsx`
- Modify: `src/app/dev/battle-log/page.tsx`
- Modify: `src/app/dev/sparring-full-log/page.tsx`
- Test: `src/adventure/battle/BattleLogList.test.tsx`
- Test: `src/adventure/battle/battleLogGrouping.test.ts`

**Interfaces:**
- Consumes: `BattleLogList` name props from Task 2.
- Produces: real player/enemy labels in live and sparring logs, with `나`/`상대` fallbacks elsewhere.

- [x] **Step 1: Pass names through existing UI boundaries**

Pass `playerName` and `state.enemy.name` from `BattleScene`; extend `SparringFullLogDialog` with `playerName` and pass it from `V2SparringView`; use literal preview names in dev pages.

- [x] **Step 2: Run display and grouping regressions**

Run: `npx vitest run src/adventure/battle/BattleLogList.test.tsx src/adventure/battle/battleLogGrouping.test.ts`

Expected: both files pass.

- [x] **Step 3: Run type checking**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [x] **Step 4: Review and commit only task files**

Run `git diff --check` and inspect `git diff` for the listed display/docs files. Stage only those paths, verify `git diff --cached --name-only`, then commit with `feat: clarify battle log actions`.
