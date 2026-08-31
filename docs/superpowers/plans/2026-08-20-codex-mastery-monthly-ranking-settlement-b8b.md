# Codex Mastery Monthly Ranking, Settlement, and Trophy (B8b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gated current monthly codex ranking, immutable end-of-season settlement, separately publishable seasonal trophies, and reuse the existing trophy display surfaces without scheduling or publishing a real season.

**Architecture:** Keep pure tier and response contracts outside the database, calculate official live ranks in one SQL query, and settle a season under its row lock inside a caller-owned transaction. Persist final rank/tier first, then award `research:{seasonId}` trophy rows in a separate idempotent operation so B9 can run a private score-only trial before B10 publishes trophies.

**Tech Stack:** TypeScript, React 19, Next.js 16.2 Route Handlers, Drizzle ORM 0.45, PostgreSQL 16, Vitest 4, Tailwind 4 surface tokens.

## Global Constraints

- Work only in `/tmp/test-adventure-codex-mastery-gameplay` on `feat/codex-mastery-gameplay-integration-20260820`.
- Design source: `docs/superpowers/specs/2026-08-20-codex-mastery-monthly-ranking-settlement-b8b-design.md`.
- Keep `monthlyProgressEnabled`, `monthlyRankingVisible`, `settlementEnabled`, and `trophiesEnabled` defaulted to `false`.
- Do not schedule a real season, run settlement or trophy award against any shared database, activate flags, backfill, deploy, push, merge, or squash.
- Monthly rewards remain cosmetic records only: no SP, combat stats, gold, item, achievement-score, or permanent-mastery changes.
- Official ties are score, completed objectives, diversity score, record score, score-reached time, then user ID.
- Viewer block filtering happens after official rank assignment.
- Route changes follow `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`; dynamic database GET handlers remain uncached.
- All new or changed content cards use `SURFACE_CARD`, `SURFACE_INSET`, or `SURFACE_ACCENT`; never use whole-card opacity for locked states.
- New behavior follows RED → GREEN → REFACTOR. Generated Drizzle migration metadata is the only TDD exception.
- Do not create subagents; the repository instructions require inline execution.

---

### Task 1: Pure Monthly Rank and Seasonal Trophy Contracts

**Files:**
- Create: `src/adventure/data/v2/codexResearchRanking.ts`
- Create: `src/adventure/data/v2/codexResearchRanking.test.ts`
- Modify: `src/adventure/data/v2/codexMasteryTrophies.ts`
- Modify: `src/adventure/data/v2/codexMasteryTrophies.test.ts`

**Interfaces:**
- Produces: `CodexResearchTier`, `codexResearchTierFor(score, rank)`, `CodexResearchRankingRow`, `CodexResearchRankingResponse`, `CodexResearchSeasonTrophyMetadata`, `CodexResearchSeasonTrophyHistory`, `CodexResearchTrophyId`, `isCodexTrophyId()`, and `codexTrophyDisplayCategory()`.
- Keeps: permanent `CodexMasteryTrophyKind`, `CodexMasteryTrophyId`, and evaluator contracts unchanged.
- Adds: `CodexTrophyKind = CodexMasteryTrophyKind | "research_season"` and `CodexTrophyId = CodexMasteryTrophyId | CodexResearchTrophyId`.

- [ ] **Step 1: Write failing tier-boundary and ID tests**

Cover every score boundary, rank 1/3/4/10/11, no-rank behavior, unsafe values, and stable IDs:

```ts
expect(codexResearchTierFor(3_999, 1)).toBeNull();
expect(codexResearchTierFor(4_000, 999)).toBe("bronze");
expect(codexResearchTierFor(16_000, 10)).toBe("diamond");
expect(codexResearchTierFor(16_000, 11)).toBe("platinum");
expect(codexResearchTierFor(17_999, 3)).toBe("diamond");
expect(codexResearchTierFor(18_000, 3)).toBe("legendary");
expect(codexResearchTierFor(20_000, null)).toBe("platinum");
expect(() => codexResearchTierFor(-1, 1)).toThrow();
expect(isCodexTrophyId("research:2026-08")).toBe(true);
expect(codexTrophyDisplayCategory("research:2026-08")).toBe("research");
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- src/adventure/data/v2/codexResearchRanking.test.ts src/adventure/data/v2/codexMasteryTrophies.test.ts
```

Expected: FAIL because the new module and research trophy contracts do not exist.

- [ ] **Step 3: Implement the minimal pure contracts**

Use the exact tier order from the design and validate `score` as an integer from 0 through 20,000 and `rank` as NULL or a positive safe integer. Accept research trophy IDs only when the suffix is a valid `YYYY-MM` with year at least 2000.

```ts
export function codexResearchTierFor(
  score: number,
  rank: number | null,
): CodexResearchTier {
  assertScoreAndRank(score, rank);
  if (score >= 18_000 && rank !== null && rank <= 3) return "legendary";
  if (score >= 16_000 && rank !== null && rank <= 10) return "diamond";
  if (score >= 16_000) return "platinum";
  if (score >= 12_000) return "gold";
  if (score >= 8_000) return "silver";
  if (score >= 4_000) return "bronze";
  return null;
}
```

Define seasonal metadata with the exact immutable fields from the design and a `firstPlaceEngraving: boolean` that is true only for final rank 1.

- [ ] **Step 4: Run GREEN and refactor**

Run the Task 1 tests again. Keep permanent trophy definitions at seven families and ensure their tests remain unchanged except for the new generic-ID assertions.

- [ ] **Step 5: Commit**

```bash
git add src/adventure/data/v2/codexResearchRanking.ts src/adventure/data/v2/codexResearchRanking.test.ts src/adventure/data/v2/codexMasteryTrophies.ts src/adventure/data/v2/codexMasteryTrophies.test.ts
git commit -m "feat: define monthly codex ranking rules"
```

### Task 2: Settlement Schema and Repository Primitives

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/lib/server/codexResearchRepository.ts`
- Modify: `src/lib/server/codexResearchRepository.test.ts`
- Modify: `src/lib/server/codexMasteryTrophyRepository.ts`
- Modify: `src/lib/server/codexMasteryTrophyRepository.test.ts`
- Generate: `drizzle/0172_codex_research_settlement.sql`
- Generate: `drizzle/meta/0172_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Produces: `lockCodexResearchSeasonForSettlement()`, `writeCodexResearchFinalResults()`, `closeCodexResearchSeason()`, `readCodexResearchFinalists()`, `readCodexResearchTrophyHistory()`, and `writeCodexResearchTrophyHistory()`.
- Changes schema `codexTrophyHistory.trophyKind` to `CodexTrophyKind` and permits `research_season`.
- Adds a partial unique index on `(season_id, final_rank)` where `final_rank IS NOT NULL`.
- Permanent `readCodexMasteryTrophyHistory()` explicitly filters `mastery_category` and `mastery_overall`.

- [ ] **Step 1: Write failing repository-contract tests**

Add adapter tests that assert:

```ts
expect(sqlText).toContain("FOR UPDATE");
expect(permanentReadKinds).toEqual(["mastery_category", "mastery_overall"]);
expect(researchHistory.trophyId).toBe("research:2026-08");
expect(researchHistory.seasonMetadata.finalRank).toBe(1);
```

Malformed final rank/tier combinations, mismatched `research:{seasonId}`, malformed timestamps, and inconsistent first-place engraving must throw rather than be repaired.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/lib/server/codexResearchRepository.test.ts src/lib/server/codexMasteryTrophyRepository.test.ts
```

Expected: FAIL because settlement and seasonal history functions are absent.

- [ ] **Step 3: Implement repository primitives**

Keep settlement writes transaction-only. `writeCodexResearchFinalResults()` first NULLs final fields for the target season, then writes each `{ userId, finalRank, finalTier }`. `closeCodexResearchSeason()` updates only a `settling` row. Seasonal trophy writes use `onConflictDoNothing()` and read back the existing row; identical content is an idempotent no-op, different content throws `codex research trophy result conflicts with stored history`.

The permanent reader must include:

```ts
.where(and(
  eq(codexTrophyHistory.userId, userId),
  inArray(codexTrophyHistory.trophyKind, [
    "mastery_category",
    "mastery_overall",
  ]),
))
```

- [ ] **Step 4: Run GREEN**

Run the Task 2 tests and the existing trophy evaluation/view tests.

- [ ] **Step 5: Generate and inspect migration 0172**

```bash
npx drizzle-kit generate --name codex_research_settlement
node scripts/check-migrations.mjs
```

Inspect the SQL. It must only expand the trophy-kind check and add the partial final-rank unique index. It must not recreate, truncate, seed, or update data tables.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/lib/server/codexResearchRepository.ts src/lib/server/codexResearchRepository.test.ts src/lib/server/codexMasteryTrophyRepository.ts src/lib/server/codexMasteryTrophyRepository.test.ts drizzle
git commit -m "feat: persist monthly codex settlement results"
```

### Task 3: Official Current-Season Ranking Query

**Files:**
- Create: `src/lib/server/codexResearchRanking.ts`
- Create: `src/lib/server/codexResearchRanking.test.ts`
- Create: `src/lib/server/codexResearchRanking.integration.test.ts`

**Interfaces:**
- Consumes: `readCurrentCodexResearchSeason()`, `codexResearchTierFor()`, `getAdminEmailsList()` caller input.
- Produces: `readCodexResearchRanking(executor, { viewerUserId, adminEmails, now, topLimit?, neighborRadius? })`.

- [ ] **Step 1: Write failing query-shape and normalization tests**

The fake executor test must prove the SQL ranks before block filtering and uses all tie fields:

```ts
expect(normalizedSql.indexOf("ROW_NUMBER() OVER")).toBeLessThan(
  normalizedSql.indexOf("user_blocks"),
);
for (const token of [
  "score DESC",
  "objective_completed_count DESC",
  "diversity_score DESC",
  "record_score DESC",
  "score_reached_at ASC NULLS LAST",
  "user_id ASC",
]) expect(normalizedSql).toContain(token);
```

Assert malformed names, ranks, scores, tiers, avatars, and components are rejected. Assert bounded top/nearby options and `mine` behavior.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/lib/server/codexResearchRanking.test.ts
```

- [ ] **Step 3: Implement the one-query ranking reader**

Use CTEs in this order: `eligible`, `ranked`, `visible`, `viewer_rank`. `eligible` applies name, ban-at-`now`, admin email, score, and season filters. `ranked` assigns official rank. `visible` applies the viewer block exclusion while always retaining the viewer. Return `{ status: "no_season" }` or active season metadata plus `list`, `nearby`, and `me`.

- [ ] **Step 4: Add PostgreSQL integration coverage**

Use the existing `CODEX_MASTERY_POSTGRES_TEST_DATABASE_URL` convention. Insert named eligible users, an admin, a banned user, and a blocked user. Prove the blocked user's official rank remains a gap rather than renumbering visible rows.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm test -- src/lib/server/codexResearchRanking.test.ts
git add src/lib/server/codexResearchRanking.ts src/lib/server/codexResearchRanking.test.ts src/lib/server/codexResearchRanking.integration.test.ts
git commit -m "feat: query monthly codex rankings"
```

### Task 4: Immutable Settlement Service

**Files:**
- Create: `src/lib/server/codexResearchSettlement.ts`
- Create: `src/lib/server/codexResearchSettlement.test.ts`
- Modify: `src/lib/server/codexMasteryPostgres.test.ts`

**Interfaces:**
- Produces: `createCodexResearchSettlement(runtime)` for unit tests and `settleCodexResearchSeason(executor, input)` for Drizzle.
- Input: `{ seasonId: string; now: Date; adminEmails: readonly string[] }`.
- Output: `{ status: "settled"; seasonId; participantCount; tierCounts } | { status: "already_closed"; seasonId }`.

- [ ] **Step 1: Write failing service tests**

Cover:

```ts
await expect(settle({ now: beforeEnd })).rejects.toThrow("season has not ended");
expect(await settle({ now: atEnd })).toMatchObject({
  status: "settled",
  participantCount: 12,
  tierCounts: { legendary: 3, diamond: 7 },
});
expect(runtime.calls).toEqual([
  "lock-season",
  "mark-settling",
  "rank-finalists",
  "write-results",
  "close-season",
]);
```

Also test closed idempotency, invalid/scheduled-with-no-participant completion, `settling` resumption, exclusion passthrough, and a write failure that prevents `close-season`.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/lib/server/codexResearchSettlement.test.ts
```

- [ ] **Step 3: Implement minimal orchestration**

The service validates the locked definition and window, computes each final tier from the already ordered finalist list, writes all final results, then closes. It never writes trophy history.

- [ ] **Step 4: Extend PostgreSQL integration**

Apply migration 0172 in the isolated schema. Start two concurrent transactions settling the same ended season and assert exactly one `settled` result, one `already_closed` result, unique final ranks, fixed tiers, and one closed timestamp. Force a transaction rollback after settlement and prove final results and season state roll back together.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm test -- src/lib/server/codexResearchSettlement.test.ts
git add src/lib/server/codexResearchSettlement.ts src/lib/server/codexResearchSettlement.test.ts src/lib/server/codexMasteryPostgres.test.ts
git commit -m "feat: settle monthly codex seasons"
```

### Task 5: Separately Publish Seasonal Trophies

**Files:**
- Create: `src/lib/server/codexResearchTrophies.ts`
- Create: `src/lib/server/codexResearchTrophies.test.ts`
- Modify: `src/lib/server/codexMasteryTrophyView.ts`
- Modify: `src/lib/server/codexMasteryTrophyView.test.ts`
- Modify: `src/lib/server/codexMasteryPostgres.test.ts`

**Interfaces:**
- Produces: `awardCodexResearchSeasonTrophies()`, `buildCodexResearchTrophyOptions()`, and combined display helpers.
- Seasonal trophy publication consumes only `closed` season rows with stored `finalRank` and `finalTier`.

- [ ] **Step 1: Write failing award and view tests**

Assert open seasons are rejected, sub-bronze finalists create no row, repeat award returns zero created rows, and stored conflicts fail. Assert metadata contains exact final values and `firstPlaceEngraving` only for rank 1.

For the view:

```ts
expect(option).toMatchObject({
  id: "research:2026-08",
  kind: "research",
  category: "research",
  title: "강과 호수의 달",
  badgeTier: "legendary",
  unlocked: true,
  season: { seasonId: "2026-08", finalRank: 1, score: 19_000 },
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- src/lib/server/codexResearchTrophies.test.ts src/lib/server/codexMasteryTrophyView.test.ts
```

- [ ] **Step 3: Implement award and display mapping**

Keep publication transaction-only. Build metadata from final progress and the immutable season definition. Extend the common trophy option with `kind: "research"` and optional validated season detail, but do not change the seven permanent family evaluations.

- [ ] **Step 4: Add PostgreSQL idempotency test**

Settle a fixture season, call award twice, and assert one `research:{seasonId}` row per eligible tiered user. Ensure permanent history reads still return only permanent rows.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm test -- src/lib/server/codexResearchTrophies.test.ts src/lib/server/codexMasteryTrophyView.test.ts
git add src/lib/server/codexResearchTrophies.ts src/lib/server/codexResearchTrophies.test.ts src/lib/server/codexMasteryTrophyView.ts src/lib/server/codexMasteryTrophyView.test.ts src/lib/server/codexMasteryPostgres.test.ts
git commit -m "feat: award monthly codex trophies"
```

### Task 6: Trophy Cabinet, Profile, and Housing Reuse

**Files:**
- Modify: `src/adventure/v2/V2TrophyCabinetView.tsx`
- Modify: `src/adventure/v2/V2TrophyCabinetView.test.tsx`
- Modify: `src/app/api/v2/me/profile-showcase/route.ts`
- Modify: `src/lib/server/profileShowcaseRoute.test.ts`
- Modify: `src/adventure/data/v2/housing.ts`
- Modify: `src/adventure/data/v2/housing.test.ts`
- Modify: `src/lib/server/housing.ts`
- Modify: `src/lib/server/housing.test.ts`
- Modify: `src/app/api/v2/me/housing/route.ts`
- Modify: `src/app/api/v2/player/[name]/housing/route.ts`
- Modify: `src/lib/server/housingRoute.test.ts`
- Modify: relevant public profile response tests that consume `ProfileMasteryTrophyDisplay`

**Interfaces:**
- Consumes: combined permanent plus seasonal trophy history/options from Task 5.
- Keeps: stored profile and housing selection kind `{ kind: "masteryTrophy", trophyId }`.
- Adds: housing display category `research`, eligible only on `record_shelf`.

- [ ] **Step 1: Write failing surface tests**

Prove the cabinet exposes `업적 / 도감 숙련 / 월간 연구`, seasonal details are opaque and searchable, and selection returns the existing `masteryTrophy` shape. Prove profile POST accepts only an owned seasonal trophy. Prove a `research:2026-08` housing trophy is accepted on `record_shelf`, rejected on unrelated furniture, survives feature-off preservation, and is visible to visitors only when selected.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/adventure/v2/V2TrophyCabinetView.test.tsx src/lib/server/profileShowcaseRoute.test.ts src/adventure/data/v2/housing.test.ts src/lib/server/housing.test.ts src/lib/server/housingRoute.test.ts
```

- [ ] **Step 3: Implement combined display reads**

Read permanent and seasonal histories only when `trophiesEnabled` is true. Merge their options for GET, entitlement validation, and public display. Replace static permanent-definition validation at the selection boundary with `isCodexTrophyId()` plus ownership. Derive housing eligibility through `codexTrophyDisplayCategory()`.

- [ ] **Step 4: Update cabinet presentation**

Use `SURFACE_*` tokens for every season detail. Show season ID, theme, final rank, final score, representative record, and first-place engraving. Do not imply SP or item rewards.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm test -- src/adventure/v2/V2TrophyCabinetView.test.tsx src/lib/server/profileShowcaseRoute.test.ts src/adventure/data/v2/housing.test.ts src/lib/server/housing.test.ts src/lib/server/housingRoute.test.ts
git add src/adventure/v2/V2TrophyCabinetView.tsx src/adventure/v2/V2TrophyCabinetView.test.tsx src/app/api/v2/me/profile-showcase/route.ts src/lib/server/profileShowcaseRoute.test.ts src/adventure/data/v2/housing.ts src/adventure/data/v2/housing.test.ts src/lib/server/housing.ts src/lib/server/housing.test.ts src/app/api/v2/me/housing/route.ts 'src/app/api/v2/player/[name]/housing/route.ts' src/lib/server/housingRoute.test.ts
git commit -m "feat: display monthly codex trophies"
```

### Task 7: Gated API, Ranking UI, and Personal Standing

**Files:**
- Create: `src/app/api/rankings/codex-research/route.ts`
- Create: `src/app/api/rankings/codex-research/route.test.ts`
- Create: `src/adventure/rankings/useCodexResearchRanking.ts`
- Create: `src/adventure/rankings/useCodexResearchRanking.test.ts`
- Create: `src/adventure/rankings/CodexResearchRankingPanel.tsx`
- Create: `src/adventure/rankings/CodexResearchRankingPanel.test.tsx`
- Modify: `src/adventure/rankings/RankingsView.tsx`
- Modify: `src/adventure/rankings/RankingsView.test.tsx`
- Modify: `src/adventure/v2/CodexMasteryPanel.tsx`
- Modify: `src/adventure/v2/CodexMasteryPanel.test.tsx`

**Interfaces:**
- API: `GET /api/rankings/codex-research`.
- Hook: `useCodexResearchRanking(active)` retaining one current-season response.
- Ranking subview: add `CodexRankingView = "completion" | "overall" | "category" | "monthly"`.

- [ ] **Step 1: Write failing route tests**

Assert unauthorized 401; flag-off returns `{ ok: true, enabled: false }` without calling the ranking reader; flag-on returns `no_season` or active data; duplicate/unsupported query parameters return 400 rather than being ignored.

- [ ] **Step 2: Run route RED and implement the minimal handler**

```bash
npm test -- src/app/api/rankings/codex-research/route.test.ts
```

Use `ensureUser()`, `readCodexMasteryFeatureSettings()`, `getAdminEmailsList()`, and `readCodexResearchRanking()`. Do not add `force-static` or cache directives.

- [ ] **Step 3: Write failing hook and UI tests**

Cover strict response parsing, abort/retry behavior, disabled/no-season/error/empty/ready panels, top rows, nearby rows, profile navigation, provisional tier labels, and the fixed tie explanation. Update ranking controls to show `이달의 연구` without a category selector.

Add a compact personal standing block inside the B8a monthly card only when `monthlyRankingVisible` is true. It reuses the hook response and displays `내 잠정 순위`, `예상 트로피`, and a link or action to the ranking surface. When the flag is false it issues no fetch and keeps the B8a markup.

- [ ] **Step 4: Run UI RED, implement, then GREEN**

```bash
npm test -- src/adventure/rankings/useCodexResearchRanking.test.ts src/adventure/rankings/CodexResearchRankingPanel.test.tsx src/adventure/rankings/RankingsView.test.tsx src/adventure/v2/CodexMasteryPanel.test.tsx
```

Use only opaque surfaces for content cards and do not apply container opacity.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/rankings/codex-research src/adventure/rankings/useCodexResearchRanking.ts src/adventure/rankings/useCodexResearchRanking.test.ts src/adventure/rankings/CodexResearchRankingPanel.tsx src/adventure/rankings/CodexResearchRankingPanel.test.tsx src/adventure/rankings/RankingsView.tsx src/adventure/rankings/RankingsView.test.tsx src/adventure/v2/CodexMasteryPanel.tsx src/adventure/v2/CodexMasteryPanel.test.tsx
git commit -m "feat: expose monthly codex rankings"
```

### Task 8: Review, PostgreSQL Verification, and Isolation Audit

**Files:**
- Review all files changed since commit `81e382be3`.
- Modify only files required by findings.

**Interfaces:**
- Verifies the complete B8b contract without executing any real settlement or deployment action.

- [ ] **Step 1: Run focused unit and component verification**

Run every new B8b test plus adjacent permanent ranking, trophy, profile, housing, ops-setting, B8a progress, route, and UI tests together.

- [ ] **Step 2: Run actual PostgreSQL 16 verification**

Create an isolated temporary cluster under `/tmp`, apply migrations 0169 through 0172 in an isolated schema, and run:

```bash
env CODEX_MASTERY_POSTGRES_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55441/postgres npm test -- \
  src/lib/server/codexMasteryPostgres.test.ts \
  src/lib/server/codexResearchRanking.integration.test.ts
```

Stop the server and remove only the exact temporary directory afterward.

- [ ] **Step 3: Run static and migration checks**

```bash
git diff --check 81e382be3..HEAD
npx tsc --noEmit
git diff --name-only 81e382be3..HEAD -- '*.ts' '*.tsx' | xargs npx eslint
npm run check-images
node scripts/check-migrations.mjs
```

- [ ] **Step 4: Run full regression and production build**

```bash
npm test -- --run
npm run build
```

- [ ] **Step 5: Self-review against the design**

Confirm official rank is assigned before block filtering; settlement and trophy publication remain separate; permanent history readers ignore research rows; all four relevant flags remain false; no real season, cron, admin mutation, economic reward, translucent content card, or whole-card opacity was added.

- [ ] **Step 6: Commit review fixes if needed**

Use a focused fix commit only after a regression test demonstrates each behavioral finding.

- [ ] **Step 7: Audit isolation**

Confirm this worktree is clean on `feat/codex-mastery-gameplay-integration-20260820`, the deployment checkout contains no B8b symbols, Phase A remains on its separate hold worktree, and no deploy, push, merge, squash, feature activation, real season schedule, settlement, or trophy publication occurred.
