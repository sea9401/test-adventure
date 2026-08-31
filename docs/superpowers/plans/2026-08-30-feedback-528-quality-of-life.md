# Feedback 528 Quality-of-Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved preset safeguards, farm/ranch information, guild dining display, expedition guide, and manual clarity updates from feedback 528.

**Architecture:** Reuse the existing game dialog and modal primitives, and derive all displayed XP, equipment names, probabilities, and location labels from current game data. Keep each behavior in a focused helper or component so it can be tested without exercising unrelated network routes.

**Tech Stack:** Next.js App Router, React client/server components, TypeScript, Vitest, Testing Library, Tailwind surface constants.

## Global Constraints

- Do not implement public-cooking undiscovered filters or multi-ingredient AND search.
- Do not change database schemas, recipe combinations, reward probabilities, or balance.
- Use `SURFACE_CARD` and `SURFACE_INSET` for new opaque panels and cards.
- Do not deploy.
- Preserve the existing modified `docs/superpowers/specs/2026-08-27-unexplored-monster-pools-design.md` file.

---

### Task 1: Preset destructive-action confirmations

**Files:**
- Create: `src/adventure/v2/presetConfirmation.ts`
- Create: `src/adventure/v2/presetConfirmation.test.ts`
- Modify: `src/adventure/v2/V2LoadoutPresetsPanel.tsx`
- Modify: `src/adventure/v2/V2CombatLoadoutPresetsView.tsx`

**Interfaces:**
- Produces: `confirmPresetOverwrite({ name, onConfirm, confirm? }): Promise<boolean>`
- Produces: `confirmPresetDelete({ name, onConfirm, confirm? }): Promise<boolean>`

- [ ] Write tests that cancel without invoking `onConfirm`, confirm exactly once, and verify the named warning/danger dialog options.
- [ ] Run `npx vitest run src/adventure/v2/presetConfirmation.test.ts` and verify the missing-module failure.
- [ ] Implement the two helpers using `confirmGameAction`.
- [ ] Route overwrite/delete handlers in both preset UIs through the helpers.
- [ ] Run the helper and both preset component test files.
- [ ] Commit the focused preset change.

### Task 2: Farm and ranch production information

**Files:**
- Modify: `src/adventure/v2/farmBatchActions.ts`
- Modify: `src/adventure/v2/farmBatchActions.test.ts`
- Modify: `src/adventure/v2/useFarm.ts`
- Modify: `src/adventure/v2/AdventurerFarmPanel.tsx`
- Modify: `src/adventure/v2/AdventurerFarmPanel.test.tsx`
- Modify: `src/adventure/v2/FarmRanchPanel.tsx`
- Modify: `src/adventure/v2/FarmRanchPanel.test.tsx`

**Interfaces:**
- Extends: `runFarmPlotBatch(...)` result with `farmingXpGained: number`.
- Consumes: `farmCropMasteryGain(cropId)` and `RANCH_ANIMAL_DEFINITIONS[animalId].xpPerCycle`.

- [ ] Add failing batch tests proving three harvest responses sum literal XP values.
- [ ] Add failing render tests for crop `시간 · 개수 · 농사 XP` and ranch `시간 · 개수 · 농사 XP` text.
- [ ] Run the three targeted tests and confirm failures are caused by missing XP information.
- [ ] Sum harvest XP in `runFarmPlotBatch`, include it in batch harvest notices, and render crop/animal XP from authoritative data.
- [ ] Re-run the targeted farm/ranch tests.
- [ ] Commit the focused farm/ranch change.

### Task 3: Expanded character-card guild dining effect

**Files:**
- Modify: `src/adventure/v2/V2CharacterCard.tsx`
- Modify: `src/adventure/v2/V2CharacterCard.test.tsx`
- Modify: `src/adventure/v2/V2AdventureHome.tsx`

**Interfaces:**
- Extends: `V2CharacterCard` with `activeGuildDiningEffect?: GuildDiningEffectSummary | null`.

- [ ] Add a failing component test that renders an active guild feast in the expanded card and asserts its two XP bonuses and remaining time.
- [ ] Run `npx vitest run src/adventure/v2/V2CharacterCard.test.tsx` and confirm the new test fails.
- [ ] Add a focused guild dining badge with expiry countdown and pass the server summary from `V2AdventureHome`.
- [ ] Re-run character-card and compact-summary tests.
- [ ] Commit the focused guild dining change.

### Task 4: Storm expedition guide dialog and drop locations

**Files:**
- Create: `src/adventure/v2/StormExpeditionGuideDialog.tsx`
- Create: `src/adventure/v2/StormExpeditionGuideDialog.test.tsx`
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`

**Interfaces:**
- Produces: `StormExpeditionGuideDialog({ open, onClose })`.
- Consumes: expedition attempt/stage constants, route equipment pools, unique equipment IDs/chances, and `V2_EQUIPMENT` names.

- [ ] Add a failing dialog test for core rules, route-specific regular equipment, guardian/final unique locations, and close behavior.
- [ ] Run the new test and confirm the missing-component failure.
- [ ] Implement the accessible opaque-surface modal with data-derived reward tables.
- [ ] Replace the ambiguous header refresh icon with a help button and state-controlled dialog; retain error retry behavior.
- [ ] Run the guide and expedition view tests.
- [ ] Commit the focused expedition change.

### Task 5: Manual audit and player-facing hunting labels

**Files:**
- Modify: `src/app/manual/content/combat-formulas.tsx`
- Modify: `src/app/manual/content/hunting.tsx`
- Modify: `src/app/manual/content/equipment.tsx`
- Modify: `src/app/manual/content/compendium.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: `src/adventure/v2/V2CodexView.tsx`
- Modify: `src/adventure/v2/V2CodexView.test.ts`
- Modify: `src/adventure/v2/V2StormExpeditionView.tsx`

**Interfaces:**
- Consumes: `huntStageName(depth)` for player-facing location names.
- Consumes: storm expedition reward constants and equipment catalog names for manual reward tables.

- [ ] Add failing manual render assertions for HP/MP order, the SPI clarification, named hunting zones, and expedition equipment locations.
- [ ] Add a failing codex assertion for `천공 균열 최심부 무기 완제품` with no `78단계` label.
- [ ] Run the targeted manual/codex tests and confirm expected failures.
- [ ] Expand the formula explanation, add expedition drop tables, and replace numeric hunting-depth prose with region/zone labels.
- [ ] Replace the locked expedition progress fraction with a named unlock condition and update codex user copy.
- [ ] Run manual, codex, and expedition tests.
- [ ] Commit the focused documentation/label change.

### Task 6: Integrated verification

**Files:**
- Verify all files changed by Tasks 1–5.

- [ ] Run all targeted Vitest files from Tasks 1–5 in one command.
- [ ] Run ESLint on all changed TypeScript/TSX files.
- [ ] Run `npx tsc --noEmit`.
- [ ] Inspect `git diff --check`, `git status --short`, and the cumulative diff while preserving unrelated user changes.
- [ ] Commit any verification-only correction, without deploying, pushing, merging, or opening a PR.
