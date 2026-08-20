# Codex Mastery Publication B10 Implementation Plan

> **Execution:** Use `superpowers:executing-plans` inline. The repository forbids unrequested subagents, so execute each task locally with its review checkpoint.

**Goal:** Add an explicit, idempotent publication boundary for closed monthly codex research seasons, expose only published seasons in a permanent Hall of Fame, deliver personal trophy notifications and diamond/legendary feed honors, and add read-only release checks without enabling or deploying anything.

**Architecture:** Persist season publication time separately from settlement and keep a per-user, per-channel publication ledger. Publish honors in a caller-owned transaction after trophies exist. Read archive ranks from immutable final rank/tier columns, never by recomputing. Gate public APIs behind existing flags and add an isolated rankings panel. Finish with a static verifier and operations runbook.

**Tech Stack:** TypeScript, Next.js 16.2 Route Handlers and Client Components, React, Drizzle ORM, PostgreSQL 16, Vitest, Node.js release-check script.

## Global Constraints

- Do not deploy, push, merge, enable flags, run a backfill, schedule a real season, settle a real season, award real trophies, or publish real honors.
- All codex feature defaults remain `false`; add no new feature flag unless an existing flag cannot express the boundary.
- `publishedAt` is the sole public-archive boundary. `closed` alone is not public.
- A published season is immutable even when it produced zero trophy rows.
- Personal notifications cover every non-null final tier. Feed/ticker honors cover only `diamond` and `legendary` and obey `feedEnabled`.
- No SP, combat stats, gold, items, achievement score, permanent mastery score, cron, or production season definitions.
- Public cards and panels use opaque surface tokens and never whole-card opacity.
- Read the repository-local Next.js guide before each new Route Handler or Client Component family; the B9 route/client guides already read in this session remain applicable.

---

### Task 1: Publication Schema and Public-Season Immutability

**Files:**
- Create: `drizzle/0173_codex_research_publication.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `src/db/schema.ts`
- Modify: `src/lib/server/codexResearchRepository.ts`
- Modify: `src/lib/server/codexResearchRepository.test.ts`
- Modify: `src/lib/server/codexResearchOpsRepository.ts`
- Modify: `src/lib/server/codexResearchOpsRepository.test.ts`
- Modify: `src/lib/server/codexResearchOps.ts`
- Modify: `src/lib/server/codexResearchOps.test.ts`
- Modify: B8/B9 season-state fixtures identified by TypeScript

**Interfaces:**
- Adds `codexResearchSeasons.publishedAt`.
- Adds `codexResearchPublications` keyed by `(seasonId, userId, channel)` where channel is `notification | feed`.
- Extends `CodexResearchSeasonState` with `publishedAt: Date | null`.
- Produces `markCodexResearchSeasonPublished(executor, seasonId, publishedAt)` and prevents `markCodexResearchSeasonResettling` on published rows.
- Extends the operations summary with `publishedAt`; a non-closed published row is reported inconsistent.
- Rejects resettlement at both the service boundary and the guarded repository update, before trophy-count logic.

- [ ] Write failing repository and operations tests for parsing/cloning `publishedAt`, first publish preserving one timestamp, repeat publish returning the stored timestamp, operations-summary parsing, inconsistent non-closed publication, service-level immutable rejection, and resettling requiring `closed AND published_at IS NULL`.
- [ ] Run `npm test -- src/lib/server/codexResearchRepository.test.ts` and observe RED.
- [ ] Add the migration/schema and minimal repository functions. Migration-generated/static schema work is not itself TDD-able; repository behavior remains regression-first.
- [ ] Run repository tests, `npx tsc --noEmit`, focused ESLint, and `npm run check-migrations`.
- [ ] Commit as `feat: persist codex research publication state`.

### Task 2: Immutable Archive Contracts and Repository

**Files:**
- Create: `src/adventure/data/v2/codexResearchArchive.ts`
- Create: `src/adventure/data/v2/codexResearchArchive.test.ts`
- Create: `src/lib/server/codexResearchArchive.ts`
- Create: `src/lib/server/codexResearchArchive.test.ts`

**Interfaces:**
- Produces `CodexResearchArchiveSeason`, `CodexResearchArchiveRow`, and `CodexResearchArchiveResponse`.
- Produces `readCodexResearchArchive(executor, { viewerUserId, seasonId?, now, topLimit?, neighborRadius? })`.
- Archive rows use stored `finalRank` and `finalTier`; they include current public name/avatar/cosmetics, score components, `mine`, and `firstPlaceEngraving`.

- [ ] Write failing pure tests for strict tier/rank/score/date parsing and response cloning.
- [ ] Write failing repository tests proving only `closed + publishedAt` seasons are listed, explicit unpublished IDs return `no_season`, final rank gaps survive blocked/nameless rows, top 50 and viewer neighbors are selected without `ROW_NUMBER()`, and malformed rows fail closed.
- [ ] Run both tests and observe RED.
- [ ] Implement the minimal pure parser and read-only repository. Use explicit epoch output for raw timestamp SQL so server timezone cannot shift publication dates.
- [ ] Run GREEN, `npx tsc --noEmit`, and focused ESLint.
- [ ] Commit as `feat: read published codex research archives`.

### Task 3: Public Archive API and Hall-of-Fame UI

**Files:**
- Create: `src/app/api/rankings/codex-research/archive/route.ts`
- Create: `src/app/api/rankings/codex-research/archive/route.test.ts`
- Create: `src/adventure/rankings/useCodexResearchArchive.ts`
- Create: `src/adventure/rankings/useCodexResearchArchive.test.ts`
- Create: `src/adventure/rankings/CodexResearchArchivePanel.tsx`
- Create: `src/adventure/rankings/CodexResearchArchivePanel.test.tsx`
- Modify: `src/adventure/rankings/RankingsView.tsx`
- Modify: `src/adventure/rankings/RankingsView.test.tsx`

**Interfaces:**
- GET requires authentication, then both `monthlyRankingVisible` and `trophiesEnabled`; a disabled response performs no archive query.
- Optional `seasonId=YYYY-MM`; missing selects latest published season.
- Adds the fifth `명예의 전당` codex ranking view.

- [ ] Write failing route tests for auth, dual early flag gates, invalid season ID before repository access, latest/explicit success, and no published season.
- [ ] Write failing parser/hook tests for closed envelopes and malformed data.
- [ ] Write failing SSR tests for season selection, fixed-rank/tier wording, first-place engraving, mine/nearby, disabled/empty/error states, and opaque surfaces.
- [ ] Implement route, hook, panel, and rankings wiring. Do not reuse the active-ranking “잠정” labels.
- [ ] Run all Task 3 tests plus active monthly ranking regressions, typecheck, and focused ESLint.
- [ ] Commit as `feat: add codex research hall of fame`.

### Task 4: Idempotent Personal and Feed Honor Publication

**Files:**
- Modify: `src/lib/v2-notification-config.ts`
- Modify: `src/lib/v2-notification-config.test.ts`
- Modify: `src/lib/feed-config.ts`
- Modify: `src/lib/feed-config.test.ts`
- Modify: `src/adventure/v2/V2NotificationsView.tsx`
- Modify: `src/adventure/v2/NotificationBell.tsx`
- Modify/Add: focused notification rendering tests
- Modify: `src/adventure/log/ServerFeedView.tsx`
- Modify: `src/adventure/v2/WarTicker.tsx`
- Modify: `src/adventure/v2/WarTicker.test.ts`
- Create: `src/lib/server/codexResearchPublication.ts`
- Create: `src/lib/server/codexResearchPublication.test.ts`

**Interfaces:**
- Adds notification type `codex_research_trophy` with `{ seasonId, themeName, tier, finalRank, score }`.
- Adds feed type `codex_research_result` with the same payload and includes it in `WAR_FEED_TYPES`.
- Produces `publishCodexResearchSeasonHonors(executor, { seasonId, now, feedEnabled })` and an injectable factory.

- [ ] Write failing config/rendering tests for exact Korean tier/result text and ticker inclusion; assert bronze/gold never become feed publications.
- [ ] Write failing publisher tests proving lock → trophy verification → missing notification markers/writes → optional diamond/legendary feed markers/writes → season publish. Cover zero finalists, partial rerun after feed disabled, concurrent-safe existing markers, trophy mismatch rejection, and write failure before `publishedAt`.
- [ ] Run RED.
- [ ] Implement typed payloads/renderers and a transaction-only publication runtime. Insert publication markers and actual channel rows using the same executor; do not call global side-effect helpers.
- [ ] Run GREEN plus notification/feed regression suites, typecheck, and focused ESLint.
- [ ] Commit typed clients as `feat: display codex research honor notices` and server publication as `feat: publish codex research season honors`.

### Task 5: Super-Admin Publish Operation

**Files:**
- Modify: `src/app/api/admin/codex-research-seasons/route.ts`
- Modify: `src/app/api/admin/codex-research-seasons/route.test.ts`
- Modify: `src/admin/displayLabels.ts`
- Modify: `src/admin/tabs/CodexResearchSeasonOps.tsx`
- Modify: `src/admin/tabs/CodexResearchSeasonOps.test.tsx`

**Interfaces:**
- Adds `publish-honors` with exact confirmation `PUBLISH {seasonId}`.
- Requires `super`, `settlementEnabled`, and `trophiesEnabled`; passes `feedEnabled` to the transaction service.
- Audits only season ID, status, and created/existing channel counts.
- Adds stable `trophies_not_published` and `season_already_published` operation error mappings without leaking trophy rows.

- [ ] Extend route tests first for inherited op rejection, confirmation mismatch before settings/DB, dual required flags, feed-disabled personal-only publication, full success transaction, stable errors, and safe audit details.
- [ ] Extend component SSR tests for `PUBLISH` guidance, published-state display, immutable resettle controls, feed-disabled warning, and no controls in read-only mode.
- [ ] Run RED.
- [ ] Implement route/UI wiring without changing any flag. Refresh state after success.
- [ ] Run GREEN, adjacent admin tests, typecheck, and focused ESLint.
- [ ] Commit as `feat: operate codex research publication`.

### Task 6: Read-Only Launch Check and Operations Runbook

**Files:**
- Create: `scripts/check-codex-mastery-release.mjs`
- Modify: `package.json`
- Create: `docs/operations/codex-mastery-launch-runbook.md`

**Interfaces:**
- Adds `npm run check:codex-mastery-release`.
- The script reads repository files only and exits nonzero on violated static invariants.

- [ ] Implement the static checker for all-false defaults, required B10 migration/routes/UI, exact publish confirmation, and absence of codex cron/production season definition files. TDD is skipped because this is a small static repository verifier; verify it directly and by temporarily testing its pure failure probes if exposed.
- [ ] Write a staged runbook with explicit “no automatic deploy/flag/season/publication” warnings, preflight SQL/read checks, B9 preview/settle/award/publish order, rollback boundaries, and post-release observations.
- [ ] Run the new check, migration/image checks, and focused docs/script lint if configured.
- [ ] Commit as `chore: add codex mastery release checks`.

### Task 7: PostgreSQL Publication Integration and Final Verification

**Files:**
- Modify: `src/lib/server/codexMasteryPostgres.test.ts`

- [ ] Extend the disposable PostgreSQL test: settle and award a test-only season; prove unpublished archive absence; publish with feed disabled and see personal notifications/archive; rerun with feed enabled and add only diamond/legendary feeds; repeat without duplicates; reject resettle; force a publication failure/outer rollback; verify ledger, notifications, feed, and `publishedAt` all roll back together.
- [ ] Run the PostgreSQL test on a disposable PostgreSQL 16 cluster under `/tmp`, then stop it and remove only that directory.
- [ ] Run all B10/B9/B8 focused tests, `npx tsc --noEmit`, focused ESLint, `npm run check-migrations`, `npm run check-images`, and `npm run check:codex-mastery-release`.
- [ ] Run fresh `npm test` and `npm run build`.
- [ ] Confirm all feature defaults are false, no deployment/cron/real season file changed, the deployment checkout is untouched except pre-existing user work, and Phase A/gameplay commits are absent from the deployment branch.
- [ ] Commit integration coverage as `test: verify codex research publication in postgres` if changed.
