# Visited Job Cultivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow cultivation to use the growth profile of any previously visited combat job without changing the player's current job.

**Architecture:** Extend the existing cultivation POST body with an optional `targetJobId`. The route resolves and authorizes that job inside the existing transaction, then passes its accounting group and job profile into the unchanged cultivation engine. The client derives selectable jobs from the authoritative `jobsV2.jobs[].visited` state and sends the selected ID for both single and maximum cultivation.

**Tech Stack:** Next.js 16 App Router Route Handlers, React Client Components, TypeScript, Vitest, Tailwind UI surfaces.

## Global Constraints

- Existing requests without a body must retain current-job single cultivation behavior.
- Only the current job, `jobHistory`, or legacy mastery evidence may authorize a cultivation profile.
- Lifestyle jobs remain invalid cultivation targets.
- Existing cultivation costs, critical outcomes, cap accounting, reset refunds, and transaction locking remain unchanged.
- New UI surfaces use `SURFACE_INSET`; no translucent content panel is introduced.
- No deployment is performed.

---

### Task 1: Server-side visited-job authorization

**Files:**
- Modify: `src/adventure/data/v2/v2JobCatalog.ts`
- Modify: `src/adventure/data/v2/v2JobCatalog.test.ts`
- Modify: `src/app/api/v2/me/cultivate/route.ts`
- Modify: `src/app/api/v2/me/cultivate/route.test.ts`

**Interfaces:**
- Produces: `isVisitedJob(proficiency, currentJobId, jobId): boolean`
- Produces: `cultivationGroupForJob(jobId): string | null`
- Consumes: POST JSON `{ mode?: "max"; targetJobId?: string }`
- Produces: success response fields `targetJobId`, `targetJobName`, and selected `group`

- [ ] **Step 1: Write failing catalog helper tests**

Add literal behavior cases showing that current, historical, and legacy-mastery jobs are visited; unknown and untouched jobs are not. Add group resolution cases for `fortressknight → warrior`, `archmage → mage`, and `none → none`.

- [ ] **Step 2: Run the catalog test and verify RED**

Run: `npm test -- src/adventure/data/v2/v2JobCatalog.test.ts`

Expected: FAIL because `isVisitedJob` and `cultivationGroupForJob` are not exported.

- [ ] **Step 3: Implement the minimal catalog helpers**

Use `V2_JOB_CATALOG`, `LEGACY_CLASS_SPEC_BY_JOB`, `jobHistory`, and `cumLevelForJob`. Require the target to be a selectable catalog job before accepting it.

- [ ] **Step 4: Run the catalog test and verify GREEN**

Run: `npm test -- src/adventure/data/v2/v2JobCatalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing route authorization tests**

Add route cases that:

- cultivate with the previously visited `fortressknight` profile while the current job is mage and observe VIT/STR gains rather than mage gains;
- accept legacy `jobCumLevel.fortressknight > 0` without `jobHistory`;
- reject an unvisited `fortressknight` with `unvisited_job` and unchanged points;
- reject a visited lifestyle job with `lifestyle_job` and unchanged points;
- permit a current lifestyle character to use a visited combat job;
- preserve the bodyless current-job request.

- [ ] **Step 6: Run the route test and verify RED**

Run: `npm test -- src/app/api/v2/me/cultivate/route.test.ts`

Expected: FAIL because `targetJobId` is ignored and unvisited requests are not rejected.

- [ ] **Step 7: Implement route parsing, authorization, and selected profile application**

Parse `targetJobId` with `mode`, lock the existing saves, parse proficiency, authorize the selection, resolve the selected group, reject lifestyle or invalid targets, and call:

```ts
applyCultivationBatch(prof, selectedGroup, Math.random, selectedJobId, maxIterations)
```

Return the selected job identity in the success response. Keep the existing no-body current job fallback.

- [ ] **Step 8: Run server tests and verify GREEN**

Run: `npm test -- src/adventure/data/v2/v2JobCatalog.test.ts src/app/api/v2/me/cultivate/route.test.ts src/adventure/data/v2/proficiency.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the server slice**

Commit only the four server/data paths with message `feat: allow cultivation with visited jobs`.

---

### Task 2: Cultivation job selector and request payload

**Files:**
- Modify: `src/adventure/v2/CultivationActions.tsx`
- Modify: `src/adventure/v2/CultivationActions.test.tsx`
- Modify: `src/adventure/v2/V2CultivationView.tsx`

**Interfaces:**
- Changes: `cultivationRequestInit(mode, targetJobId)` always emits JSON containing `targetJobId` and includes `mode: "max"` only for maximum mode.
- Produces: `CultivationJobSelector` with visited combat job options, selected value, disabled state, and profile summary.
- Consumes: `jobsV2.jobs[].visited` and `jobsV2.currentJobId` from `/api/v2/me/state`.

- [ ] **Step 1: Write failing request and selector tests**

Add assertions that single and maximum requests contain the selected ID, that the selector renders only the supplied valid options, exposes its label, displays the selected profile summary, and is disabled while busy.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/adventure/v2/CultivationActions.test.tsx`

Expected: FAIL because the request helper lacks `targetJobId` and the selector does not exist.

- [ ] **Step 3: Implement the request helper and selector**

Render a native labelled `select` inside `SURFACE_INSET`. Keep option objects limited to `{ id, name, summary }`. Generate the request as:

```ts
{
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(
    mode === "max" ? { mode: "max", targetJobId } : { targetJobId },
  ),
}
```

- [ ] **Step 4: Run the component test and verify GREEN**

Run: `npm test -- src/adventure/v2/CultivationActions.test.tsx`

Expected: PASS.

- [ ] **Step 5: Wire selected jobs into the cultivation view**

Extend `StateShape.jobsV2.jobs` through `JobLadderEntry.visited`, derive visited non-lifestyle jobs with `jobCultivationProfile` and `jobCultivationSummary`, initialize or repair selection after refresh, derive the visible profile from the selected job, and send it through `cultivationRequestInit`. Include the selected job name in the completion message and handle `unvisited_job` explicitly.

- [ ] **Step 6: Run related UI and route tests**

Run: `npm test -- src/adventure/v2/CultivationActions.test.tsx src/adventure/v2/jobExplorer.test.ts src/app/api/v2/me/cultivate/route.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the client slice**

Commit only the three client paths with message `feat: add visited job cultivation selector`.

---

### Task 3: Integration verification

**Files:**
- Verify all files from Tasks 1 and 2.

**Interfaces:**
- Confirms the full state → selector → POST → authorization → cultivation data flow.

- [ ] **Step 1: Run focused cultivation and job tests**

Run: `npm test -- src/adventure/data/v2/proficiency.test.ts src/adventure/data/v2/v2JobCatalog.test.ts src/adventure/v2/jobExplorer.test.ts src/adventure/v2/CultivationActions.test.tsx src/app/api/v2/me/cultivate/route.test.ts src/app/api/v2/me/cultivate/reset/route.test.ts src/app/api/v2/me/state/stateSections.test.ts`

Expected: PASS.

- [ ] **Step 2: Run static checks**

Run: `npx eslint src/adventure/data/v2/v2JobCatalog.ts src/adventure/data/v2/v2JobCatalog.test.ts src/app/api/v2/me/cultivate/route.ts src/app/api/v2/me/cultivate/route.test.ts src/adventure/v2/CultivationActions.tsx src/adventure/v2/CultivationActions.test.tsx src/adventure/v2/V2CultivationView.tsx && npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0, including image validation.

- [ ] **Step 4: Inspect the exact diff and working tree**

Run `git diff --check`, inspect the feature diff, and confirm unrelated user changes remain uncommitted and untouched.

- [ ] **Step 5: Keep the branch local**

Do not push, merge, create a PR, deploy, or change maintenance mode. Report the commits and verification evidence.
