# Cookie Feedback Quality-of-Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement explicit combat-pattern overwrite, configurable and resumable storm expedition autoplay, stronger fishing haptics, Star Grave deepest-drop parity, complete blacksmith technique choices, and bottom battle-log close actions.

**Architecture:** Extend existing client-side plan and preset models without changing server schemas, and keep old stored autoplay plans safe by treating absent risk decisions as declines. Put haptic behavior and route reconciliation in focused pure helpers, adjust the authoritative drop and blacksmith data functions, and reuse existing confirmation, surface, and navigation patterns.

**Tech Stack:** Next.js 16 App Router, React 19 Client Components, TypeScript, Vitest, Testing Library, Tailwind surface constants.

## Global Constraints

- Preserve existing stored storm expedition plans and default all missing risk decisions to `decline`.
- Do not change storm risk-event server rules, Sky Rift weapon drops, or signature unique rates.
- Do not add audio or notification permissions for fishing.
- Do not change database schemas.
- Use existing opaque surface constants for new panels.
- Do not deploy.

---

### Task 1: Combat-pattern preset overwrite

**Files:**
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Create: `src/adventure/v2/V2CombatPatternView.overwrite.test.tsx`

**Interfaces:**
- Reuses: `confirmPresetOverwrite({ name, onConfirm })`.
- Produces: a per-row `현재 패턴으로 덮어쓰기` action.

- [ ] Add a jsdom test that loads one pattern preset, clicks its overwrite button, confirms, and expects the preset POST body to contain the current blocks under the same name.
- [ ] Run the test and verify it fails because the button is absent.
- [ ] Add the accessible overwrite button and confirmation-backed handler.
- [ ] Re-run the new test and existing combat-pattern tests.

### Task 2: Storm expedition risk policy and mid-run start

**Files:**
- Modify: `src/adventure/v2/stormExpeditionAutoplayPolicy.ts`
- Modify: `src/adventure/v2/stormExpeditionAutoplayPolicy.test.ts`
- Modify: `src/adventure/v2/stormExpeditionAutoplay.ts`
- Modify: `src/adventure/v2/stormExpeditionAutoplay.test.ts`
- Modify: `src/adventure/v2/StormExpeditionAutoPlanDialog.tsx`
- Modify: `src/adventure/v2/StormExpeditionAutoPlanDialog.test.tsx`
- Modify: `src/adventure/v2/StormExpeditionCommandMap.tsx`
- Modify: `src/adventure/v2/StormExpeditionCommandMap.test.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.test.tsx`

**Interfaces:**
- Extends: `StormExpeditionAutoplayPlan.riskEventDecisions?: Partial<Record<StormExpeditionRiskEventId, StormExpeditionRiskDecision>>`.
- Produces: `stormExpeditionRiskDecision(plan, eventId)` and `alignStormExpeditionPlanToVisitedRoutes(plan, visitedNodeIds)`.

- [ ] Add failing policy tests for safe legacy parsing, decision validation, and visited-route alignment.
- [ ] Add failing runner tests for accepted and declined event IDs.
- [ ] Add failing dialog and command-map tests for per-event controls and the active-run settings button.
- [ ] Run the focused storm tests and confirm the expected behavior failures.
- [ ] Implement policy parsing, alignment, UI controls, runner decisions, and active-run plan opening.
- [ ] Re-run all storm autoplay and view tests.

### Task 3: Fishing bite haptic reliability

**Files:**
- Create: `src/adventure/v2/fishingHaptics.ts`
- Create: `src/adventure/v2/fishingHaptics.test.ts`
- Modify: `src/adventure/v2/FishingView.tsx`

**Interfaces:**
- Produces: `triggerFishingBiteHaptic(navigatorLike?): boolean`.

- [ ] Add failing tests for the exact two-pulse pattern, unsupported browsers, and thrown vibration calls.
- [ ] Run the test and verify the missing-module failure.
- [ ] Implement the defensive helper and call it once from `onBite`.
- [ ] Re-run fishing helper and view tests.

### Task 4: Star Grave deepest drop parity

**Files:**
- Modify: `src/adventure/data/v2/dungeonUniqueDrops.ts`
- Modify: `src/adventure/data/v2/dungeonUniqueDrops.test.ts`

**Interfaces:**
- Extends: `bandCommonChanceForDepth(84)` to return `0.0015`.

- [ ] Change the test expectation so depth 84 is 0.15% while depths 79–83 remain unchanged.
- [ ] Run the drop test and verify the depth-84 assertion fails with 0.001.
- [ ] Add the explicit Star Grave deepest-depth branch and update authoritative comments.
- [ ] Re-run dungeon drop tests.

### Task 5: Blacksmith technique coverage

**Files:**
- Modify: `src/adventure/data/v2/blacksmithSpecialization.ts`
- Modify: `src/adventure/data/v2/blacksmithSpecialization.test.ts`
- Modify: `src/adventure/v2/guild/WorkshopCraftPanel.tsx`
- Modify: `src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`
- Modify: `src/lib/server/guildWorkshopSpecializationRoute.test.ts`

**Interfaces:**
- Extends: specialty focus catalogs for cross-role item options.
- Changes: a single matching focus group may trade quality with the item's primary-power percentile.

- [ ] Add failing data tests for a defensive weapon, offensive gloves, single-group boots, and an optionless item.
- [ ] Add a failing controlled-roll test proving a single-group focus changes the intended option without changing the weighted budget.
- [ ] Add a failing UI test for the no-applicable-focus explanation.
- [ ] Run data, UI, and route tests and confirm the coverage failures.
- [ ] Extend focus definitions, implement primary-power fallback as the comparison pool, and render the empty-state explanation.
- [ ] Re-run the focused workshop tests.

### Task 6: Bottom battle-log close actions

**Files:**
- Modify: `src/adventure/v2/V2BattleLogHandoffView.tsx`
- Modify: `src/adventure/v2/V2BattleLogHandoffView.test.tsx`
- Modify: `src/adventure/v2/SparringFullLogDialog.tsx`
- Create: `src/adventure/v2/SparringFullLogDialog.test.tsx`

**Interfaces:**
- Reuses: the existing `router.back()` and `onClose` callbacks.

- [ ] Add failing render/interaction tests proving bottom actions follow the log content and call the existing close callback.
- [ ] Run the focused tests and verify the buttons are absent.
- [ ] Add full-width, keyboard-accessible bottom buttons with opaque surrounding surfaces.
- [ ] Re-run the focused log tests.

### Task 7: Integrated verification and commit

**Files:**
- Verify every file changed in Tasks 1–6 and the two design documents.

- [ ] Run all targeted Vitest files in one command.
- [ ] Run ESLint on all changed TypeScript/TSX files.
- [ ] Run `npx tsc --noEmit` with sufficient heap and report any unrelated pre-existing failures separately.
- [ ] Run the full Vitest suite.
- [ ] Inspect `git diff --check`, `git status --short`, and the cumulative diff.
- [ ] Commit the complete local change without pushing, merging, deploying, or changing maintenance mode.
