# Job SP Grace Unequip Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players remove equipped combat skills one at a time from an over-budget loadout during the active job-SP grace period.

**Architecture:** Keep the normal `validateLoadout` contract strict. The loadout POST route may override only its `overBudget` failure when grace is active, the requested combat IDs are a strict subset of the stored combat IDs, SP usage decreases, and every non-budget validation remains valid.

**Tech Stack:** TypeScript, Next.js 16 App Router Route Handlers, Vitest

## Global Constraints

- Do not deploy or change maintenance mode.
- Preserve unrelated working-tree changes.
- Do not permit additions, replacements, reorder-only requests, unlearned skills, unknown skills, or exclusive conflicts through the grace exception.

---

### Task 1: Cover and fix grace-period partial unequip

**Files:**
- Modify: `src/lib/server/loadoutRoute.test.ts`
- Modify: `src/app/api/v2/me/loadout/route.ts`

**Interfaces:**
- Consumes: `JobUnlockContext.jobSpRebalance.active`, stored `V2SkillsState.equipped`, and `LoadoutCheck` from `validateLoadout`.
- Produces: the existing POST response shape; no new client contract.

- [x] **Step 1: Write the failing route test**

Seed an active grace state and a stored loadout whose total cost exceeds the current budget. POST a strict subset that removes one combat skill but remains over budget. Assert HTTP 200 and that the exact requested subset is persisted.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/lib/server/loadoutRoute.test.ts`

Expected: the new test receives HTTP 400 with `overBudget: true`.

- [x] **Step 3: Implement the minimal route exception**

After `validateLoadout`, derive whether all requested combat IDs existed in the stored combat loadout, at least one stored combat ID was removed, and `check.spUsed` is below the stored loadout's validated SP usage. Accept an over-budget result only when grace is active and `notLearned`, `unknown`, and `exclusiveConflicts` are empty.

- [x] **Step 4: Add rejection coverage**

Add table-driven cases proving inactive grace and a request that adds or replaces a combat skill still return HTTP 400.

- [x] **Step 5: Run focused and adjacent tests**

Run: `npm test -- src/lib/server/loadoutRoute.test.ts src/adventure/data/v2/v2Loadout.test.ts src/lib/server/v2Skills.test.ts`

Expected: all tests pass without warnings.

- [x] **Step 6: Run static checks and commit**

Run `npx eslint src/app/api/v2/me/loadout/route.ts src/lib/server/loadoutRoute.test.ts`, `npx tsc --noEmit`, and `git diff --check`. Review the scoped diff and commit only the design, plan, route, and route-test files.
