# Coop Participant Access Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep an active cooperative boss visible and attackable for users who already dealt damage when the summoner later narrows its visibility.

**Architecture:** Extend the existing pure visibility predicate with an optional prior-contribution grant, then provide that fact at the list and attack route boundaries. Keep restricted inherited sessions distinct in the existing pure UI section classifier.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Drizzle ORM, React, Vitest

## Global Constraints

- Do not deploy or mutate production data.
- Preserve current behavior for users with no contribution and for reward calculation/claiming.
- Read active-session contribution before filtering it out of the list.
- Recheck attack access after the session row lock to preserve the existing visibility race guard.

---

### Task 1: Retain server access for prior contributors

**Files:**
- Modify: `src/adventure/data/v2/coopBosses.test.ts`
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Modify: `src/app/api/v2/coop/route.ts`
- Modify: `src/app/api/v2/coop/attack/route.ts`

**Interfaces:**
- Consumes: `canAccessCoopBoss(session, viewer, hasContribution?)`
- Produces: the existing boolean access decision with `hasContribution=true` granting access

- [x] **Step 1: Write the failing access test**

Add literal assertions showing an out-of-guild viewer is denied with the default call and allowed when the third argument is `true`.

- [x] **Step 2: Run the test to verify RED**

Run: `npm test -- src/adventure/data/v2/coopBosses.test.ts`

Expected: FAIL because the current function ignores the contribution argument.

- [x] **Step 3: Implement the minimal access predicate and route wiring**

Add `hasContribution = false` to `canAccessCoopBoss`. In the list route, load the current user's contribution rows for all active session IDs before visibility filtering and pass `damage > 0`. In the attack route, read contribution existence for the early check, then move the locked-stage contributor read ahead of the race check and pass the same fact.

- [x] **Step 4: Run the focused server test**

Run: `npm test -- src/adventure/data/v2/coopBosses.test.ts`

Expected: PASS.

### Task 2: Keep inherited sessions in a visible list section

**Files:**
- Modify: `src/adventure/v2/coop/coopListSections.test.ts`
- Modify: `src/adventure/v2/coop/coopListSections.ts`

**Interfaces:**
- Consumes: `CoopSessionSummary.myDamage` and `visibility`
- Produces: `CoopSessionListSection` with the additional id `participated`

- [x] **Step 1: Write the failing list-classification test**

Create `summoner_only` and `guild_only` non-owner summaries with positive `myDamage`; assert both IDs appear once in `participated` and not in the guild/public sections.

- [x] **Step 2: Run the test to verify RED**

Run: `npm test -- src/adventure/v2/coop/coopListSections.test.ts`

Expected: FAIL because no `participated` section exists and private non-owner sessions are dropped.

- [x] **Step 3: Implement the minimal section**

Insert `participated` after `mine`. It contains non-owner, non-public sessions with `myDamage > 0`; exclude those rows from `guild`. Leave public sessions in `public`.

- [x] **Step 4: Run both focused tests**

Run: `npm test -- src/adventure/data/v2/coopBosses.test.ts src/adventure/v2/coop/coopListSections.test.ts`

Expected: PASS.

### Task 3: Verify and commit

**Files:**
- Verify all files changed by Tasks 1–2 and these design/plan documents.

- [x] **Step 1: Run static and full regression checks**

Run: `npx tsc --noEmit`, `npm run lint`, then `npm test -- --maxWorkers=4`.

Expected: all commands exit 0 with no new warnings.

- [x] **Step 2: Review the diff and workspace boundaries**

Run: `git diff --check`, `git status --short`, and `git diff -- <changed paths>`.

Expected: only the intended tracked files are changed; pre-existing `NUL` and `_workspace/` remain untouched.

- [x] **Step 3: Commit the completed fix**

Stage only the intended files and commit with `fix: retain coop access for contributors`.
