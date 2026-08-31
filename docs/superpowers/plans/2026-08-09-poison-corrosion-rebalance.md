# Poison Corrosion Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lower poison corrosion's universal defense bypass while preserving poison-focused damage and pricing defense reduction as an expensive, freely collectible SP option.

**Architecture:** Keep the existing percentage and multiplicative defense-reduction pipeline. Change only the corrosion data, the shared poison-damage conversion coefficient, and the SP/display consumers of that coefficient so PvE and PvP remain synchronized.

**Tech Stack:** TypeScript, Vitest, existing v2 combat and skill catalog modules

## Global Constraints

- Do not add a defense-reduction cap.
- Do not add current-job or lineage equip restrictions.
- Corrosion values are exactly `3/4/5/6/7%` and combine multiplicatively.
- Corrosion poison-damage conversion is exactly `2.25`.
- Passive defense-reduction power valuation uses `pct / 3`.
- Do not deploy.

---

### Task 1: Lock the corrosion balance contract with failing tests

**Files:**
- Modify: `src/adventure/data/v2/corrosionStacking.test.ts`
- Modify: `src/adventure/v2/combat/corrosionSafety.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**
- Consumes: `V2_SKILLS`, `aggregateEquippedPassives`, `spCostOf`, `applyPlayerOnHitDots`, `describeV2Skill`
- Produces: Regression expectations for the approved corrosion values, poison multiplier, SP costs, and displayed effect

- [ ] **Step 1: Write the failing catalog and SP tests**

Assert the literal corrosion values `[3, 4, 5, 6, 7]`, combined reduction `22.66%`, and literal SP costs `[4, 4, 4, 6, 11]`.

```ts
expect(values).toEqual([3, 4, 5, 6, 7]);
expect(combineDefReductionPcts(...values)).toBeCloseTo(22.6647712);
expect(CORROSION_LINE.map((id) => spCostOf(V2_SKILLS[id]))).toEqual([
  4, 4, 4, 6, 11,
]);
```

- [ ] **Step 2: Write the failing combat test**

Use a player with `poisonedEnemyDefReductionPct: 22.6647712` and base poison `0.01`; assert the applied poison value is approximately `0.01509957352`.

```ts
const fullLinePlayer = {
  ...PLAYER,
  poisonedEnemyDefReductionPct: 22.6647712,
};
expect(poison?.pctMaxHpPerStack).toBeCloseTo(0.01509957352);
```

- [ ] **Step 3: Write the failing display test**

Assert the first `3%` corrosion passive describes `중독 피해 +6.75%`.

```ts
expect(describeV2Skill(V2_SKILLS.v2c_venomist_corrosion)).toContain(
  "중독 적 방어 -3% / 중독 피해 +6.75%",
);
```

- [ ] **Step 4: Run the focused tests and verify RED**

Run: `npm test -- --run src/adventure/data/v2/corrosionStacking.test.ts src/adventure/v2/combat/corrosionSafety.test.ts src/adventure/data/v2/v2Skills.test.ts`

Expected: FAIL because the catalog still uses `10/15/20/25/30`, the poison coefficient is `1.5`, the SP divisor is `12`, and the display multiplier is `3`.

### Task 2: Implement the approved corrosion values and shared valuation

**Files:**
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2CombatConstants.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`

**Interfaces:**
- Consumes: `CORROSION_POISON_DAMAGE_SCALE`, `poisonedEnemyDefReductionPct`
- Produces: Catalog values `3/4/5/6/7`, shared poison multiplier `2.25`, SP divisor `3`, matching effect text

- [ ] **Step 1: Change the five corrosion catalog values**

Set the five lineage passives, in tier order, to `3`, `4`, `5`, `6`, and `7`.

```ts
passive: { statPct: { luk: 10 }, poisonedEnemyDefReductionPct: 3 }
passive: { poisonedEnemyDefReductionPct: 4 }
passive: { poisonedEnemyDefReductionPct: 5 }
passive: { poisonedEnemyDefReductionPct: 6, critDmgPct: 10 }
passive: { statPct: { luk: 22 }, poisonedEnemyDefReductionPct: 7, maxHpPct: 12, evasionPct: 12, critDmgPct: 15 }
```

- [ ] **Step 2: Change the shared poison conversion coefficient**

Set `CORROSION_POISON_DAMAGE_SCALE` to `2.25` and update its explanatory comment with the new full-line result.

```ts
export const CORROSION_POISON_DAMAGE_SCALE = 2.25;
```

- [ ] **Step 3: Raise the SP valuation and synchronize display text**

Import and use `CORROSION_POISON_DAMAGE_SCALE` in `v2Skills.ts`; price corrosion as `pct / 3` and display poison amplification as `pct * CORROSION_POISON_DAMAGE_SCALE`.

```ts
mag += (p.poisonedEnemyDefReductionPct ?? 0) / 3;

chips.push(
  `중독 적 방어 -${p.poisonedEnemyDefReductionPct}% / 중독 피해 +${p.poisonedEnemyDefReductionPct * CORROSION_POISON_DAMAGE_SCALE}%`,
);
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- --run src/adventure/data/v2/corrosionStacking.test.ts src/adventure/v2/combat/corrosionSafety.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/battle/engine.enchant.test.ts`

Expected: all focused tests pass.

### Task 3: Verify and commit the isolated balance change

**Files:**
- Verify all files changed in Tasks 1 and 2

**Interfaces:**
- Consumes: completed corrosion implementation
- Produces: verified local commit without deployment

- [ ] **Step 1: Run static verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/corrosionStacking.test.ts src/adventure/v2/combat/corrosionSafety.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2CombatConstants.ts src/adventure/data/v2/v2Skills.ts`

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: zero failed test files.

- [ ] **Step 3: Inspect and commit only this task's files**

Run: `git diff --check`

Stage the two design documents and six implementation/test files explicitly, preserving unrelated worktree changes.

Commit message: `balance: rebalance poison corrosion`
