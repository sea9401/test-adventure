# Skill MP Cost Differentiation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the current archetype/tier MP pressure while making individual player skill costs reflect their catalog `mpCost` values.

**Architecture:** Keep `v2SkillMpCostValue` as the single source of truth for display and combat. Add a tier-specific raw-cost reference and offset the existing archetype/tier baseline by each skill's raw-cost deviation; retain literal zero, monster, and explicit fixed-cost precedence.

**Tech Stack:** TypeScript, Vitest, Next.js project scripts

## Global Constraints

- Do not deploy this change.
- Preserve `fixedMpCost`, zero-cost, and monster-only behavior.
- Use the same result for UI display and all combat deductions.
- Preserve existing SP loadout prices for ordinary non-fixed skills.

---

### Task 1: Protect differentiated MP costs

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.test.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`

**Interfaces:**
- Consumes: `v2SkillMpCostValue(def: V2SkillDefinition): number`
- Produces: differentiated effective costs while preserving the existing public function signature

- [x] **Step 1: Write the failing tests**

Add literal expectations proving that default Tier 3 raw costs resolve independently:

```ts
expect(v2SkillMpCostValue(V2_SKILLS.v2c_guardian_bash)).toBe(62);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_swordmaster_cut)).toBe(76);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_skyascendant_fallingstar)).toBe(91);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_ruinblade_ruinsword)).toBe(126);
```

Change the berserker-line literal expectation to:

```ts
expect([
  "v2c_berserker_bloodslash",
  "v2c_warlord_bloodbath",
  "v2c_overlord_ruin",
  "v2c_hegemon_annihilation",
].map((skillId) => v2SkillMpCostValue(V2_SKILLS[skillId as V2SkillId])))
  .toEqual([64, 68, 80, 88]);
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts`

Expected: FAIL because the current formula returns 76 for all non-fixed default Tier 3 skills and the berserker skills remain fixed at 76.

- [x] **Step 3: Implement the minimal calculation change**

Add `MP_TIER_REFERENCE_COST = { 1: 30, 2: 28, 3: 50 }`, compute the existing rounded baseline, then return `Math.max(1, baseline + def.mpCost - MP_TIER_REFERENCE_COST[def.tier])`. Keep ordinary skills neutral in `spMpEfficiencyMultiplier`, where only explicit `fixedMpCost` exceptions affect SP efficiency. Remove only the four physical `fixedMpCost: 76` fields listed in the design.

```ts
const MP_TIER_REFERENCE_COST: Record<1 | 2 | 3, number> = {
  1: 30,
  2: 28,
  3: 50,
};

const baseline = Math.round(MP_REFERENCE_POOL * pct);
return Math.max(1, baseline + def.mpCost - MP_TIER_REFERENCE_COST[def.tier]);
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts`

Expected: PASS.

- [x] **Step 5: Run proportional verification**

Run: `npx tsc --noEmit`

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/battle/combatShared.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/data/v2/gridDungeonCombat.test.ts`

Expected: all commands PASS.

- [x] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-28-skill-mp-cost-differentiation-design.md docs/superpowers/plans/2026-08-28-skill-mp-cost-differentiation.md src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts
git commit -m "balance: differentiate active skill MP costs"
```
