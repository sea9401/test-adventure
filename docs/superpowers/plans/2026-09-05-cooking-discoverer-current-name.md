# Cooking Discoverer Current Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public cooking discoveries display the first discoverer's current authoritative nickname after a rename.

**Architecture:** Keep the immutable discoverer user ID and discovery-time name snapshot already stored in `cooking_first_discoveries`. Change only the cooking response mapping so a trimmed authoritative current name wins, while the snapshot remains the fallback when no current name is available.

**Tech Stack:** Next.js 16.2 Route Handlers, TypeScript, Drizzle ORM, Vitest

## Global Constraints

- Do not deploy.
- Do not change historical server-feed or mail nickname snapshots.
- Do not add a database migration; reuse the existing discoverer user ID join.

---

### Task 1: Resolve public discoverers to their current nickname

**Files:**
- Modify: `src/app/api/v2/cooking/route.ts:139-154`
- Test: `src/app/api/v2/cooking/route.test.ts:367-397`

**Interfaces:**
- Consumes: `FirstDiscoveryRow.authoritativeActorName: string | null` and `FirstDiscoveryRow.actorName: string`.
- Produces: `publicDiscoveries[].actorName` containing the trimmed current authoritative name or the stored snapshot fallback.

- [x] **Step 1: Write the failing regression test**

Change the existing renamed-discoverer fixture so the expected public result is `actorName: "바뀐 닉네임"` rather than `actorName: "옛 발견자"`. Keep a row with `authoritativeActorName: null` in the GET coverage to verify the fallback remains intact.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts -t "최초 발견자"`

Expected: FAIL because the second discovery returns `옛 발견자` instead of `바뀐 닉네임`.

- [x] **Step 3: Implement the minimal name precedence change**

In `publicDiscoveryDetails`, replace the conditional default-name-only override with:

```ts
actorName: row.authoritativeActorName?.trim() || row.actorName,
```

- [x] **Step 4: Run focused and full verification**

Run focused test: `npm test -- src/app/api/v2/cooking/route.test.ts`

Run lint for changed code: `npx eslint src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts`

Run project tests: `npm test`

Expected: all commands exit 0 with no test failures or lint errors.

Execution note: the focused route suite passed 13/13 and ESLint passed. The full suite completed with 8,579 passing tests and 6 failures confined to concurrently modified combat-pattern and fishing-shop/co-op files; no cooking test failed.

- [x] **Step 5: Review and commit**

Review `git diff --check`, `git diff`, and `git status --short`, then commit the scoped files with:

```bash
git add docs/superpowers/specs/2026-09-05-cooking-discoverer-current-name-design.md docs/superpowers/plans/2026-09-05-cooking-discoverer-current-name.md src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts
git commit -m "fix: follow cooking discoverer nickname changes"
```
