# Codex Mastery Trophy Cabinet B6 Implementation Plan

> **Execution note:** Follow the repository TDD and verification rules. Keep `trophiesEnabled` defaulted to
> `false`; do not deploy, enable flags, or apply production rebuilds.

**Goal:** Persist non-revocable codex mastery trophy promotions, extend trophy presentation to platinum and
diamond, and connect mastery trophies to the existing cabinet and three profile showcase slots.

**Architecture:** A pure trophy evaluator turns the production catalog, per-entry mastery progress, and prior
trophy history into monotonic family states. A dedicated PostgreSQL history table persists only earned tiers;
locked progress remains derived. The central recorder reconciles trophies only after a count-tier promotion and
inside the caller's transaction. A separate idempotent dry-run/apply rebuild covers historical progress. The
existing profile showcase route merges achievement and mastery trophy options behind `trophiesEnabled`.

**Stack:** TypeScript, React 19, Next.js 16.2 App Router route handlers, Drizzle/PostgreSQL, Vitest.

---

## Task 1: Trophy domain and six-tier presentation contract

**Files:**

- Create: `src/adventure/data/v2/codexMasteryTrophies.ts`
- Create: `src/adventure/data/v2/codexMasteryTrophies.test.ts`
- Modify: `src/adventure/data/v2/v2Quests.ts`

1. Write failing tests for the seven stable family definitions and tier ordering.
2. Write boundary tests for 25%, 50%, all-entry gold, gold-gated platinum/diamond, and all-entry legendary.
3. Write tests for multi-tier promotion, reconstructed timestamps, and preserving higher prior history when a
   larger catalog lowers current completion ratios.
4. Run the focused test and confirm RED because the evaluator does not exist.
5. Implement shared six-tier types, definitions, pure evaluation, progress descriptions, and monotonic history
   merge. Extend `AchievementBadgeTier` to accept platinum and diamond without changing existing quest data.
6. Run the focused test and commit.

## Task 2: Trophy history schema and migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: `drizzle/0170_codex_mastery_trophy_history.sql`
- Modify: `drizzle/meta/_journal.json`
- Create or update: `drizzle/meta/0170_snapshot.json`
- Modify: `src/db/codexMasterySchema.test.ts`
- Modify: `src/db/migrationJournal.test.ts`

1. Add failing schema tests for the composite key, cascade foreign key, kind/tier fields, JSON history,
   catalog version, nullable season metadata, and user/kind/tier index.
2. Add the Drizzle table and generate the next migration/snapshot with the repository's migration workflow.
3. Confirm migration checks and schema tests pass; inspect generated SQL for unrelated changes.
4. Commit schema and migration together.

## Task 3: PostgreSQL trophy repository and reconciliation

**Files:**

- Create: `src/lib/server/codexMasteryTrophyRepository.ts`
- Create: `src/lib/server/codexMasteryTrophyRepository.test.ts`
- Modify: `src/lib/server/codexMasteryRepository.ts`

1. Write failing adapter tests for parsing rows, reading a user's history, locking the user's mastery summary,
   reading authoritative progress, and monotonic upserts.
2. Implement `readCodexMasteryTrophyHistory` and `reconcileCodexMasteryTrophies`.
3. Make reconciliation keep stored tiers/timestamps, write only changed families, and surface all database errors.
4. Expose an optional reconciliation hook from the central store so pure service tests remain lightweight.
5. Run focused repository tests and commit.

## Task 4: Central recorder integration

**Files:**

- Modify: `src/lib/server/codexMasteryService.ts`
- Modify: `src/lib/server/codexMasteryService.test.ts`
- Modify: `src/lib/server/codexMasteryGameplay.test.ts`
- Modify: `src/lib/server/codexMasteryPostgres.test.ts`
- Modify settings fixtures that construct `CodexMasteryRecordingSettings`

1. Add `trophiesEnabled` to the recording settings contract and update fixtures explicitly to `false` unless the
   test exercises trophies.
2. Add RED tests proving no trophy store access while disabled or on unchanged/discovery-only records.
3. Add RED tests proving a count-tier promotion reconciles after progress save, returns grouped trophy promotions,
   and propagates reconciliation failure.
4. Implement the conditional post-save hook. Keep it in the existing transaction executor.
5. Add a real PostgreSQL case that verifies progress, summary, and trophy history commit together.
6. Run focused service/gameplay/PostgreSQL tests and commit.

## Task 5: Historical trophy rebuild

**Files:**

- Create: `src/lib/server/codexMasteryTrophyRebuild.ts`
- Create: `src/lib/server/codexMasteryTrophyRebuild.test.ts`
- Create: `src/lib/server/codexMasteryTrophyRebuildCli.ts`
- Create: `src/lib/server/codexMasteryTrophyRebuildCli.test.ts`
- Create: `scripts/rebuild-codex-mastery-trophies.ts`
- Modify: `package.json`

1. Write failing tests for user enumeration from both progress and existing trophy rows, deterministic batching,
   dry-run without writes, apply in a transaction, and idempotent reruns.
2. Implement a runtime-injected rebuild core and a production Drizzle adapter.
3. Implement CLI parsing with explicit `--dry-run` or `--apply`, batch size, and resume cursor. Default to dry-run
   when invoked through the package script without an apply flag.
4. Report scanned users, changed families, promotions, and next cursor. Never mutate feature flags.
5. Run focused tests and commit.

## Task 6: Profile showcase model and route

**Files:**

- Modify: `src/adventure/profile/profileShowcase.ts`
- Modify: `src/adventure/profile/profileShowcase.test.ts`
- Modify: `src/app/api/v2/me/profile-showcase/route.ts`
- Modify: `src/lib/server/profileShowcaseRoute.test.ts`
- Create: `src/lib/server/codexMasteryTrophyView.ts`
- Create: `src/lib/server/codexMasteryTrophyView.test.ts`

1. Add parser RED tests for `{ kind: "masteryTrophy", trophyId }`, length limits, slot migration, and duplicate
   serialization.
2. Add view-builder tests for seven family cards, locked next progress, earned current tier/history, and stable IDs.
3. Add route RED tests for flag-off backward compatibility, merged options when enabled, owned selection saves,
   unknown/unowned rejection, and preservation of a stored selection while disabled.
4. Implement the parser, view builder, settings/history/progress reads, option merge, and POST ownership checks.
5. Keep existing achievement/title/equipment behavior unchanged and commit.

## Task 7: Unified trophy cabinet UI

**Files:**

- Modify: `src/adventure/v2/V2TrophyCabinetView.tsx`
- Modify: `src/adventure/v2/V2TrophyCabinetView.test.tsx`
- Modify: `src/app/dev/trophy-cabinet/page.tsx`

1. Add rendering RED tests for platinum and diamond labels/styles, achievement/mastery kinds, category and tier
   filters, search, locked next-step progress, promotion history, and mastery profile selection payloads.
2. Refactor the option contract into a discriminated presentation shape while accepting the route response.
3. Add compact wrapping filters and search. Preserve the 2/3/4-column responsive grid.
4. Use only opaque shared surface tokens for content containers. Do not apply opacity to locked cards.
5. Use `motion-safe` effects for legendary decoration and a static reduced-motion result.
6. Update dev preview data, run focused component tests, and commit.

## Task 8: Final integration and verification

**Files:**

- Modify only files required by failures attributable to B6.

1. Run all B6-focused unit and route/component tests.
2. Start the isolated local PostgreSQL fixture, apply migrations, and run the codex mastery PostgreSQL integration
   tests. Stop PostgreSQL after the run.
3. Run `npm run check:migrations`, `npx tsc --noEmit`, focused ESLint, `npm run check-images`, and `npm run build`.
4. Run the full Vitest suite once. Diagnose and fix only B6 regressions; record unrelated pre-existing failures.
5. Inspect `git diff --check`, branch status, default ops settings, and the deployment checkout. Confirm Phase A/B6
   remain absent there and no deployment, flag enablement, push, or real rebuild occurred.
6. Perform a final self-review for authorization, data monotonicity, transactional integrity, UI surfaces, and scope.
7. Commit any verified final fixes separately and report the remaining roadmap stage (B7 housing display).
