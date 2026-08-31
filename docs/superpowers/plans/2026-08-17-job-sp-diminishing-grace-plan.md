# Job Unlock SP Diminishing Returns Implementation Plan

> **For Codex:** Use superpowers:executing-plans to implement this plan task by task. Preserve all unrelated dirty files and do not deploy.

**Goal:** Change job-unlock SP to +1 for the first 50 jobs and +1 per two jobs thereafter, with a global 24-hour compatibility grace for existing equipped loadouts.

**Architecture:** A pure policy module owns the diminishing formula and grace-state parsing. The job catalog exposes both unlocked count and new bonus. Server reconciliation and combat sanitization derive legacy/new budgets from the same helper, while mutation routes continue to validate strictly against the new budget. A data migration seeds the global start timestamp in `ops_settings`; state response metadata drives the loadout warning and adjustment notice.

**Tech Stack:** TypeScript, Next.js 16 App Router, Drizzle/PostgreSQL, React 19, Vitest

---

### Task 1: Add the pure SP policy

**Files:**
- Create: `src/adventure/data/v2/jobSpPolicy.ts`
- Create: `src/adventure/data/v2/jobSpPolicy.test.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Modify: `src/adventure/data/v2/coreLoopConfig.ts`
- Modify: `src/adventure/data/v2/coreLoopConfig.test.ts`

1. Add failing tests for counts 0, 50, 51, 52, 121, 122 and invalid input.
2. Run the focused tests and confirm the expected missing/wrong-formula failures.
3. Implement `jobUnlockSpForCount`, legacy calculation, and unlocked-job count exposure.
4. Update budget wording/tests so unrelated SP sources remain additive.
5. Run focused tests green.

### Task 2: Add rollout state and migration marker

**Files:**
- Modify: `src/adventure/data/v2/jobSpPolicy.ts`
- Modify: `src/adventure/data/v2/jobSpPolicy.test.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/lib/server/jobUnlockContext.ts`
- Create: `src/lib/server/jobSpRollout.ts`
- Create: `src/lib/server/jobSpRollout.test.ts`
- Create: `drizzle/0166_start_job_sp_rebalance.sql`
- Modify: `drizzle/meta/_journal.json`

1. Add failing tests for missing/invalid markers, active grace, exact expiry, and migration-row parsing.
2. Implement the 24-hour grace calculation and an executor-based ops-setting reader.
3. Extend the job unlock context with rollout state so existing combat callers receive it without a second connection.
4. Add an idempotent data migration that records the database clock only when the policy key is absent.
5. Run policy/reader tests and `npm run check-migrations`.

### Task 3: Preserve only existing loadouts during grace

**Files:**
- Modify: `src/lib/server/v2Skills.ts`
- Modify: `src/lib/server/v2Skills.test.ts`
- Verify: `src/app/api/v2/me/loadout/route.ts`
- Verify: `src/app/api/v2/me/combat-loadout-presets/route.ts`

1. Add failing tests proving an old-budget loadout survives reconciliation and combat during grace, strict new-budget behavior occurs after expiry, priority is preserved, and removed IDs are reported.
2. Implement a shared legacy/new/effective budget calculation for automatic reconciliation and combat sanitization.
3. Return reconciliation metadata separately from the persisted skill state.
4. Keep manual loadout and preset-application validation on the strict new budget; add/adjust route tests only if existing coverage does not prove this.
5. Run server and route focused tests green.

### Task 4: Expose and render grace status

**Files:**
- Modify: `src/app/api/v2/me/state/route.ts`
- Modify: `src/app/api/v2/me/state/stateSections.ts`
- Modify: relevant state section tests
- Modify: `src/adventure/v2/V2LoadoutPanel.tsx`
- Modify: `src/adventure/v2/V2LoadoutPanel.test.tsx`

1. Add failing state/UI tests for grace metadata, current/new SP display, remaining time, and post-expiry removed skill names.
2. Capture reconciliation metadata in the state transaction and pass it to `loadoutSection`.
3. Add the typed migration payload without changing unrelated response fields.
4. Render an opaque inset notice, using server-derived expiry and skill names from the existing library.
5. Run state/UI focused tests green.

### Task 5: Full verification and commit

**Files:** all files above only

1. Run all focused tests touched by the implementation.
2. Run TypeScript, ESLint on changed source files, migration validation, and the full Vitest suite where feasible.
3. Review `git diff --check`, the scoped diff, and `git status --short`; confirm unrelated dirty files remain untouched.
4. Commit only the SP policy, migration, tests, UI, and documentation files with a Korean-scope-neutral commit message.
5. Do not deploy.
