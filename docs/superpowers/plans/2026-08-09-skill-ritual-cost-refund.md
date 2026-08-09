# Skill Ritual Cost and Refund Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase skill ritual proficiency costs and fully refund/reset every enhancement created under the previous cost table.

**Architecture:** Keep the new cost table in the existing pure ritual module so the route and UI remain data-driven. Use a one-time Drizzle SQL data migration to aggregate the old cumulative cost of every saved enhancement, credit each user's character/proficiency saves, and remove all legacy enhancements atomically. Validate calculations in unit/route tests and execute the migration against an isolated temporary PostgreSQL database.

**Tech Stack:** TypeScript, Vitest, Next.js Route Handlers, PostgreSQL JSONB, Drizzle SQL migrations

## Global Constraints

- New per-step proficiency costs are exactly `300 / 950 / 2_100 / 4_500 / 9_800`.
- Gold costs and enhancement effects do not change.
- Every pre-migration enhancement is reset with 100% of its old gold and proficiency spend refunded.
- Job mastery was never deducted and must not be modified.
- New enhancements continue to use the existing 50% normal reset refund.
- Do not deploy or execute against any shared environment.
- Preserve unrelated working-tree changes and commit only scoped files.

---

### Task 1: Raise ritual proficiency costs

**Files:**
- Modify: `src/adventure/data/v2/skillRitual.ts`
- Modify: `src/adventure/data/v2/skillRitual.test.ts`
- Modify: `src/lib/server/skillRitualRoute.test.ts`

**Interfaces:**
- Consumes: `SKILL_RITUAL_STEPS`, `skillRitualRefund(level)`, and `POST /api/v2/me/skill-ritual`.
- Produces: the new step costs and cumulative +3 reset refund `{ gold: 6_000_000, proficiency: 1_675 }`.

- [ ] **Step 1: Write failing unit and route expectations**

Change the +3 refund expectation to `proficiency: 1_675`. In the +2 route test, start with 2,000 points and expect 1,050 points after the 950-point step cost.

- [ ] **Step 2: Verify the tests fail for the old 800/1,450 values**

Run: `npm test -- src/adventure/data/v2/skillRitual.test.ts src/lib/server/skillRitualRoute.test.ts`

Expected: FAIL because the production table still returns the old costs.

- [ ] **Step 3: Update the five `proficiencyCost` values**

Set the values in `SKILL_RITUAL_STEPS` to `300`, `950`, `2_100`, `4_500`, and `9_800` without changing gold or bonus fields.

- [ ] **Step 4: Verify the focused tests pass**

Run: `npm test -- src/adventure/data/v2/skillRitual.test.ts src/lib/server/skillRitualRoute.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the cost change**

Commit only the three task files with message `balance: raise skill ritual proficiency costs`.

### Task 2: Add the legacy enhancement full-refund migration

**Files:**
- Create: `drizzle/0159_refund_legacy_skill_rituals.sql` unless a concurrent migration has claimed `0159`, in which case use the next free index.
- Modify: `drizzle/meta/_journal.json`
- Test: isolated temporary PostgreSQL instance populated with representative `saves_kv` fixtures.

**Interfaces:**
- Consumes: `saves_kv` rows keyed by `skills.v2`, `character.v2`, and `proficiency.v2`.
- Produces: credited `gold`/`points`, removed `enhancements`, incremented save versions, and updated timestamps.

- [ ] **Step 1: Create failing PostgreSQL fixtures**

Create users with +1 and +3 enhancements across multiple skills. Assert the intended totals before writing the migration: old +1 is `1_000_000G / 300`, old +3 is `12_000_000G / 2_900`, and two enhanced skills are summed independently.

- [ ] **Step 2: Run the not-yet-existing migration and verify the fixture check fails**

Use an isolated `/tmp` PostgreSQL data directory and database. Expected: the migration file or postconditions are missing.

- [ ] **Step 3: Implement one atomic, idempotent SQL migration**

Use `jsonb_each(skills.value->'enhancements')` to normalize numeric legacy entries and object entries with a `level`. Clamp supported levels to 1–5, map them to the old cumulative costs, aggregate by user, upsert/credit character and proficiency saves, then remove `enhancements` only after both credits succeed. Increment `version` and set `updated_at = now()` for all changed saves.

- [ ] **Step 4: Register the migration**

Append a journal entry whose `idx`, filename tag, and strictly increasing `when` value match the new SQL file.

- [ ] **Step 5: Verify the migration behavior and idempotency**

Run the SQL once and assert exact full refunds, no `enhancements`, unchanged mastery fields, and `version + 1`. Run it again and assert no balances or versions change.

- [ ] **Step 6: Validate the migration journal**

Run: `npm run check-migrations`

Expected: PASS with the new migration count.

- [ ] **Step 7: Commit the migration**

Commit only the SQL and journal with message `fix: refund legacy skill rituals`.

### Task 3: Final verification

**Files:**
- Verify all files committed by Tasks 1–2.

**Interfaces:**
- Consumes: completed cost and migration changes.
- Produces: evidence that the current checkout is type-safe and the scoped behavior passes.

- [ ] **Step 1: Run focused tests and migration checks**

Run `npm test -- src/adventure/data/v2/skillRitual.test.ts src/adventure/v2/V2SkillLearnView.test.tsx src/lib/server/skillRitualRoute.test.ts` and `npm run check-migrations`.

- [ ] **Step 2: Run static verification**

Run `npx tsc --noEmit` and lint the affected TypeScript files.

- [ ] **Step 3: Run the full test suite**

Run `npm test`. If unrelated dirty-tree tests fail, reproduce them separately and report the exact evidence without changing out-of-scope files.

- [ ] **Step 4: Confirm commit scope**

Check `git status --short`, verify both task commits are ancestors of `HEAD`, and ensure unrelated user changes remain unstaged.
