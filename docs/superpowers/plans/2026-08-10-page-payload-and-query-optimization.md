# Page Payload and Query Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce page-load response payloads and avoid unnecessary database work while preserving existing full API responses.

**Architecture:** Add explicit lightweight modes to the existing bulletin, state, and life-field Route Handlers, then move only the matching lightweight consumers to those modes. Extend the in-process profiler with privacy-safe normalized operation aggregation so the next combat optimization is based on per-operation evidence.

**Tech Stack:** Next.js 16.2.11 Route Handlers, React 19, Drizzle ORM, PostgreSQL, TypeScript, Vitest.

## Global Constraints

- Do not deploy this change or change maintenance mode.
- Preserve the response shape of requests without the new query parameters.
- Do not record raw paths, query strings, UUIDs, user IDs, room IDs, character names, or search terms in profiler output.
- Keep authenticated per-user responses uncached.
- Write and observe a failing regression test before each behavior change.

---

### Task 1: Notice preview

**Files:**
- Create: `src/app/api/bulletin/preview.ts`
- Create: `src/app/api/bulletin/preview.test.ts`
- Modify: `src/app/api/bulletin/route.ts`
- Modify: `src/adventure/bulletin/api.ts`
- Modify: `src/adventure/bulletin/api.test.ts`
- Modify: `src/adventure/v2/V2AnnouncementsPanel.tsx`

**Interfaces:**
- Produces `readNoticePreview(userId: string): Promise<{ posts: NoticePreviewPost[] }>`.
- Produces `fetchNoticePreview(): Promise<NoticePreviewPost[]>`.

- [ ] Add failing tests proving preview returns only three `id/title/createdAt` rows and the client requests `preview=notice`.
- [ ] Run the focused tests and confirm the expected missing-preview failure.
- [ ] Implement the one-query public notice preview branch before full bulletin context loading.
- [ ] Switch the home panel to `fetchNoticePreview()` and remove client-side slicing of full posts.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Core game-state response

**Files:**
- Create: `src/app/api/v2/me/state/stateView.ts`
- Create: `src/app/api/v2/me/state/stateView.test.ts`
- Modify: `src/app/api/v2/me/state/route.ts`
- Modify: `src/adventure/v2/GameStateProvider.tsx`

**Interfaces:**
- Produces `parseStateView(requestUrl: string): "full" | "core"`.
- Produces `currentJobSummary(charSave)` and `proficiencySummary(proficiencyRaw, charSave)`.
- `GET /api/v2/me/state?view=core` returns the provider-compatible subset described in the design.

- [ ] Add failing pure tests for view validation and literal current-job/proficiency summaries.
- [ ] Run the tests and confirm the missing module failure.
- [ ] Extract full/core save-key selection and branch heavyweight section computation in the route.
- [ ] Build the core response from provider-consumed fields only while preserving the parameterless full response.
- [ ] Change `GameStateProvider.refreshGameState()` to request `view=core`.
- [ ] Run state tests and TypeScript.

### Task 3: Scoped life-field responses and refresh

**Files:**
- Create: `src/app/api/v2/life-fields/lifeFieldView.ts`
- Create: `src/app/api/v2/life-fields/lifeFieldView.test.ts`
- Modify: `src/app/api/v2/life-fields/route.ts`
- Modify: `src/adventure/v2/LifeFieldPanels.tsx`

**Interfaces:**
- Produces `parseLifeFieldView(url)` returning `full`, `codex`, or `{ kind: "environment", activity, spotId }`.
- Produces response builders for a single environment and codex-only progress.

- [ ] Add failing tests for valid views, invalid activity/spot combinations, and exact response keys.
- [ ] Run the focused test and confirm the missing implementation failure.
- [ ] Implement scoped GET responses while keeping the default full response.
- [ ] Parameterize the hook by view, remove 30-second network polling, and schedule environment refresh at `endsAt`.
- [ ] Keep focus and explicit refresh behavior and update the displayed countdown locally.
- [ ] Run focused tests and TypeScript.

### Task 4: Privacy-safe operation profiling

**Files:**
- Modify: `src/lib/server/runtimeProfiler/routeClassifier.ts`
- Modify: `src/lib/server/runtimeProfiler/routeClassifier.test.ts`
- Modify: `src/lib/server/runtimeProfiler/types.ts`
- Modify: `src/lib/server/runtimeProfiler/aggregate.ts`
- Modify: `src/lib/server/runtimeProfiler/aggregate.test.ts`
- Modify: `src/lib/server/runtimeProfiler/httpInstrumentation.ts`
- Modify: `src/lib/server/runtimeProfiler/httpInstrumentation.test.ts`
- Modify: `docs/ops-runbook.md`

**Interfaces:**
- Produces `classifyRequestOperation(rawUrl: string, method: string): string` with dynamic segments normalized.
- Adds `operations` aggregation keyed only by normalized operation.

- [ ] Add failing classification tests proving query strings and representative UUID/numeric/string IDs do not survive normalization.
- [ ] Add failing aggregate tests with hand-calculated per-operation request, byte, duration, and DB totals.
- [ ] Run the profiler tests and confirm the missing operation behavior.
- [ ] Add normalized operation to request context and aggregate snapshots without retaining raw URLs.
- [ ] Document operation-level diagnosis and privacy guarantees.
- [ ] Run the focused profiler suite.

### Task 5: Full verification and commit

**Files:**
- Modify only files required by verification findings within this feature.

**Interfaces:**
- No new interfaces.

- [ ] Run focused Vitest suites for bulletin, state, life fields, and runtime profiler.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and review the final diff against every design requirement.
- [ ] Commit the completed implementation without deploying it.
