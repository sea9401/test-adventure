# Bloodline Burst Pattern Resource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let combat patterns select a basic attack only when Bloodline Cleaver's four-action bleed burst is ready.

**Architecture:** Compute readiness in the shared tier-6 unique runtime and expose it as a boolean-like `bloodlineBurstReady` combat resource. PvE and PvP inject the value into the existing pattern context, while parsing and UI reuse the generic `self_resource` path.

**Tech Stack:** TypeScript, React 19, Next.js 16.2, Vitest

## Global Constraints

- Do not deploy.
- Preserve the existing burst damage, bleed preservation, and four-action cadence.
- Keep old saved patterns valid and treat the missing resource as 0.
- Use tests before production changes.

---

### Task 1: Shared readiness and pattern contract

**Files:**
- Modify: `src/adventure/v2/combat/tier6UniqueEffects.test.ts`
- Modify: `src/adventure/v2/combat/tier6UniqueEffects.ts`
- Modify: `src/adventure/v2/combat/combatPattern.test.ts`
- Modify: `src/adventure/v2/combat/combatPattern.ts`

**Interfaces:**
- Consumes: equipped signatures, `Tier6UniqueRuntimeState`, and current 1-based action ID.
- Produces: `isBleedBurstReady(...): boolean` and `V2PatternSelfResource` value `bloodlineBurstReady`.

- [x] **Step 1: Write failing readiness and pattern tests**

Assert readiness is true before the first burst, false through action 4 after a burst at action 1, true at action 5, and false without the signature. Assert parser and condition evaluation retain `bloodlineBurstReady` and distinguish 0 from 1.

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/combatPattern.test.ts`

Expected: FAIL because the readiness function and resource identifier do not exist.

- [x] **Step 3: Add the minimal shared helper and resource identifier**

Implement `isBleedBurstReady(signatures, state, actionId)` with the same four-action boundary used by burst resolution. Extend resource parsing with `bloodlineBurstReady`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 2: Engine injection and UI

**Files:**
- Modify: `src/adventure/v2/combat/combatPatternCast.test.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/V2CombatPatternView.test.tsx`
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Modify: `src/adventure/data/v2/arenaLoadout.test.ts`
- Modify: `src/adventure/data/v2/arenaLoadout.ts`

**Interfaces:**
- Consumes: `attacker.bloodlineBurstReady?: boolean`.
- Produces: pattern context resource value 1 when ready and 0 otherwise; UI option `혈맥 폭발 준비` with maximum 1.

- [x] **Step 1: Write failing cast and UI tests**

Create a pattern whose first block requires both bleed stacks and `bloodlineBurstReady >= 1` for a basic attack, with an always-skill fallback. Assert ready selects basic attack and waiting selects the skill. Assert the UI renders the resource name and `max=1`.

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/V2CombatPatternView.test.tsx`

Expected: FAIL because cast context and UI do not expose the new resource.

- [x] **Step 3: Inject readiness in shared cast and both engines**

Map `attacker.bloodlineBurstReady` to 1/0 in `buildPatternCtx`. In both engines, call the shared readiness helper with the current equipment signatures, tier-6 runtime state, and upcoming action ID.

- [x] **Step 4: Add the UI option and 1-value bound**

Add `혈맥 폭발 준비` to the resource picker and use maximum 1 for its numeric condition. Add the same label to arena loadout summaries.

- [x] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 3: Verification and commit

**Files:**
- Verify all files listed above and both documentation files.

**Interfaces:**
- Consumes: completed shared, engine, and UI changes.
- Produces: one verified local commit without deployment.

- [x] **Step 1: Run related tests**

Run: `npm test -- src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/tier6UniquePvp.test.ts src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/data/v2/arenaLoadout.test.ts`

- [x] **Step 2: Run type and lint validation**

Run: `npx tsc --noEmit` and targeted ESLint on modified TypeScript files.

- [x] **Step 3: Review and commit**

Run `git diff --check`, inspect the diff, stage only planned files, and commit with `fix: expose bloodline burst readiness to combat patterns`.
