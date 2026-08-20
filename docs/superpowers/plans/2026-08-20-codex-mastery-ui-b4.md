# Codex Mastery Adventure Book B4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate unless the user explicitly requests subagents.

**Goal:** Add a safely gated, server-authoritative codex mastery overview, searchable category list, entry detail, and five persistent tracked goals to the adventure book.

**Architecture:** Lazy-load one uncached user snapshot when the new mastery tab first opens. Join the fixed 679-entry catalog to sparse progress rows on the server, keep only five tracked-goal preferences in `savesKv`, and bound client rendering with local filters plus 30-row pagination. Gate the whole surface with a new default-off `overviewVisible` operations switch while leaving recording independently controllable.

**Tech Stack:** TypeScript, React 19 Client Components, Next.js 16.2 Route Handlers, Drizzle ORM, Vitest, Tailwind surface tokens.

## Global Constraints

- Work only on `feat/codex-mastery-gameplay-integration-20260820` in `/tmp/test-adventure-codex-mastery-gameplay`.
- Do not merge, push, deploy, run a production migration, enable an operations switch, or execute a real backfill with `--apply`.
- Keep every codex mastery switch defaulted to `false`, including the new `overviewVisible` switch.
- Do not change SP, combat values, gold, items, existing codex completion, or gameplay recording semantics.
- B4 does not implement rankings, trophies, housing, monthly research, special-seal awarding, or gameplay notifications.
- Do not display invented rank, trophy, or monthly values before their authoritative services exist.
- Use `SURFACE_CARD`, `SURFACE_INSET`, and `SURFACE_ACCENT`; do not add translucent content cards or whole-card opacity.
- Follow `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`.

---

### Task 1: Add the overview gate and read-only repository boundary

**Files:**
- Modify: `src/lib/server/opsSettings.ts`
- Modify: `src/lib/server/opsSettingsActive.test.ts`
- Modify: `src/app/api/admin/ops-settings/route.test.ts`
- Modify: `src/lib/server/codexMasteryRepository.ts`
- Modify: `src/lib/server/codexMasteryRepository.test.ts`

**Interfaces:**
- Adds required `overviewVisible: boolean` to `CodexMasteryFeatureSettings`, default `false`.
- Adds `readCodexMasterySummary(executor, userId)` returning the normalized row or an empty in-memory summary without inserting anything.

- [ ] **Step 1: Write feature-gate RED tests**

Update the operations-setting expectations so a missing `overviewVisible` defaults off, an own boolean is preserved, and
the admin route persists the complete parsed object. Run the focused tests and observe the missing field failures.

- [ ] **Step 2: Implement the default-off overview switch**

Add the field to the type, default object, and own-property parser. Do not enable it or write an operations setting.

- [ ] **Step 3: Write repository RED tests**

Assert the summary reader normalizes an existing row, returns `emptyCodexMasterySummary()` when absent, and performs a
plain non-locking select without inserts or `FOR UPDATE`.

- [ ] **Step 4: Implement and verify the reader**

Reuse `selectSummary(..., { forUpdate: false })` and the existing strict normalization boundary. Run:

```bash
npm test -- src/lib/server/opsSettingsActive.test.ts src/app/api/admin/ops-settings/route.test.ts src/lib/server/codexMasteryRepository.test.ts
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/opsSettings.ts src/lib/server/opsSettingsActive.test.ts src/app/api/admin/ops-settings/route.test.ts src/lib/server/codexMasteryRepository.ts src/lib/server/codexMasteryRepository.test.ts
git commit -m "feat: gate codex mastery overview reads"
```

### Task 2: Build the snapshot and tracked-goal domain

**Files:**
- Create: `src/adventure/data/v2/codexMasteryView.ts`
- Create: `src/lib/server/codexMasterySnapshot.ts`
- Create: `src/lib/server/codexMasterySnapshot.test.ts`
- Create: `src/lib/server/codexMasteryPins.ts`
- Create: `src/lib/server/codexMasteryPins.test.ts`

**Interfaces:**
- Defines serializable entry, category, promotion, near-goal, feature-capability, and snapshot DTOs.
- Produces `buildCodexMasterySnapshot(summary, progressRows, pinnedGoals, features)`.
- Produces tolerant stored-value parsing and strict request validation for at most five catalog-backed pins.
- Reads and writes `codex-mastery-pins.v1`; writes require a transaction executor.

- [ ] **Step 1: Write snapshot RED tests**

Use a small injected definition list to assert sparse rows become complete entries, missing rows are undiscovered, legacy
rows are omitted, summary scores are displayed with the fixed milli conversion, categories are deterministic, recent
promotions are newest-first, and near goals exclude unstarted entries and sort by progress then stable identity.

- [ ] **Step 2: Implement the pure snapshot builder**

Keep catalog order stable. Derive `nextStage`, `nextThreshold`, and bounded progress percent on the server. Preserve exact
summary tier counts and mark pins by stable category/entry identity. Do not recompute authoritative total/category scores
from the client-visible entries.

- [ ] **Step 3: Write pin RED tests**

Assert tolerant reads remove malformed, duplicate, over-limit, and removed entries. Assert strict writes reject non-arrays,
more than five entries, duplicates, unknown categories/IDs, inherited fields, and malformed strings while accepting an
empty list.

- [ ] **Step 4: Implement pin parsing and persistence**

Use `{ entries: [{ category, entryId }] }` under `codex-mastery-pins.v1`. Lock that key before replacing it and return the
validated list. Never store progress or catalog data in this save.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/lib/server/codexMasterySnapshot.test.ts src/lib/server/codexMasteryPins.test.ts src/adventure/data/v2/codexMasteryProductionCatalog.test.ts
npx tsc --noEmit
git add src/adventure/data/v2/codexMasteryView.ts src/lib/server/codexMasterySnapshot.ts src/lib/server/codexMasterySnapshot.test.ts src/lib/server/codexMasteryPins.ts src/lib/server/codexMasteryPins.test.ts
git commit -m "feat: build codex mastery view snapshots"
```

### Task 3: Expose the authenticated snapshot and pin API

**Files:**
- Create: `src/app/api/v2/me/codex-mastery/route.ts`
- Create: `src/app/api/v2/me/codex-mastery/route.test.ts`

**Interfaces:**
- `GET` returns `{ ok: true, enabled: false }` while hidden and `{ ok: true, enabled: true, snapshot }` while visible.
- `POST` replaces the five-or-fewer tracked goals and returns the normalized authoritative list.

- [ ] **Step 1: Write route RED tests**

Cover unauthenticated GET/POST, hidden GET with no summary/progress/pin reads, visible GET with one snapshot read, invalid
JSON, hidden POST with no transaction, strict invalid pins, and successful transactional replacement.

- [ ] **Step 2: Implement GET**

Read settings after authentication. Return early while hidden. Otherwise read summary, sparse progress, and stored pins,
then build the uncached snapshot with feature capabilities.

- [ ] **Step 3: Implement POST**

Read and validate the body before opening the transaction, reject while hidden, then lock and replace the pin save in one
transaction. Use stable 400 error codes for malformed input and 409 for a disabled feature.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/app/api/v2/me/codex-mastery/route.test.ts src/lib/server/codexMasterySnapshot.test.ts src/lib/server/codexMasteryPins.test.ts
npx tsc --noEmit
git add src/app/api/v2/me/codex-mastery/route.ts src/app/api/v2/me/codex-mastery/route.test.ts
git commit -m "feat: expose codex mastery overview API"
```

### Task 4: Build the bounded, opaque mastery panel

**Files:**
- Create: `src/adventure/v2/CodexMasteryPanel.tsx`
- Create: `src/adventure/v2/CodexMasteryPanel.test.tsx`

**Interfaces:**
- Renders loading, disabled, error, and loaded states from props.
- Exports pure filter/pagination helpers for deterministic behavior tests.
- Calls a supplied pin-update callback and applies only its authoritative returned list.

- [ ] **Step 1: Write panel/helper RED tests**

Assert category/search/status/pinned filters, near-goal semantics, page clamping, and a maximum 30 rendered entry rows.
Render static markup for disabled, loading, error, and populated snapshots. Assert total/category/stage summaries, recent
promotions, near goals, pinned goals, detailed thresholds/dates/records, future-feature notice, accessible labels, and
opaque surface tokens.

- [ ] **Step 2: Implement pure exploration helpers**

Add stable filtering and pagination. Reset page when the category, query, or status changes and clamp after result-size
changes. Use Korean labels for six categories and seven stages.

- [ ] **Step 3: Implement the panel UI**

Compose summary, six category cards, goals, filters, paginated rows, and inline entry detail. Show seal controls only when
enabled. Keep rank/trophy/monthly sections as a non-numeric future notice. Use shared surface tokens for every content
wrapper and do not dim locked cards with container opacity.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/adventure/v2/CodexMasteryPanel.test.tsx
npx tsc --noEmit
npx eslint src/adventure/v2/CodexMasteryPanel.tsx src/adventure/v2/CodexMasteryPanel.test.tsx
git add src/adventure/v2/CodexMasteryPanel.tsx src/adventure/v2/CodexMasteryPanel.test.tsx
git commit -m "feat: add codex mastery exploration panel"
```

### Task 5: Integrate lazy loading into the adventure book

**Files:**
- Modify: `src/adventure/v2/V2CodexView.tsx`
- Modify: `src/adventure/v2/V2CodexView.test.ts`

**Interfaces:**
- Adds `mastery` to `CodexTab` and places `숙련` immediately after `SP 수집`.
- Fetches the mastery endpoint only on the first mastery-tab entry and retains the result across tab changes.
- Posts tracked-goal replacements through the same endpoint.

- [ ] **Step 1: Write integration RED tests**

Assert `codexTabFromParam("mastery")` and the exact public tab order. Extract/test a small lazy-load decision helper so
other tabs, already loaded states, and in-flight states do not refetch.

- [ ] **Step 2: Add tab state and lazy fetch**

Keep the snapshot/load state in `V2CodexView`, start one request on first entry, distinguish disabled and error states,
and ignore late responses after unmount. A manual retry changes error back to loading and makes one new request.

- [ ] **Step 3: Connect tracked-goal updates**

POST the complete list, require `ok: true`, update the snapshot pins/entry markers from the server response, and surface a
non-destructive error through the panel. Do not mutate gameplay state or call the global game-state refresh.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/adventure/v2/V2CodexView.test.ts src/adventure/v2/CodexMasteryPanel.test.tsx src/app/api/v2/me/codex-mastery/route.test.ts
npx tsc --noEmit
npx eslint src/adventure/v2/V2CodexView.tsx src/adventure/v2/V2CodexView.test.ts src/adventure/v2/CodexMasteryPanel.tsx
git add src/adventure/v2/V2CodexView.tsx src/adventure/v2/V2CodexView.test.ts
git commit -m "feat: connect codex mastery adventure tab"
```

### Task 6: Verify B4 and preserve rollout isolation

**Files:**
- Modify only if verification exposes a B4 defect.

- [ ] **Step 1: Run the complete focused suite**

Run all new B4 tests plus existing catalog, service, repository, operations-setting, adventure-book, and relevant panel
tests. Record file/test counts from fresh output.

- [ ] **Step 2: Run static and production checks**

```bash
npx tsc --noEmit
npx eslint src/lib/server/opsSettings.ts src/lib/server/codexMasteryRepository.ts src/lib/server/codexMasterySnapshot.ts src/lib/server/codexMasteryPins.ts src/app/api/v2/me/codex-mastery/route.ts src/adventure/v2/CodexMasteryPanel.tsx src/adventure/v2/V2CodexView.tsx
npm run codex-mastery:budget
npm run check-module-budgets
npm run build
```

- [ ] **Step 3: Run the full regression suite once**

Run `npm test`. If only the pre-existing explicit 15-second `levelDesignSim` timeout recurs, report it with exact fresh
counts and do not change product behavior merely to hide the timeout. Diagnose any new failure before editing.

- [ ] **Step 4: Audit surfaces, flags, and branches**

Search the B4 UI for translucent content backgrounds and container opacity. Confirm all codex mastery defaults, including
`overviewVisible`, remain false; no ops setting was written; no real backfill/migration/deploy command ran; the main
deployment checkout remains clean and does not contain Phase A/B commits.

- [ ] **Step 5: Final status**

Ensure the feature worktree is clean, list B4 commits, and report that B4 is locally complete but still unpublished and
not ready to expose until backfill/operational review explicitly enables the overview switch.
