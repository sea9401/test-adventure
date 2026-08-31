# Unexplored Achievement Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this repository.

**Goal:** Make all ten unexplored achievements attainable from the three personal bosses and existing exploration events without counting standard co-op bosses, and show their progress in the unexplored view.

**Architecture:** Keep achievement IDs and save normalization in `unexploredState.ts`. Derive boss achievements from logged boss IDs in `unexploredProgression.ts`, filtering through the authoritative personal-boss parser, and expose a static ten-entry presentation catalog for the client view. The claim route continues to maintain the shared boss-kind log but passes its IDs to the filtered achievement policy.

**Tech Stack:** TypeScript, Next.js 16.2 App Router, React 19, Vitest, Testing Library.

## Global Constraints

- Standard co-op bosses must never grant unexplored boss achievements.
- Exactly ten one-time achievements grant one exploration point each.
- The five non-boss achievements remain unchanged.
- Obsolete `boss_kinds_*` save values are discarded, not migrated.
- Use opaque `SURFACE_CARD` and `SURFACE_INSET` styles for the achievement UI.
- Do not deploy or push.

---

### Task 1: Achievement policy and save contract

**Files:**
- Modify: `src/adventure/data/v2/unexploredState.ts`
- Modify: `src/adventure/data/v2/unexploredState.test.ts`
- Modify: `src/adventure/data/v2/unexploredProgression.ts`
- Modify: `src/adventure/data/v2/unexploredProgression.test.ts`
- Modify: `src/lib/server/unexploredService.test.ts`

**Interfaces:**
- Produces: `UnexploredAchievementSignals.defeatedBossIds?: readonly unknown[]`.
- Produces: `UNEXPLORED_ACHIEVEMENTS`, a ten-entry presentation catalog keyed by `UnexploredAchievementId`.
- Produces: five boss IDs: `first_personal_boss`, `defeat_tracking_weapon`, `defeat_toxic_blood_lord`, `defeat_glacial_colossus`, `defeat_all_personal_bosses`.

- [x] **Step 1: Write failing policy and parser tests**

Add literal assertions equivalent to:

```ts
expect(unexploredAchievementCandidates({
  defeatedBossIds: ["mountain_chief", "tracking_weapon"],
})).toEqual(["first_personal_boss", "defeat_tracking_weapon"]);

expect(unexploredAchievementCandidates({
  defeatedBossIds: ["tracking_weapon", "toxic_blood_lord", "glacial_colossus"],
})).toEqual([
  "first_personal_boss",
  "defeat_tracking_weapon",
  "defeat_toxic_blood_lord",
  "defeat_glacial_colossus",
  "defeat_all_personal_bosses",
]);
```

Assert that `parseUnexploredSave` preserves the five new IDs and drops `boss_kinds_1` and `boss_kinds_12`.

- [x] **Step 2: Run tests and confirm RED**

Run: `npm test -- src/adventure/data/v2/unexploredProgression.test.ts src/adventure/data/v2/unexploredState.test.ts`

Expected: FAIL because the signal and IDs have not been changed.

- [x] **Step 3: Implement the policy and catalog**

Replace the five old IDs in `UNEXPLORED_ACHIEVEMENT_IDS`. Filter `signals.defeatedBossIds` with `parseUnexploredBossId`, deduplicate valid IDs, add first/individual/all achievements in stable catalog order, and export ten literal `{ id, name, description }` entries as `UNEXPLORED_ACHIEVEMENTS`.

- [x] **Step 4: Run policy and service tests**

Run: `npm test -- src/adventure/data/v2/unexploredProgression.test.ts src/adventure/data/v2/unexploredState.test.ts src/lib/server/unexploredService.test.ts`

Expected: PASS.

### Task 2: Claim integration

**Files:**
- Modify: `src/app/api/v2/coop/claim/route.ts`
- Modify: `src/app/api/v2/coop/claim/route.test.ts`
- Modify: `src/lib/server/coopClaimCodexMasteryRoute.test.ts`

**Interfaces:**
- Consumes: `unexploredAchievementCandidates({ defeatedBossIds: nextKinds })` from Task 1.
- Produces: character saves whose unexplored achievement list only reflects personal boss IDs.

- [x] **Step 1: Write the failing claim regression test**

After a `tracking_weapon` claim with a log containing standard co-op IDs, assert the character write contains exactly:

```ts
["first_personal_boss", "defeat_tracking_weapon"]
```

- [x] **Step 2: Run the route test and confirm RED**

Run: `npm test -- src/app/api/v2/coop/claim/route.test.ts`

Expected: FAIL because the route still supplies a total kind count.

- [x] **Step 3: Pass boss IDs to the policy**

Change both personal and standard claim branches from `coopBossKindCount` to `defeatedBossIds: nextKinds`. Preserve the quest log and all unrelated reward behavior.

- [x] **Step 4: Run claim tests**

Run: `npm test -- src/app/api/v2/coop/claim/route.test.ts src/lib/server/coopClaimCodexMasteryRoute.test.ts`

Expected: PASS.

### Task 3: Achievement progress UI

**Files:**
- Modify: `src/adventure/v2/V2UnexploredTreeView.tsx`
- Modify: `src/adventure/v2/V2UnexploredTreeView.test.tsx`

**Interfaces:**
- Consumes: `UNEXPLORED_ACHIEVEMENTS` and `snapshot.achievementIds`.
- Produces: an accessible `탐사 업적` section with ten list items and `완료`/`미완료` labels.

- [x] **Step 1: Write the failing render test**

Render a snapshot containing `first_personal_boss` and assert that the section shows all ten names, marks that entry `완료`, marks another entry `미완료`, and displays `탐사 포인트 +1` ten times.

- [x] **Step 2: Run the UI test and confirm RED**

Run: `npm test -- src/adventure/v2/V2UnexploredTreeView.test.tsx`

Expected: FAIL because no achievement list is rendered.

- [x] **Step 3: Render the catalog with opaque surfaces**

Import `CheckCircle` and the catalog, create a set from `snapshot.achievementIds`, and render each entry in `SURFACE_INSET` without container opacity classes. Use text/icon color to distinguish incomplete entries.

- [x] **Step 4: Run focused and full verification**

Run: `npm test -- src/adventure/data/v2/unexploredProgression.test.ts src/adventure/data/v2/unexploredState.test.ts src/app/api/v2/coop/claim/route.test.ts src/lib/server/coopClaimCodexMasteryRoute.test.ts src/lib/server/unexploredService.test.ts src/adventure/v2/V2UnexploredTreeView.test.tsx`

Run: `npx tsc --noEmit`

Run: `npm test -- --testTimeout=15000`

Expected: all commands exit 0.

- [x] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-29-unexplored-achievements.md docs/superpowers/plans/2026-08-29-unexplored-achievements.md src/adventure/data/v2/unexploredState.ts src/adventure/data/v2/unexploredState.test.ts src/adventure/data/v2/unexploredProgression.ts src/adventure/data/v2/unexploredProgression.test.ts src/app/api/v2/coop/claim/route.ts src/app/api/v2/coop/claim/route.test.ts src/lib/server/coopClaimCodexMasteryRoute.test.ts src/lib/server/unexploredService.test.ts src/adventure/v2/V2UnexploredTreeView.tsx src/adventure/v2/V2UnexploredTreeView.test.tsx
git commit -m "fix: correct unexplored achievement progression"
```
