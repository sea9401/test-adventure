# Manual Job Codex Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the full job codex into its own manual section, paginate filtered jobs by 12, and explain complex tier-seven jobs with concrete play examples.

**Architecture:** Keep manual section pages statically generated and isolate interactivity inside the existing `JobWikiIndex` client component. Feed optional curated guides through the existing job manual model so the dynamic job detail route remains data-driven.

**Tech Stack:** Next.js 16 App Router, React 19 client state, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Preserve `/manual/jobs/[jobId]` detail URLs.
- Use `SURFACE_CARD`, `SURFACE_INSET`, or `SURFACE_ACCENT` for content surfaces.
- Display 12 filtered jobs per page and reset to page 1 after every filter change.
- Do not deploy without a separate explicit deployment request.

---

### Task 1: Independent job codex manual section

**Files:**
- Create: `src/app/manual/content/job-codex.tsx`
- Modify: `src/app/manual/sections.ts`
- Modify: `src/app/manual/content/index.tsx`
- Modify: `src/app/manual/content/jobs.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: `src/app/manual/sections.test.ts`
- Modify: `src/app/manual/jobs/[jobId]/page.tsx`
- Modify: `src/app/manual/jobs/[jobId]/JobManualContent.tsx`

**Interfaces:**
- Produces: `JobCodexContent(): ReactNode`, registered under `MANUAL_CONTENT["job-codex"]`.
- Consumes: `buildJobManualIndex()` and `JobWikiIndex`.

- [ ] **Step 1: Write failing section and content tests**

Assert that `job-codex` immediately follows `jobs`, maps to a content component, `JobsContent` no longer renders the index count, and `JobCodexContent` does.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/app/manual/sections.test.ts src/app/manual/current-content.test.tsx`

Expected: failures for missing `job-codex` metadata/content and the still-embedded index.

- [ ] **Step 3: Implement the independent section**

Create `JobCodexContent`, register its metadata and content mapping, remove the index from `JobsContent`, and point detail-page active/back navigation to `job-codex`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --run src/app/manual/sections.test.ts src/app/manual/current-content.test.tsx src/app/manual/jobs/[jobId]/page.test.tsx src/app/manual/jobs/[jobId]/JobManualContent.test.tsx`

Expected: all selected test files pass.

### Task 2: Filter-aware pagination

**Files:**
- Modify: `src/app/manual/content/JobWikiIndex.tsx`
- Modify: `src/app/manual/content/JobWikiIndex.test.tsx`

**Interfaces:**
- Produces: `JOB_WIKI_PAGE_SIZE = 12` and `paginateJobManualIndex(entries, page)` returning bounded page metadata and entries.
- Consumes: output of `filterJobManualIndex`.

- [ ] **Step 1: Write failing pagination behavior tests**

Use 13 literal fixture entries to assert 12 initial links, one link on page 2, disabled boundary controls, and page reset after a filter/search change.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/app/manual/content/JobWikiIndex.test.tsx`

Expected: pagination exports and controls are missing.

- [ ] **Step 3: Implement minimal pagination**

Slice filtered entries by a bounded one-based page, render previous/next controls only for multiple pages, and centralize filter updates so they reset `page` to 1.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/app/manual/content/JobWikiIndex.test.tsx`

Expected: search, empty state, count, and pagination tests pass.

### Task 3: Curated tier-seven play guides

**Files:**
- Create: `src/app/manual/jobManualGuides.ts`
- Modify: `src/app/manual/jobManualModel.ts`
- Modify: `src/app/manual/jobManualModel.test.ts`
- Modify: `src/app/manual/jobs/[jobId]/JobManualContent.tsx`
- Modify: `src/app/manual/jobs/[jobId]/JobManualContent.test.tsx`

**Interfaces:**
- Produces: `JobManualGuide { overview: string; rules: string[]; examples: string[] }` and `jobManualGuideFor(jobId)`.
- Extends: `JobManualEntry.guide: JobManualGuide | null`.

- [ ] **Step 1: Write failing model and rendering tests**

Assert that `skyascendant` exposes ranged `낙성·천궁궤적`, martial `파공·천룡난무`, both crossover directions, and both concrete sequences. Assert that a simple root job has no guide block.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/app/manual/jobManualModel.test.ts src/app/manual/jobs/[jobId]/JobManualContent.test.tsx`

Expected: `guide` is absent and explanatory copy is not rendered.

- [ ] **Step 3: Implement guides and conditional UI**

Add guides for the four public tier-seven combat jobs and render the guide between the classification badges and unlock conditions using approved surfaces.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --run src/app/manual/jobManualModel.test.ts src/app/manual/jobs/[jobId]/JobManualContent.test.tsx`

Expected: guide and existing detail tests pass.

### Task 4: Integration verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused manual tests**

Run: `npm test -- --run src/app/manual/sections.test.ts src/app/manual/current-content.test.tsx src/app/manual/jobManualModel.test.ts src/app/manual/content/JobWikiIndex.test.tsx src/app/manual/jobs/[jobId]/JobManualContent.test.tsx src/app/manual/jobs/[jobId]/page.test.tsx`

- [ ] **Step 2: Run static checks**

Run: `npx tsc --noEmit`

Run: `npm run lint`

- [ ] **Step 3: Run the complete test suite**

Run: `npm test`

- [ ] **Step 4: Run the production build**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npm run build`

- [ ] **Step 5: Commit**

Stage the spec, plan, implementation, and tests, then commit with `feat: improve manual job codex navigation`.

