# Magic Defense Penetration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate PvE magic damage magnitude from magic-defense penetration so future monster attack growth no longer erodes magic-defense efficiency by itself.

**Architecture:** Add an optional `magicPenetration` rating to monsters and generate its default from dungeon difficulty through one progression curve. PvE magic damage compares player magic defense with that rating, while attack remains responsible only for raw damage; PvP keeps its existing rules. Carry the rating through unexplored monsters, personal bosses, replay payloads, and the matchup UI so runtime behavior and displayed estimates use the same inputs.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Vitest

## Global Constraints

- Preserve the existing PvP damage rules.
- Preserve the 15% minimum direct-damage floor and 85% asymptotic mitigation ceiling.
- Do not deploy or enable maintenance mode.
- Work from production `origin/main` without modifying the user's dirty primary checkout.
- Use tests to lock behavior at current and synthetic future difficulty values.

---

### Task 1: Magic penetration progression and monster data

**Files:**
- Modify: `src/adventure/data/monsters/types.ts`
- Modify: `src/adventure/data/v2/dungeonLadder.ts`
- Modify: `src/adventure/data/v2/monsterScale.ts`
- Modify: `src/adventure/data/v2/dungeon.test.ts`

**Interfaces:**
- Produces: `Monster.magicPenetration?: number`
- Produces: `floorMagicPenetration(depth: number): number`
- Consumes: existing `floorStatMult(depth)` progression curve

- [x] **Step 1: Write failing tests for finite monotonic progression, synthetic depths 150/200, and authored penetration bonuses.**
- [x] **Step 2: Run `npm test -- src/adventure/data/v2/dungeon.test.ts` and verify failures are caused by the missing field/function.**
- [x] **Step 3: Add the monster field, depth curve, and scale propagation with non-negative finite normalization.**
- [x] **Step 4: Re-run the focused test and verify it passes.**

### Task 2: Attack-independent PvE magic mitigation

**Files:**
- Modify: `src/adventure/data/v2/v2CombatConstants.ts`
- Modify: `src/adventure/data/v2/v2CombatConstants.test.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.magicAttack.test.ts`

**Interfaces:**
- Produces: `magicDefenseDamageReductionPct(magicDefense, magicPenetration)`
- Produces: `damageToMagicDefender(atk, magicDefense, magicPenetration?)`
- Consumes: `Monster.magicPenetration`

- [x] **Step 1: Write failing tests proving identical defense/penetration yields identical reduction at low and high attack, greater penetration lowers mitigation, and the engine reads the monster field.**
- [x] **Step 2: Run the two focused test files and verify the expected RED failures.**
- [x] **Step 3: Replace attack-contested mitigation with the rating contest and pass the enemy rating at both body and barrier damage sites.**
- [x] **Step 4: Re-run the focused tests and verify they pass.**

### Task 3: Unexplored monsters and personal bosses

**Files:**
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.test.ts`
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`
- Modify: `src/adventure/v2/combat/unexploredBossOffenseBalance.test.ts`

**Interfaces:**
- Consumes: generated `Monster.magicPenetration`
- Produces: unexplored common/special monsters and personal bosses with explicit runtime penetration ratings

- [x] **Step 1: Write failing tests proving every difficulty 95–120 runtime monster has finite positive penetration and personal-boss scaling preserves it.**
- [x] **Step 2: Run the focused unexplored and boss tests and verify the expected RED failures.**
- [x] **Step 3: Carry the common baseline into special monsters and scale personal-boss penetration with other combat contest ratings.**
- [x] **Step 4: Re-run the focused tests and update only behaviorally intentional balance assertions.**

### Task 4: Replay, matchup display, and manual

**Files:**
- Modify: `src/adventure/data/v2/replayPayload.ts`
- Modify: `src/adventure/data/v2/replayPayload.test.ts`
- Modify: `src/adventure/battle/BattleScene.tsx`
- Modify: `src/adventure/battle/CombatMatchupSummary.tsx`
- Modify: `src/adventure/battle/CombatMatchupSummary.test.tsx`
- Modify: `src/app/manual/content/combat-formulas.tsx`

**Interfaces:**
- Produces: replay-compatible optional `magicPenetration` metadata
- Consumes: rating in enemy stat details and magic-defense estimate

- [x] **Step 1: Write failing tests that replay serialization preserves penetration and the matchup estimate changes with penetration rather than attack.**
- [x] **Step 2: Run the replay and matchup tests and verify the expected RED failures.**
- [x] **Step 3: Wire the optional field through replay and battle UI, show it for magic attackers, and update the manual formula.**
- [x] **Step 4: Re-run focused tests and verify old replay payloads remain finite through the default rating.**

### Task 5: Balance invariants and completion verification

**Files:**
- Modify: `src/adventure/data/v2/v2CombatConstants.test.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.test.ts`

**Interfaces:**
- Consumes: all preceding runtime behavior
- Produces: regression protection for current and future content scaling

- [x] **Step 1: Add invariants for specialist/balanced/no-investment profiles at difficulties 95–120 and ratio invariance at synthetic depths 150/200.**
- [x] **Step 2: Run all changed-area tests, `npx tsc --noEmit`, and `npx eslint` for changed source files.**
- [x] **Step 3: Re-run the two baseline timeout tests individually, then run the full suite when host contention permits.**
- [x] **Step 4: Inspect `git diff --check`, changed files, and final diff; commit the verified implementation without deploying.**
