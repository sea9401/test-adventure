# Loadout Preset SP Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make saved skill presets explain current SP incompatibilities and let players repair and apply them without rebuilding the preset from scratch.

**Architecture:** Derive a preset diagnosis from the current skill catalog, learned library, and SP budget in a pure client-side module. The preset panel renders that diagnosis, keeps an editable draft separate from the saved preset, and applies the draft through the existing authoritative `/api/v2/me/loadout` route. Saving the adjusted draft continues through `/api/v2/me/loadout-presets`, so no storage or API schema migration is required.

**Tech Stack:** TypeScript, React 19, Next.js client components, Vitest, existing V2 loadout APIs.

## Global Constraints

- Preserve the unrelated in-progress skill visibility changes in `V2LoadoutPanel.tsx` and its test.
- Do not deploy or change maintenance mode.
- Keep the original saved preset unchanged until the user explicitly chooses the save action.
- Treat the saved skill order as priority order; automatic fitting removes the lowest-priority valid skills from the end.
- Continue to rely on `/api/v2/me/loadout` for final learned-skill and SP validation.
- Use opaque existing surfaces in both light and dark mode.

---

### Task 1: Preset Diagnosis And Automatic Fit

**Files:**
- Create: `src/adventure/v2/loadoutPresetDiagnostics.ts`
- Create: `src/adventure/v2/loadoutPresetDiagnostics.test.ts`

**Interfaces:**
- Consumes: a saved skill ID list, the current learned library, and current SP budget.
- Produces: `diagnoseLoadoutPreset(skills, library, spBudget)` with per-skill status, current SP total, overage, and applicability.
- Produces: `autoFitLoadoutPreset(skills, library, spBudget)` with retained and removed IDs.

- [ ] **Step 1: Write failing diagnosis tests**

Cover an over-budget preset (`67 / 60`, over by `7`), a missing learned skill, an unknown catalog ID, and a valid preset. Assert literal totals and status values.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/loadoutPresetDiagnostics.test.ts`

Expected: FAIL because the diagnostics module does not exist.

- [ ] **Step 3: Implement the minimal pure diagnosis**

Resolve names and current costs from the current catalog, use the library as the learned set, and retain unknown IDs as visible zero-cost invalid rows instead of silently dropping them.

- [ ] **Step 4: Add failing automatic-fit tests**

Assert that invalid skills are removed first, then valid skills are removed from the end until the total fits. Assert the input list is not mutated and a fitting preset is returned unchanged.

- [ ] **Step 5: Implement automatic fitting and verify GREEN**

Run: `npm test -- src/adventure/v2/loadoutPresetDiagnostics.test.ts`

Expected: all diagnostics tests pass.

### Task 2: Preset Adjustment UI And Apply Flow

**Files:**
- Modify: `src/adventure/v2/V2LoadoutPresetsPanel.tsx`
- Create: `src/adventure/v2/V2LoadoutPresetsPanel.test.tsx`
- Modify: `src/adventure/v2/V2SkillLearnView.tsx`

**Interfaces:**
- Consumes: `spBudget` and `library` from the existing `V2LoadoutData` response.
- Consumes: Task 1 diagnosis and automatic-fit helpers.
- Produces: per-preset current SP status, an adjustment panel, automatic fit, draft apply, and apply-plus-save actions.

- [ ] **Step 1: Write failing render tests**

Render the exported preset row/adjustment surface with deterministic data and assert `필요 SP 67 / 보유 SP 60`, `7 SP 초과`, individual current skill costs, and missing-skill reasons are visible.

- [ ] **Step 2: Run the panel test and verify RED**

Run: `npm test -- src/adventure/v2/V2LoadoutPresetsPanel.test.tsx`

Expected: FAIL because the diagnostic presentation does not exist.

- [ ] **Step 3: Add current loadout context to the panel**

Pass `loadout.spBudget` and `loadout.library` from both `V2SkillLearnView` render paths. Do not duplicate catalog costs in component state.

- [ ] **Step 4: Implement diagnostic and adjustment presentation**

Show current required/budget SP on every preset. Invalid presets show exact overage and invalid skills. Opening adjustment copies the saved IDs into a draft; checkboxes remove or restore individual skills, and automatic fit replaces only the draft.

- [ ] **Step 5: Implement apply and apply-plus-save**

`조정한 구성으로 적용` posts the draft to `/api/v2/me/loadout` and preserves the saved preset. `적용 후 프리셋 저장` first applies successfully, then replaces only that preset through `/api/v2/me/loadout-presets`. Server rejection copy includes returned `spUsed`, `spBudget`, `notLearned`, and `unknown` details where available.

- [ ] **Step 6: Run focused tests and type checking**

Run: `npm test -- src/adventure/v2/loadoutPresetDiagnostics.test.ts src/adventure/v2/V2LoadoutPresetsPanel.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx`

Run: `npx tsc --noEmit`

Expected: both commands exit `0`.

### Task 3: Regression Verification And Commit

**Files:**
- Review all files changed by Tasks 1 and 2.

**Interfaces:**
- Produces: a verified local commit without deployment.

- [ ] **Step 1: Run related tests**

Run: `npm test -- src/adventure/v2/loadoutPresetDiagnostics.test.ts src/adventure/v2/V2LoadoutPresetsPanel.test.tsx src/adventure/v2/V2LoadoutPanel.test.tsx src/adventure/v2/V2LoadoutPresetsPanel.test.tsx`

Expected: zero failed tests.

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/loadoutPresetDiagnostics.ts src/adventure/v2/loadoutPresetDiagnostics.test.ts src/adventure/v2/V2LoadoutPresetsPanel.tsx src/adventure/v2/V2LoadoutPresetsPanel.test.tsx src/adventure/v2/V2SkillLearnView.tsx`

Expected: both commands exit `0`.

- [ ] **Step 3: Review scope and whitespace**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; unrelated dirty files remain preserved.

- [ ] **Step 4: Commit only this feature and its approved plan**

Stage the plan, diagnostics module/tests, preset panel/tests, and `V2SkillLearnView.tsx`. Do not stage existing unrelated modifications.
