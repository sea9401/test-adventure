# Active Skill Equipment Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore offensive equipment and set triggers on direct-damage active skills in PvE and PvP.

**Architecture:** Add a pure shared resolver in `signatureEffects.ts` that evaluates one damaging action's `on_hit` and `on_crit` signatures. Apply its result in the existing PvE and PvP skill state-merging paths without changing basic-attack behavior or item balance values.

**Tech Stack:** TypeScript, Vitest, existing V2 combat engines.

## Global Constraints

- One active-skill cast performs one equipment proc roll even when it has multiple damage hits.
- Buff and healing skills do not activate offensive hit or critical triggers.
- PvP `status_block_once` blocks the cast's target statuses together and is consumed once.
- Preserve unrelated working-tree changes and do not deploy.

---

### Task 1: PvE regression coverage

**Files:**
- Modify: `src/adventure/battle/engine.skillCrit.test.ts`

**Interfaces:**
- Consumes: `applyPlayerV2SkillCast`, `initialBattleState`.
- Produces: regression coverage for skill-triggered poison, shock, and defense reduction.

- [ ] **Step 1: Write the failing test**

Add a real skill-cast test with deterministic RNG and literal expected state:

```ts
expect(cast.state.enemyV2Dots.find((dot) => dot.tag === "poison")?.stacks).toBe(1);
expect(cast.state.buffs.enemySpdMult).toBe(0.75);
expect(cast.state.buffs.enemyDefDebuffPct).toBe(10);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `npm test -- src/adventure/battle/engine.skillCrit.test.ts`

Expected: the new assertions fail because active skills currently leave poison empty and both enemy debuffs inactive.

- [ ] **Step 3: Keep the failing test for Task 3**

Do not alter expectations after the failure; the production change must satisfy them.

### Task 2: PvP regression coverage

**Files:**
- Modify: `src/adventure/battle/engine-pvp.test.ts`

**Interfaces:**
- Consumes: `castV2SkillOnAttackerTurnPvP`, `initialBattleStatePvP`.
- Produces: mirrored PvP coverage and a status-block boundary test.

- [ ] **Step 1: Write the failing PvP proc test**

Use the same deterministic signatures and assert literal opponent/attacker state:

```ts
expect(cast.state.p2.v2Dots.find((dot) => dot.tag === "poison")?.stacks).toBe(1);
expect(cast.state.p1.buffs.enemySpdMult).toBe(0.75);
expect(cast.state.p1.buffs.enemyDefDebuffPct).toBe(10);
```

- [ ] **Step 2: Write the failing status-block test**

Give the defender `status_block_once`, cast a skill with equipment statuses, and assert no poison/slow/defense reduction plus `statusBlockUsed === true`.

- [ ] **Step 3: Run the tests to verify RED**

Run: `npm test -- src/adventure/battle/engine-pvp.test.ts`

Expected: the proc test fails because no offensive signature except self speed is applied; the block test fails until combined blocking is implemented.

### Task 3: Shared trigger resolver and engine integration

**Files:**
- Modify: `src/adventure/v2/combat/signatureEffects.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`

**Interfaces:**
- Produces: `resolveOffensiveSignatureTriggers(signatures, input, roll?)` returning critical speed/poison/chill/defense-debuff and hit poison/bleed/shock results.
- Consumes: existing `onCrit*`, `firesOnCritPoison`, and `rollOnHit*` helpers.

- [ ] **Step 1: Implement the shared pure resolver**

Evaluate each signature family once. Suppress shock when a slow is already active or critical chill fires.

- [ ] **Step 2: Integrate PvE skill state**

Call the resolver only when `landedSkillHits > 0`; merge generated dots, slow, defense reduction, self speed, and logs into the existing skill result.

- [ ] **Step 3: Integrate PvP skill state**

Mirror PvE application using attacker/opponent state. Combine target equipment statuses with the existing `status_block_once` decision and consume the block once.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm test -- src/adventure/battle/engine.skillCrit.test.ts src/adventure/battle/engine-pvp.test.ts`

Expected: all tests pass.

### Task 4: Verification and commit

**Files:**
- Verify all files above plus both documentation files.

**Interfaces:**
- Consumes: completed implementation and tests.
- Produces: a verified local commit containing only this bug fix.

- [ ] **Step 1: Run adjacent combat tests**

Run: `npm test -- src/adventure/battle/engine.skillCrit.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/combatGolden.test.ts`

- [ ] **Step 2: Run type and lint checks**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/combat/signatureEffects.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/battle/engine.skillCrit.test.ts src/adventure/battle/engine-pvp.test.ts`

- [ ] **Step 3: Review and commit only scoped files**

Run `git diff --check`, stage the five implementation/test files and two documentation files explicitly, review `git diff --cached`, then commit with `fix: apply equipment triggers to active skills`.
