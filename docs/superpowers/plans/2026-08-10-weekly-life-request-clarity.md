# Weekly Life Request Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present normal and unlocked requester-only weekly life requests as one weekly choice, explain why unchosen work is closed, and remove identical delivery requirements.

**Architecture:** Keep the existing shared `weekly.completedIds` persistence and server-side one-delivery limit. Add a pure grouping model and a focused weekly-choice component in `LifeRequestBoard.tsx`, then adjust only colliding special-request quantities in `lifeRequests.ts`.

**Tech Stack:** Next.js 16 App Router, React 19 Client Components, TypeScript, Vitest, React static-render tests, Tailwind CSS

## Global Constraints

- Preserve the shared weekly one-request limit and `period_limit` server guard.
- Show unlocked special requests beside normal weekly requests under one heading.
- Keep locked special requests in a collapsed, opaque-surface section.
- Identify the selected request by title and label all other choices as closed by another selection.
- Do not change artisan leaderboard rewards or deploy.
- Preserve unrelated working-tree changes and do not create subagents.

---

### Task 1: Unique Weekly Delivery Requirements

**Files:**
- Modify: `src/adventure/v2/lifeRequests.test.ts`
- Modify: `src/adventure/v2/lifeRequests.ts`

**Interfaces:**
- Consumes: `lifeRequestsForPeriod(dailyKey, weeklyKey)`.
- Produces: weekly and special request sets without equal `itemKind`, `itemId`, and `quantity` signatures.

- [x] **Step 1: Write a failing invariant test** that generates representative weekly boards and compares every regular request signature with every special request signature.
- [x] **Step 2: Run `npm test -- src/adventure/v2/lifeRequests.test.ts` and verify the duplicate cooking and fishing requirements make it fail.**
- [x] **Step 3: Change the colliding special-request quantities without changing rewards or unlock conditions.**
- [x] **Step 4: Re-run the focused test and verify it passes.**

### Task 2: Unified Weekly Choice UI

**Files:**
- Modify: `src/adventure/v2/LifeRequestBoard.test.tsx`
- Modify: `src/adventure/v2/LifeRequestBoard.tsx`

**Interfaces:**
- Produces: `groupWeeklyRequestChoices(...)` for separating available and locked choices and resolving the selected request.
- Produces: a weekly-choice section that passes the selected title into unchosen cards as a visible closure reason.

- [x] **Step 1: Write failing model and rendered-output tests** for combining normal plus unlocked special requests, folding locked specials, and naming the chosen request when the limit is consumed.
- [x] **Step 2: Run `npm test -- src/adventure/v2/LifeRequestBoard.test.tsx` and verify the tests fail for missing exports/behavior.**
- [x] **Step 3: Implement the grouping model, unified section, category labels, locked details, and explicit closure message using existing surface tokens.**
- [x] **Step 4: Remove the duplicate special-request card grid from the requester tab and add a weekly-menu pointer.**
- [x] **Step 5: Re-run the focused component tests and verify they pass.**

### Task 3: Regression Verification and Commit

**Files:**
- Verify all files above plus `src/lib/server/lifeRequestsRoute.test.ts`.

- [x] **Step 1: Run `npm test -- src/adventure/v2/LifeRequestBoard.test.tsx src/adventure/v2/lifeRequests.test.ts src/lib/server/lifeRequestsRoute.test.ts`.**
- [x] **Step 2: Run `npx tsc --noEmit`, `npx eslint src/adventure/v2/LifeRequestBoard.tsx src/adventure/v2/LifeRequestBoard.test.tsx src/adventure/v2/lifeRequests.ts src/adventure/v2/lifeRequests.test.ts`, and `git diff --check`.**
- [x] **Step 3: Inspect the scoped diff and working-tree status, preserving unrelated changes.**
- [x] **Step 4: Commit only the design, plan, implementation, and tests with `feat: clarify weekly life request choices`.**
