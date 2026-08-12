# Job Roadmap Advancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players start advancement or re-advancement from the selected job details inside the job roadmap.

**Architecture:** Keep `V2JobLadder` as the sole owner of eligibility, pending confirmation, API mutation, messages, and refresh. Pass a small action contract through `JobRoadmapDialog` to `JobRoadmapDetails`, then reuse the existing confirmation modal above the roadmap.

**Tech Stack:** Next.js 16.2 Client Components, React 19, TypeScript, Tailwind CSS, Vitest static React rendering

## Global Constraints

- Do not deploy to any environment.
- Do not change server advancement rules or the `/api/v2/me/advance-class` contract.
- Use opaque surfaces from `src/components/ui/surfaces.ts`; do not introduce translucent content panels.
- Preserve the existing job list, search, tags, and goal controls.
- Do not modify unrelated conflicted files in the current worktree.

---

### Task 1: Roadmap advancement action

**Files:**
- Modify: `src/adventure/v2/JobRoadmapDialog.tsx`
- Modify: `src/adventure/v2/V2JobLadder.tsx`
- Test: `src/adventure/v2/JobRoadmapDialog.test.tsx`

**Interfaces:**
- Consumes: `JobRoadmapPlayerJob`, `currentJobId`, `atLevelCap`, `currentJobSelectable`
- Produces: `onPickJob: (job: JobRoadmapPlayerJob) => void` from the roadmap and an enabled or disabled advancement button in `JobRoadmapDetails`

- [ ] **Step 1: Write failing detail-panel tests**

Add literal assertions showing that an eligible non-current job renders an enabled `전직` button, the current job renders `재전직`, and locked or level-blocked jobs render disabled reason labels.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/JobRoadmapDialog.test.tsx`

Expected: FAIL because `JobRoadmapDetails` does not yet accept or render an advancement action.

- [ ] **Step 3: Add the minimal roadmap action contract**

Extend `JobRoadmapDialog` with `atLevelCap`, `currentJobSelectable`, and `onPickJob`. Forward the selected job and eligibility to `JobRoadmapDetails`. Render a touch-friendly button next to the existing goal control, using the same labels and eligibility branches as `JobRow`.

- [ ] **Step 4: Reuse the parent confirmation flow**

Pass the new props from `V2JobLadder`, set the existing `pending` state from `onPickJob`, raise the existing confirmation modal above the roadmap, and close the roadmap only after a successful advancement.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/v2/JobRoadmapDialog.test.tsx src/adventure/v2/V2JobLadder.test.tsx`

Expected: both test files pass with zero failures.

- [ ] **Step 6: Verify static quality and types**

Run: `npx eslint src/adventure/v2/JobRoadmapDialog.tsx src/adventure/v2/V2JobLadder.tsx src/adventure/v2/JobRoadmapDialog.test.tsx src/adventure/v2/V2JobLadder.test.tsx`

Run: `npx tsc --noEmit`

Expected: the focused lint command passes. If TypeScript encounters pre-existing merge markers, record those separately from the feature files.

- [ ] **Step 7: Commit only scoped files when Git permits**

```bash
git add docs/superpowers/specs/2026-08-12-job-roadmap-advancement-design.md docs/superpowers/plans/2026-08-12-job-roadmap-advancement.md src/adventure/v2/JobRoadmapDialog.tsx src/adventure/v2/V2JobLadder.tsx src/adventure/v2/JobRoadmapDialog.test.tsx
git commit -m "feat: allow advancement from job roadmap"
```

Expected: commit succeeds only if the pre-existing index has no unresolved conflicts. Never resolve unrelated conflicts as part of this task.
