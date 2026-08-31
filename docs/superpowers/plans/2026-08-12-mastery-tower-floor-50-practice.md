# Mastery Tower Floor 50 Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow players who cleared mastery tower floor 50 to repeat that fight for setup testing without additional rewards, records, or stamina cost.

**Architecture:** Reuse the existing floor-resolution and battle path. Treat a completed run as a floor-50 practice target, preserve the completed run on practice defeat, expose an explicit `practice` response flag, and adapt the existing main and battle views to present the repeated fight accurately.

**Tech Stack:** TypeScript, Next.js 16 App Router route handlers, React 19, Vitest

## Global Constraints

- Practice attempts award no additional certificates or first-clear rewards.
- Practice attempts do not change daily, weekly, or lifetime best-floor records.
- A practice defeat uses the existing 30-second cooldown and preserves `runFloor: 50`.
- Do not deploy or change maintenance mode.
- Preserve unrelated job-roadmap worktree changes.

---

### Task 1: Completed-state floor resolution and failure preservation

**Files:**
- Modify: `src/adventure/data/v2/masteryTower.test.ts`
- Modify: `src/adventure/data/v2/masteryTower.ts`

**Interfaces:**
- Consumes: `MasteryTowerState`, `MASTERY_TOWER_MAX_FLOOR`
- Produces: `resolveMasteryTowerAttemptFloor(state, requestedStartFloor?)`, `isMasteryTowerPracticeAttempt(state, floor)`, and completed-state behavior in `failMasteryTowerRun(state, now?)`

- [ ] **Step 1: Write failing state tests**

Add tests asserting that a `runFloor: 50` state resolves an omitted start floor to `{ ok: true, floor: 50 }`, rejects an explicit start floor, is identified as practice, and preserves all best-floor fields plus `runFloor: 50` when `failMasteryTowerRun` adds the cooldown.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/data/v2/masteryTower.test.ts`

Expected: FAIL because completed runs currently resolve to floor 51 and failures reset `runFloor` to 0.

- [ ] **Step 3: Implement the minimal state behavior**

Clamp the continuation target to floor 50, add a pure practice predicate, and preserve a completed `runFloor` in the failure transition.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/adventure/data/v2/masteryTower.test.ts`

Expected: PASS.

### Task 2: Status and attempt API integration

**Files:**
- Modify: `src/app/api/v2/mastery-tower/route.ts`
- Modify: `src/app/api/v2/mastery-tower/attempt/route.ts`

**Interfaces:**
- Consumes: `resolveMasteryTowerAttemptFloor`, `isMasteryTowerPracticeAttempt`, guardian and power preview functions
- Produces: status fields targeting floor 50 after completion and attempt response field `practice: boolean`

- [ ] **Step 1: Reuse the resolved completed target in the status response**

Compute the next target as floor 50 when `runFloor` is already 50, and return the corresponding required power and guardian preview.

- [ ] **Step 2: Mark attempt responses with practice context**

Compute `practice` from the pre-battle tower state and resolved floor. Include it in cooldown and battle result responses so the client distinguishes the first clear from later repeats.

- [ ] **Step 3: Keep reward and stamina paths unchanged**

Continue using the existing claim preview and entry-stamina functions; no economy event or new reward write is added.

### Task 3: Main and battle view presentation

**Files:**
- Modify: `src/adventure/v2/V2MasteryTowerView.tsx`
- Modify: `src/adventure/v2/V2MasteryTowerBattleView.tsx`
- Create: `src/adventure/v2/V2MasteryTowerBattleView.test.ts`
- Modify: `src/app/manual/content/jobs.tsx`

**Interfaces:**
- Consumes: status `runFloor`, target floor, attempt response `practice`
- Produces: enabled `50층 연습 재도전` entry, practice-aware result messages/actions, and matching manual copy

- [ ] **Step 1: Write failing result-presentation tests**

Export the existing pure result-message helper and assert literals for floor-50 practice victory and defeat. The failure proves the helper currently labels them as ordinary clears/failures.

- [ ] **Step 2: Run the focused presentation test and verify RED**

Run: `npm test -- src/adventure/v2/V2MasteryTowerBattleView.test.ts`

Expected: FAIL because `practice` is not represented and practice-specific text is absent.

- [ ] **Step 3: Implement practice-aware UI copy and actions**

Show floor 50 as a practice target on the main screen, label its entry action `50층 연습 재도전`, show practice-specific result and cooldown text, and allow the result-page retry action after the cooldown without returning to the start picker.

- [ ] **Step 4: Update the manual**

State that floor 50 can be repeated for practice after completion and that practice attempts do not grant additional rewards.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/data/v2/masteryTower.test.ts src/adventure/v2/V2MasteryTowerBattleView.test.ts`

Expected: PASS.

### Task 4: Full verification and commit

**Files:**
- Verify only the files listed above and the two documentation files for this feature.

**Interfaces:**
- Consumes: completed Tasks 1-3
- Produces: verified local commit

- [ ] **Step 1: Run the relevant and full automated checks**

Run `npm test`, `npx tsc --noEmit`, `npx eslint` on changed source/test files, `npm run check-images`, and `npm run build`.

- [ ] **Step 2: Inspect the final diff**

Confirm no unrelated job-roadmap files are staged and no reward/stamina mutation was introduced.

- [ ] **Step 3: Commit**

Stage only this feature's files and commit with `feat: add mastery tower floor 50 practice retries`.
