# Codex Mastery Monthly Research Progress (B8a) Implementation Plan

> **For Codex:** Execute this plan task by task with regression tests first. Keep every codex feature default
> `false`; do not schedule a real season, enable a flag, backfill, deploy, merge, push, or touch the deployment
> checkout.

**Goal:** Add validated operator-scheduled monthly research seasons and transactionally record/read each user's
18-goal, diversity, and record progress without exposing rankings, settlement, or seasonal trophies.

**Architecture:** Put the immutable definition contract and monotonic evaluator in a pure v2 data module. Store
season snapshots and one locked progress row per user/season in dedicated PostgreSQL tables. Extend the existing
central gameplay batch recorder with an independently gated monthly batch callback so permanent and monthly writes
share the game transaction but can be operated separately. Add the current personal season to the authenticated
mastery snapshot and render it with existing opaque surface tokens.

**Design:** `docs/superpowers/specs/2026-08-20-codex-mastery-monthly-progress-b8a-design.md`

**Tech Stack:** TypeScript, React 19, Next.js 16.2 App Router, Drizzle ORM/PostgreSQL, Vitest, Tailwind shared
surface tokens.

---

## Guardrails

- Read and follow local Next.js route-handler docs before changing the route (already inspected for this bundle).
- Use KST calendar boundaries and an exclusive end instant; never infer a season from the current month.
- Accept only a stored `scheduled`/`active` definition; do not seed an operating season.
- Exact budgets: 18 objective definitions / 12,000 objective points / 5,000 diversity / 3,000 record / 20,000 total.
- Client requests cannot submit research progress, counts, records, or score.
- Do not change SP, combat power, gold, items, permanent mastery scoring, trophy history, or current ranking semantics.
- Do not implement monthly public ranking, settlement, trophy award, hall of fame, feed, or admin UI in B8a.
- Preserve source transaction failure propagation and all default-off settings.

## Task 1: Define and evaluate immutable monthly research rules

**Files:**

- Create: `src/adventure/data/v2/codexResearch.ts`
- Create: `src/adventure/data/v2/codexResearch.test.ts`

### Step 1: Write failing definition tests

Cover valid KST month boundaries (ordinary month, year rollover, leap February), exclusive end checks, exact group
counts, unique stable IDs, distinct main/support categories, category/source-compatible filters, and exact three-part
budgets. Assert malformed definitions return stable validation errors and never partially normalize.

### Step 2: Write failing evaluator tests

Cover empty progress, count accumulation capped at the target, distinct-entry deduplication, highest `bestValue`,
fixed objective completion once, diversity/record caps, representative record, score reached timestamp, no-op events,
safe-integer/finite validation, and monotonic multi-event application.

Run: `npm test -- src/adventure/data/v2/codexResearch.test.ts`

Expected: FAIL because the monthly domain module does not exist.

### Step 3: Implement the smallest pure contract and evaluator

Export:

- season status, objective group, filter/rule, definition, event, progress-state, representative-record, and personal
  view types;
- exact budget/group constants;
- `kstCodexResearchSeasonWindow`, `validateCodexResearchSeasonDefinition`,
  `emptyCodexResearchProgress`, and `applyCodexResearchEvents`.

Bound every stored set by its target/cap. Preserve completion times and update `scoreReachedAt` only when total score
increases. Recompute the total from authoritative components and reject unsafe input.

### Step 4: Run focused tests

Run: `npm test -- src/adventure/data/v2/codexResearch.test.ts`

Expected: PASS.

### Step 5: Commit

```bash
git add src/adventure/data/v2/codexResearch.ts src/adventure/data/v2/codexResearch.test.ts
git commit -m "feat: define monthly codex research rules"
```

## Task 2: Add season and user-progress persistence

**Files:**

- Modify: `src/db/schema.ts`
- Create: `drizzle/0171_*.sql`
- Create: `drizzle/meta/0171_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/lib/server/codexResearchRepository.ts`
- Create: `src/lib/server/codexResearchRepository.test.ts`

### Step 1: Write failing repository contract tests

Using a small in-memory store adapter or mocked executor, prove that scheduling validates before insert, an existing
season cannot be overwritten, only `scheduled`/`active` rows inside `[startAt,endAt)` are selected, a missing user
row is initialized then locked, scheduled-to-active is monotonic, and saved progress remains bounded.

Run: `npm test -- src/lib/server/codexResearchRepository.test.ts`

Expected: FAIL because the repository does not exist.

### Step 2: Add Drizzle schema

Add `codexResearchSeasons` and `codexResearchProgress` with the keys, foreign keys, status checks, score/component
checks, 18-objective limit, final-tier check, and season score/tie-break index from the design. Use typed JSONB for
the immutable definition and progress state.

### Step 3: Generate and review migration 0171

Run: `npm run db:generate`

Review the SQL and metadata. It must only add the two monthly research tables, constraints, foreign keys, and indexes.
It must not insert season data or alter existing mastery/economy tables.

### Step 4: Implement repository operations

Implement explicit season scheduling, current reviewed-season lookup, user progress read/lock/save, and lazy
scheduled-to-active transition. Use insert-on-conflict plus `FOR UPDATE` for the composite progress key. Treat a
stored invalid snapshot as an operational error instead of silently dropping points.

### Step 5: Run focused and migration checks

Run:

```bash
npm test -- src/lib/server/codexResearchRepository.test.ts src/db/migrations/migrationCheck.test.ts
npx tsc --noEmit
```

Expected: PASS.

### Step 6: Commit

```bash
git add src/db/schema.ts drizzle src/lib/server/codexResearchRepository.ts src/lib/server/codexResearchRepository.test.ts
git commit -m "feat: persist monthly codex research"
```

## Task 3: Build the transactional monthly service

**Files:**

- Create: `src/lib/server/codexResearchService.ts`
- Create: `src/lib/server/codexResearchService.test.ts`

### Step 1: Write failing service tests

With a fake store, cover no active definition/no writes, one lock and one save for a multi-event batch, definition
validation before mutation, no save for nonmatching events, lazy activation only after a real change, stable personal
zero-progress view, existing personal progress view, exclusive end boundary, and propagated store failures.

Run: `npm test -- src/lib/server/codexResearchService.test.ts`

Expected: FAIL because the service does not exist.

### Step 2: Implement store-driven service and Drizzle adapters

Create a testable service over a narrow store interface, then export production `recordCodexResearchGameplayBatch`
and `readCodexResearchPersonalView`. Read and validate the season once per batch, lock once per user/season, evaluate
all sorted aggregate events, save once, and activate only after a state change. Personal reads must not create rows.

### Step 3: Run focused tests

Run: `npm test -- src/adventure/data/v2/codexResearch.test.ts src/lib/server/codexResearchRepository.test.ts src/lib/server/codexResearchService.test.ts`

Expected: PASS.

### Step 4: Commit

```bash
git add src/lib/server/codexResearchService.ts src/lib/server/codexResearchService.test.ts
git commit -m "feat: record personal monthly research"
```

## Task 4: Connect the independent monthly gameplay gate

**Files:**

- Modify: `src/lib/server/codexMasteryGameplay.ts`
- Modify: `src/lib/server/codexMasteryGameplay.test.ts`
- Modify only directly affected route/service mocks if TypeScript requires the expanded runtime contract.

### Step 1: Add failing gameplay-recorder tests

Prove:

- both gates off performs no validation or writes;
- permanent on/monthly off preserves existing behavior;
- permanent off/monthly on records the monthly aggregate once and returns no permanent results;
- both on writes permanent rows then one monthly batch with the same sorted aggregate;
- monthly failure propagates to the outer transaction;
- malformed events are rejected before either recorder writes.

Run: `npm test -- src/lib/server/codexMasteryGameplay.test.ts`

Expected: FAIL for the new monthly expectations.

### Step 2: Implement independent orchestration

Define a gameplay-level settings shape that includes `monthlyProgressEnabled` without expanding the lower permanent
recorder's settings contract. Add a monthly batch callback to the injectable runtime. Read settings once, aggregate
once, call the permanent recorder only when its gate is on, then call monthly once only when its gate is on.

### Step 3: Run focused integration tests

Run:

```bash
npm test -- src/lib/server/codexMasteryGameplay.test.ts src/lib/server/codexMasteryService.test.ts src/lib/server/fishingReelRoute.test.ts src/lib/server/huntRoute.test.ts src/app/api/v2/cooking/route.test.ts src/lib/server/lifeFieldProgress.test.ts
npx tsc --noEmit
```

Expected: PASS without changing route event payloads or permanent results.

### Step 4: Commit

```bash
git add src/lib/server/codexMasteryGameplay.ts src/lib/server/codexMasteryGameplay.test.ts
git add <only directly required mock updates>
git commit -m "feat: connect monthly codex gameplay progress"
```

## Task 5: Expose the gated personal season snapshot

**Files:**

- Modify: `src/adventure/data/v2/codexMasteryView.ts`
- Modify: `src/lib/server/codexMasterySnapshot.ts`
- Modify: `src/lib/server/codexMasterySnapshot.test.ts`
- Modify: `src/app/api/v2/me/codex-mastery/route.ts`
- Modify: `src/app/api/v2/me/codex-mastery/route.test.ts`

### Step 1: Write failing snapshot and route tests

Assert `monthlyResearch` is always explicit in an enabled mastery snapshot, monthly-disabled GET performs no monthly
read, monthly-enabled GET reads exactly once in parallel and returns either the no-season state or the authoritative
personal view, and unauthenticated/overview-disabled requests still return before all data reads.

Run: `npm test -- src/lib/server/codexMasterySnapshot.test.ts src/app/api/v2/me/codex-mastery/route.test.ts`

Expected: FAIL for the new contract.

### Step 2: Add the response type and route read

Keep the existing authenticated route and its uncached database behavior. Call `readCodexResearchPersonalView` only
when `monthlyProgressEnabled` is true and pass `null` otherwise. Do not add a mutation endpoint for progress.

### Step 3: Run focused tests

Run: `npm test -- src/lib/server/codexMasterySnapshot.test.ts src/app/api/v2/me/codex-mastery/route.test.ts`

Expected: PASS.

### Step 4: Commit

```bash
git add src/adventure/data/v2/codexMasteryView.ts src/lib/server/codexMasterySnapshot.ts src/lib/server/codexMasterySnapshot.test.ts src/app/api/v2/me/codex-mastery/route.ts src/app/api/v2/me/codex-mastery/route.test.ts
git commit -m "feat: expose personal monthly research"
```

## Task 6: Render all monthly goals in the mastery panel

**Files:**

- Modify: `src/adventure/v2/CodexMasteryPanel.tsx`
- Modify: `src/adventure/v2/CodexMasteryPanel.test.tsx`

### Step 1: Write failing UI tests

Assert monthly-disabled markup keeps the future notice, enabled/no-season markup shows a nonnumeric preparation state,
and an active season shows theme, KST period, score composition, completed count, and all 18 grouped goals. Assert it
does not show rank, expected trophy, settlement, gold/SP/item rewards, raw IDs, translucent content surfaces, or a
container-wide disabled opacity.

Run: `npm test -- src/adventure/v2/CodexMasteryPanel.test.tsx`

Expected: FAIL for the missing monthly card.

### Step 2: Implement the opaque monthly card

Render it after the permanent summary and before permanent category cards. Reuse the existing progress bar and
`SURFACE_*` tokens. Keep all goals visible and group labels stable. Remove only `월간 연구전` from the future notice
when its feature is enabled; rankings and trophies remain future notices until their own gates are enabled.

### Step 3: Run focused UI and safety tests

Run:

```bash
npm test -- src/adventure/v2/CodexMasteryPanel.test.tsx src/adventure/v2/V2CodexView.test.tsx src/components/safety/ContentSafetySurface.test.ts
npx eslint src/adventure/v2/CodexMasteryPanel.tsx src/adventure/v2/CodexMasteryPanel.test.tsx
```

Expected: PASS in light/dark markup.

### Step 4: Commit

```bash
git add src/adventure/v2/CodexMasteryPanel.tsx src/adventure/v2/CodexMasteryPanel.test.tsx
git commit -m "feat: show personal monthly research goals"
```

## Task 7: Prove PostgreSQL behavior and operational isolation

**Files:**

- Modify: `src/lib/server/codexMasteryPostgres.test.ts` or create a focused PostgreSQL test beside the service.
- Modify only implementation/tests required by verified defects.

### Step 1: Add PostgreSQL integration coverage

Against temporary PostgreSQL with migrations applied, insert a synthetic valid scheduled season and user, then prove
same-user concurrent monthly updates serialize without losing progress, the row remains under 20,000, status becomes
active, and an event exactly at `end_at` is excluded. Delete the synthetic database with the existing test harness;
do not insert anything into a real environment.

### Step 2: Run focused PostgreSQL and migration verification

Run the repository's established temporary PostgreSQL command/harness for the selected test, followed by:

```bash
npm test -- src/db/migrations/migrationCheck.test.ts
npm run check-images
npx tsc --noEmit
```

Expected: PASS, and PostgreSQL is stopped afterward.

### Step 3: Run the B8a focused suite

Run all tests touched in Tasks 1–7 plus existing ops-setting default/active tests and permanent mastery recorder tests.
Expected: PASS with every default flag still `false`.

### Step 4: Commit verified integration fixes

```bash
git add <B8a PostgreSQL test and only verified fixes>
git commit -m "test: verify monthly codex research persistence"
```

## Task 8: Final verification, self-review, and isolation audit

### Step 1: Run static and focused checks

```bash
git diff --check
npx tsc --noEmit
npx eslint <all changed TypeScript and TSX files>
npm run check-images
npm test -- <all B8a focused and adjacent regression files>
```

### Step 2: Run fresh broad checks

```bash
npm test -- --run
npm run build
```

Record exact pass/skip/fail counts. Do not call the bundle complete if a new failure remains unexplained.

### Step 3: Self-review the complete range

Review from the pre-B8a commit through `HEAD` for definition tampering, KST mistakes, score overflow, concurrency,
query bounds, data leakage, default-on behavior, accidental reward/economy coupling, UI surface violations, and missing
tests. Fix real findings with regression tests first and rerun affected verification.

### Step 4: Audit unpublished/deployment isolation

Confirm:

- every codex feature default is still `false`;
- no real season row/seed, flag change, backfill, deployment, push, merge, or maintenance action occurred;
- the deployment checkout contains none of the B8a symbols or migration;
- this worktree is clean on `feat/codex-mastery-gameplay-integration-20260820` and remains ready for the user's later
  unpublished-work squash.

### Step 5: Final commit if review fixes exist

Commit only the reviewed B8a changes. Do not squash yet and do not offer merge/deploy actions unless the user asks.

