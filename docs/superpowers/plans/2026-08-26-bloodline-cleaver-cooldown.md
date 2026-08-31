# Bloodline Cleaver Cooldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve enemy bleed when Bloodline Cleaver bursts while limiting the 50% burst to once per four player actions.

**Architecture:** Keep the rule in the shared pure tier-6 unique runtime so PvE and PvP consume the same decision. Store the last eligible action ID in `Tier6UniqueRuntimeState`; adapters only execute the resulting fixed-damage and aftermath commands, and no longer receive a bleed-consumption command.

**Tech Stack:** TypeScript, Vitest, existing PvE/PvP combat engines

## Global Constraints

- Do not deploy.
- Do not change permanent save schemas or add a database migration.
- Preserve unrelated worktree changes.
- Use TDD: observe the new behavior tests fail before production edits.

---

### Task 1: Shared burst rule

**Files:**
- Modify: `src/adventure/v2/combat/tier6UniqueEffects.test.ts`
- Modify: `src/adventure/v2/combat/tier6UniqueEffects.ts`

**Interfaces:**
- Consumes: `Tier6UniqueEvent.origin.actionId`, `event.bleedRemainingDamage`, and the `bleed_burst` signature.
- Produces: `Tier6UniqueRuntimeState.bleedBurstLastActionId` and a `damage_fixed` command with 50% of remaining bleed damage, without `consume_dot`.

- [x] **Step 1: Write the failing shared-runtime tests**

Change the existing bleed test to expect 500 fixed damage from 1,000 remaining damage, no `consume_dot`, and preserved aftermath commands. Add a test that fires at action 1, blocks action IDs 1 through 4, and fires again at action 5.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/v2/combat/tier6UniqueEffects.test.ts`

Expected: FAIL because the current runtime emits 700 damage, consumes bleed, and has no action cooldown.

- [x] **Step 3: Implement the minimal shared runtime state and gate**

Add a sanitized last-action field. Gate `bleed_burst` on a four-action ID interval, set the field when it fires, remove the consume command, and change the multiplier from `0.7` to `0.5`.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/adventure/v2/combat/tier6UniqueEffects.test.ts`

Expected: PASS.

### Task 2: PvE/PvP state preservation and player-facing text

**Files:**
- Modify: `src/adventure/v2/combat/tier6UniquePve.test.ts`
- Modify: `src/adventure/v2/combat/tier6UniquePvp.test.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`

**Interfaces:**
- Consumes: shared tier-6 unique commands.
- Produces: observable preservation of enemy bleed in both modes and accurate signature descriptions.

- [x] **Step 1: Add PvE/PvP regression assertions and tooltip expectations**

Use real battle states with Bloodline Cleaver and active bleed. Assert the burst damage occurs while the original bleed remains. Update signature label assertions to cover 50%, no consumption, and four-action cadence.

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/tier6UniquePvp.test.ts src/adventure/data/v2/v2Equipment.test.ts`

Expected: FAIL until runtime behavior and labels match the design.

- [x] **Step 3: Update player-facing descriptions**

Describe Bloodline Cleaver as a non-consuming 50% burst with a four-action limit. Describe Scar Counter as adding one bleed stack and reducing defense per bleed stack present at burst time.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run the same focused command. Expected: PASS.

### Task 3: Verification and commit

**Files:**
- Verify all modified source, tests, and design/plan documents.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: a verified local commit with no deployment.

- [x] **Step 1: Run related combat tests**

Run: `npm test -- src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/tier6UniquePvp.test.ts src/adventure/v2/combat/tier6UniqueSafety.test.ts src/adventure/data/v2/v2Equipment.test.ts`

- [x] **Step 2: Run TypeScript validation**

Run: `npx tsc --noEmit`

- [x] **Step 3: Review diff and commit**

Run `git diff --check`, inspect `git diff`, stage only the planned files, and commit with `fix: preserve bleed for bloodline cleaver`.
