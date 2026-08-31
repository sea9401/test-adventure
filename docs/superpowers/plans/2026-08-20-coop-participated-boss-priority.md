# Coop Participated Boss Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move active cooperative bosses attacked by the viewer into a dedicated section above ordinary guild and public bosses.

**Architecture:** Keep the existing API and `CoopSessionSummary` contract. Extend the pure `coopSessionListSections` classifier so visible, non-owned sessions with positive `myDamage` appear once in an optional participated section while all existing section ordering remains stable.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Vitest

## Global Constraints

- Do not change the cooperative boss API, database schema, or visibility rules.
- Keep `내가 소환한 보스` first and preserve input order within every section.
- Do not render an empty participated section.
- Do not deploy.

---

### Task 1: Classify Participated Cooperative Bosses

**Files:**
- Modify: `src/adventure/v2/coop/coopListSections.ts`
- Test: `src/adventure/v2/coop/coopListSections.test.ts`

**Interfaces:**
- Consumes: `CoopSessionSummary.myDamage`, `CoopSessionSummary.isOwner`, and `CoopSessionSummary.visibility`
- Produces: `coopSessionListSections(sessions): CoopSessionListSection[]` with optional section id `participated`

- [ ] **Step 1: Write the failing classification test**

Update the test session factory to accept `myDamage = 0`. Add a case with one owned session, participated guild/public sessions, and untouched guild/public sessions. Assert section ids are `mine`, `participated`, `guild`, `public`; the participated ids occur in input order; and each input id appears exactly once across all sections.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/coop/coopListSections.test.ts`

Expected: FAIL because `participated` is not a valid/generated section and attacked sessions remain in their visibility sections.

- [ ] **Step 3: Implement the minimal classifier change**

Extend `CoopSessionListSection.id` with `participated`. Build the existing mine section first, conditionally append a participated section containing `!session.isOwner && session.myDamage > 0`, then append guild/public sections that also require `session.myDamage <= 0`.

- [ ] **Step 4: Verify focused behavior and related rendering**

Run: `npm test -- src/adventure/v2/coop/coopListSections.test.ts src/adventure/v2/coop/V2CoopBossListView.test.tsx`

Expected: both files pass with no warnings or unhandled errors.

- [ ] **Step 5: Verify lint and production build**

Run: `npx eslint src/adventure/v2/coop/coopListSections.ts src/adventure/v2/coop/coopListSections.test.ts src/adventure/v2/coop/V2CoopBossListView.tsx`

Run: `npm run build`

Expected: both commands exit 0.

- [ ] **Step 6: Commit the completed change**

```bash
git add docs/superpowers/specs/2026-08-20-coop-participated-boss-priority-design.md docs/superpowers/plans/2026-08-20-coop-participated-boss-priority.md src/adventure/v2/coop/coopListSections.ts src/adventure/v2/coop/coopListSections.test.ts
git commit -m "feat: prioritize participated coop bosses"
```
