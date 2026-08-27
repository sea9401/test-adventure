# Scar Counter Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Scar Counter's obsolete +1 bleed stack with a source-preserving minimum-five-action bleed refresh.

**Architecture:** The pure tier-6 runtime emits one explicit `refresh_bleed` command alongside the existing defense debuff. Both combat adapters apply it through `applyBleedChangeToDots`, keeping PvE and PvP behavior symmetrical and preserving the original bleed payload.

**Tech Stack:** TypeScript, Vitest, existing tier-6 unique runtime and combat adapters

## Global Constraints

- Do not deploy.
- Preserve Bloodline Cleaver's 50% non-consuming burst and four-action cadence.
- Preserve Scar Counter's 3% defense reduction per current bleed stack for two actions.
- Preserve unrelated worktree changes.
- Use TDD and observe each new behavior fail before production edits.

---

### Task 1: Shared command contract

**Files:**
- Modify: `src/adventure/v2/combat/tier6UniqueEffects.test.ts`
- Modify: `src/adventure/v2/combat/tier6UniqueEffects.ts`

**Interfaces:**
- Consumes: a successful `bleed_burst` direct-hit event while `bleed_aftermath` is equipped.
- Produces: `Tier6UniqueCommand` `{ kind: "refresh_bleed", turns: 5 }` and the unchanged defense debuff.

- [x] **Step 1: Replace the old +1-stack expectation with a failing refresh command expectation**

Assert the command list contains `refresh_bleed` with literal `turns: 5`, contains the existing 12%/2-action defense debuff for four stacks, and contains no bleed `apply_dot` command.

- [x] **Step 2: Run the shared test and verify RED**

Run: `npm test -- src/adventure/v2/combat/tier6UniqueEffects.test.ts`

Expected: FAIL because the runtime still emits `apply_dot` with one bleed stack.

- [x] **Step 3: Add the refresh command and emit it from bleed aftermath**

Add the command union member and replace the bleed `apply_dot` emission without altering the burst or defense command.

- [x] **Step 4: Run the shared test and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 2: PvE/PvP state preservation

**Files:**
- Modify: `src/adventure/v2/combat/tier6UniquePve.test.ts`
- Modify: `src/adventure/v2/combat/tier6UniquePveAdapter.ts`
- Modify: `src/adventure/v2/combat/tier6UniquePvp.test.ts`
- Modify: `src/adventure/v2/combat/tier6UniquePvpAdapter.ts`

**Interfaces:**
- Consumes: `refresh_bleed` with `turns: 5`.
- Produces: existing bleed with unchanged stacks and damage-source fields, and turns equal to `max(existing turns, 5)`.

- [x] **Step 1: Add failing PvE/PvP behavior tests**

Use real bleed dots with two remaining actions and distinct source values. Assert each adapter returns five actions without changing the rest of the dot; also assert a six-action dot remains at six.

- [x] **Step 2: Run adapter tests and verify RED**

Run: `npm test -- src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/tier6UniquePvp.test.ts`

Expected: FAIL because adapters do not recognize `refresh_bleed`.

- [x] **Step 3: Apply source-preserving refresh in both adapters**

Use `applyBleedChangeToDots(current, { stacksToAdd: 0, setTurns: command.turns, reason: "refresh" })` and add a concise combat-log description.

- [x] **Step 4: Run adapter tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 3: Player-facing description and verification

**Files:**
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`

**Interfaces:**
- Consumes: `bleed_aftermath` signature metadata.
- Produces: `출혈 폭발 시 출혈 지속을 최소 5회로 갱신하고 현재 출혈 중첩당 방어 3% 감소`.

- [x] **Step 1: Update the tooltip expectation and verify RED**

Run: `npm test -- src/adventure/data/v2/v2Equipment.test.ts`

Expected: FAIL because the old text still promises one added bleed stack.

- [x] **Step 2: Update the signature label and verify GREEN**

Change only the `bleed_aftermath` label and rerun the Step 1 command. Expected: PASS.

- [x] **Step 3: Run verification and commit**

Run the related tests, `npx tsc --noEmit`, targeted ESLint, `git diff --check`, and the full Vitest suite. Stage only files in this plan and commit with `fix: rework scar counter bleed preservation`.
