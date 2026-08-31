# Codex Mastery Permanent Rankings B5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate unless the user explicitly requests subagents.

**Goal:** Add safely gated permanent overall/category codex mastery rankings with a bounded top list and the viewer's nearby ranks.

**Architecture:** Keep the existing completion ranking intact and add a dedicated authenticated mastery-ranking route backed by `codex_mastery_summary`. A server query ranks only eligible rows with the fixed tie-break order and returns at most the top 50 plus the viewer's two neighbors on each side. The client lazy-loads this endpoint only from the new codex ranking subtabs.

**Tech Stack:** TypeScript, React 19 Client Components, Next.js 16.2 Route Handlers, PostgreSQL window functions, Drizzle SQL, Vitest, Tailwind surface tokens.

## Global Constraints

- Work only on `feat/codex-mastery-gameplay-integration-20260820` in `/tmp/test-adventure-codex-mastery-gameplay`.
- Do not merge, push, deploy, run a production migration, write operations settings, or execute a real backfill.
- Keep all codex mastery feature defaults `false`; `rankingVisible` is the sole B5 visibility gate.
- Do not change SP, combat, rewards, gold, items, recording, backfill, score, or existing completion-ranking semantics.
- B5 does not implement monthly rankings, hall of fame, trophy display, housing, feeds, or notifications.
- Do not expose the stable user-ID tie-breaker in API DTOs or UI.
- Use opaque `Card`, `SURFACE_CARD`, `SURFACE_INSET`, and `SURFACE_ACCENT` surfaces.
- Follow the local Next.js 16.2 route-handler and `use client` guides already reviewed for this task.

---

### Task 1: Define the ranking contract and indexed server query

**Files:**
- Create: `src/adventure/data/v2/codexMasteryRanking.ts`
- Create: `src/lib/server/codexMasteryRanking.ts`
- Create: `src/lib/server/codexMasteryRanking.test.ts`

**Interfaces:**
- Defines the seven closed ranking scopes and serializable enabled/disabled response DTOs.
- Exposes `readCodexMasteryRanking(executor, { viewerUserId, scope, adminEmails, topLimit, neighborRadius })`.
- Ranks only eligible, named, positive-score users and returns `{ list, nearby, me }` with normalized display values.

- [ ] **Step 1: Write RED contract and query tests**

Assert all seven scopes map to the intended score/reached-at columns. Pin the order to score, cumulative gold count, seals,
scored categories, reached-at, and user ID. Cover positive-score/name/current-ban/admin/viewer-block exclusions, top-50
bounding, viewer ±2 selection, invalid bigint/profile values, and absence of user IDs in public rows.

- [ ] **Step 2: Implement shared DTOs and safe normalization**

Reuse `displayCodexMasteryScore`, stored-avatar validation, and existing cosmetic DTO types. Keep the category and stage
score/count objects complete and serializable.

- [ ] **Step 3: Implement one ranked CTE query**

Select score and reached-at fragments only from the closed scope map. Join `users` and the profile save, exclude the
viewer's blocked users with `NOT EXISTS`, and apply admin/current-ban/name/positive-score predicates before
`ROW_NUMBER()`. Select only top and nearby rows from the ranked CTE and preserve exact ranks.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/lib/server/codexMasteryRanking.test.ts
npx tsc --noEmit
npx eslint src/adventure/data/v2/codexMasteryRanking.ts src/lib/server/codexMasteryRanking.ts src/lib/server/codexMasteryRanking.test.ts
git add src/adventure/data/v2/codexMasteryRanking.ts src/lib/server/codexMasteryRanking.ts src/lib/server/codexMasteryRanking.test.ts
git commit -m "feat: query permanent codex mastery rankings"
```

### Task 2: Add the authenticated, default-off ranking route

**Files:**
- Create: `src/app/api/rankings/codex-mastery/route.ts`
- Create: `src/app/api/rankings/codex-mastery/route.test.ts`

**Interfaces:**
- `GET ?scope=overall|equipment|fish|monster|cooking|life|job`.
- Returns `{ ok: true, enabled: false }` while hidden and an enabled ranking response otherwise.

- [ ] **Step 1: Write route RED tests**

Cover unauthenticated 401, invalid scope 400, disabled 200 without a ranking query, enabled query arguments, and stable
JSON output. Confirm settings are checked before any summary-table access.

- [ ] **Step 2: Implement the route**

Authenticate, parse the closed scope, read `rankingVisible`, return early while disabled, then pass the viewer and
normalized admin-email list to the server query. Keep the handler uncached because block state and viewer rank are
request-specific.

- [ ] **Step 3: Verify and commit**

```bash
npm test -- src/app/api/rankings/codex-mastery/route.test.ts src/lib/server/codexMasteryRanking.test.ts
npx tsc --noEmit
npx eslint src/app/api/rankings/codex-mastery/route.ts src/app/api/rankings/codex-mastery/route.test.ts
git add src/app/api/rankings/codex-mastery/route.ts src/app/api/rankings/codex-mastery/route.test.ts
git commit -m "feat: expose gated codex mastery rankings"
```

### Task 3: Build the permanent ranking panel and lazy hook

**Files:**
- Create: `src/adventure/rankings/CodexMasteryRankingPanel.tsx`
- Create: `src/adventure/rankings/CodexMasteryRankingPanel.test.tsx`
- Create: `src/adventure/rankings/useCodexMasteryRanking.ts`
- Create: `src/adventure/rankings/useCodexMasteryRanking.test.tsx`

**Interfaces:**
- Lazy-loads and retains one response per selected scope.
- Renders feature-disabled, loading, error, empty, top-list, and nearby-list states.
- Paginates the top 50 by 10 and opens existing profile pages by name.

- [ ] **Step 1: Write hook and helper RED tests**

Assert no request while inactive, one request on activation, abort-safe scope changes, per-scope retention, retry after an
error, and correct response validation.

- [ ] **Step 2: Implement the lazy hook**

Use the project's async-data conventions while retaining a small scope-keyed cache in component state. Never request
monthly or trophy data.

- [ ] **Step 3: Write panel RED tests**

Render every state. Assert Korean scope labels, selected score, gold-or-higher/seal/category tie-break facts, viewer
highlighting, exact nearby heading, 10-row pagination, profile selection, accessible controls, and opaque surface tokens.

- [ ] **Step 4: Implement the panel**

Use the existing avatar, name effect, profile border, pagination, skeleton, and empty-state components. Keep rows compact
but expose the full six category scores in an expandable/selectable detail area if space permits without inventing future
trophy fields.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/adventure/rankings/CodexMasteryRankingPanel.test.tsx src/adventure/rankings/useCodexMasteryRanking.test.tsx
npx tsc --noEmit
npx eslint src/adventure/rankings/CodexMasteryRankingPanel.tsx src/adventure/rankings/CodexMasteryRankingPanel.test.tsx src/adventure/rankings/useCodexMasteryRanking.ts src/adventure/rankings/useCodexMasteryRanking.test.tsx
git add src/adventure/rankings/CodexMasteryRankingPanel.tsx src/adventure/rankings/CodexMasteryRankingPanel.test.tsx src/adventure/rankings/useCodexMasteryRanking.ts src/adventure/rankings/useCodexMasteryRanking.test.tsx
git commit -m "feat: add codex mastery ranking panel"
```

### Task 4: Integrate codex ranking subtabs

**Files:**
- Modify: `src/adventure/rankings/RankingsView.tsx`
- Modify: `src/adventure/rankings/RankingsView.test.tsx`

**Interfaces:**
- Adds `완성도 | 종합 숙련 | 분야별` below the existing `도감` metric tab.
- Leaves completion ranking unchanged; mastery requests begin only on the two new selections.
- Adds six category buttons only for the category selection.

- [ ] **Step 1: Write integration RED tests**

Assert the default completion subtab still renders the old ranking, no mastery fetch occurs initially, overall/category
selection swaps to the dedicated panel, all category labels select the correct scope, and switching away stops active
loading without discarding already loaded scope data.

- [ ] **Step 2: Implement subtab composition**

Keep the outer ranking metric state unchanged. Add local codex-view/category state, render the existing completion body
only for `완성도`, and pass activation/scope/profile-navigation to the mastery panel.

- [ ] **Step 3: Verify and commit**

```bash
npm test -- src/adventure/rankings/RankingsView.test.tsx src/adventure/rankings/CodexMasteryRankingPanel.test.tsx src/adventure/rankings/useCodexMasteryRanking.test.tsx
npx tsc --noEmit
npx eslint src/adventure/rankings/RankingsView.tsx src/adventure/rankings/RankingsView.test.tsx
git add src/adventure/rankings/RankingsView.tsx src/adventure/rankings/RankingsView.test.tsx
git commit -m "feat: connect permanent codex rankings"
```

### Task 5: Verify B5 and preserve rollout isolation

**Files:**
- Modify only if verification exposes a B5 defect.

- [ ] **Step 1: Run focused and real-PostgreSQL verification**

Run all B5 tests plus existing ranking eligibility, ranking route/view, codex summary repository, and operations-setting
tests. Start an isolated `/tmp` PostgreSQL instance, apply migrations there, and run an integration fixture that confirms
the actual window ordering and exclusion behavior; stop it after the test.

- [ ] **Step 2: Run static and production checks**

```bash
npx tsc --noEmit
npx eslint src/adventure/data/v2/codexMasteryRanking.ts src/lib/server/codexMasteryRanking.ts src/app/api/rankings/codex-mastery/route.ts src/adventure/rankings/useCodexMasteryRanking.ts src/adventure/rankings/CodexMasteryRankingPanel.tsx src/adventure/rankings/RankingsView.tsx
npm run codex-mastery:budget
npm run check-module-budgets
npm run build
```

- [ ] **Step 3: Run the full regression suite once**

Run `npm test` once. Diagnose every new failure. Re-run an isolated existing timeout to distinguish a deterministic defect
from the suite's known concurrency-only timeouts, without changing product behavior merely to hide a timeout.

- [ ] **Step 4: Audit flags, SQL, surfaces, and branch isolation**

Confirm `rankingVisible` and every codex default remain false; disabled API tests prove no ranking read; no raw user ID is
serialized; every rank scope uses the fixed order; no translucent content surface was added; no ops/backfill/migration/
deploy command touched a real environment; and the deployment branch still does not contain Phase A/B/B5 commits.

- [ ] **Step 5: Final status**

Ensure the feature worktree is clean and report fresh test/build evidence, B5 commits, unchanged default-off rollout, and
the next unpublished bundle (monthly research or trophies) without enabling or deploying anything.
