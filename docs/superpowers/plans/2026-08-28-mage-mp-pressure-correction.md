# Mage MP Pressure Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lower only mage-lineage final MP pressure from 2.5× to 1.25× while preserving the 1.5× non-caster pressure and automatic lineage discovery.

**Architecture:** Keep `v2SkillMpCostValue` and its job-ancestry resolver unchanged. Change the caster entry in `MP_PRESSURE_MULT`, update exact cost assertions first, and then update only combat assertions derived directly from the reduced cast cost.

**Tech Stack:** TypeScript, Vitest

## Global Constraints

- Do not deploy.
- Keep non-caster pressure at 1.5×.
- Keep zero-cost and monster-only literal MP costs unchanged.
- Keep ordinary SP loadout prices unchanged.
- Preserve unrelated working-tree changes.

---

### Task 1: Correct mage-lineage MP pressure

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`
- Modify: `src/adventure/v2/combat/signatureEffects.test.ts`
- Verify: `src/adventure/battle/combatShared.test.ts`
- Modify: `src/adventure/data/v2/gridDungeonCombat.test.ts`

**Interfaces:**
- Consumes: `MP_PRESSURE_MULT`, `v2SkillMpCostValue(def)`
- Produces: unchanged `v2SkillMpCostValue(def: V2SkillDefinition): number`

- [x] **Step 1: Change exact mage cost assertions to the approved values**

```ts
expect(v2SkillMpCostValue(V2_SKILLS.v2c_mage_fireball)).toBe(113);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_shaman_hex)).toBe(131);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_ritualist_guardingarray)).toBe(105);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_lawweaver_release)).toBe(250);
```

Keep the warrior expectations at 63, 93, and 132.

- [x] **Step 2: Run the cost test and verify RED**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts`

Expected: FAIL because the implementation still returns 225, 263, 210, and 500 for the mage samples.

- [x] **Step 3: Lower only the caster pressure multiplier**

```ts
const MP_PRESSURE_MULT: Record<MpArchetype, number> = {
  caster: 1.25,
  martial: 1.5,
  rogue: 1.5,
  default: 1.5,
};
```

- [x] **Step 4: Verify the cost test is GREEN**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts`

Expected: PASS with mage median 150 and the non-caster assertions unchanged.

- [x] **Step 5: Update direct combat refund expectations**

For `v2c_primordialmage_return`, the cost changes from 450 to 225. Starting at
1,000 MP, an 80 MP restore and a floored 15% refund of 33 produce 888 MP.

```ts
expect(result.playerMp).toBe(888);
expect(result.log.some((entry) => entry.text === "[마력 순환] 마나 33 환급")).toBe(true);
```

Use the equivalent `P1` expectation in the PvP test.

- [x] **Step 6: Verify connected combat behavior**

Run: `npm test -- src/adventure/battle/combatShared.test.ts src/adventure/data/v2/gridDungeonCombat.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/v2/combat/signatureEffects.test.ts`

Expected: PASS. Dynamic fireball tests continue using the shared cost function;
the boss party with DPS and a mage-lineage healer returns to a win because the
healer can cast more often. The single-DPS boss party remains a loss because its
non-caster 1.5× pressure is unchanged.

- [x] **Step 7: Run complete verification**

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npx vitest run --maxWorkers=4`

Expected: all commands exit 0 with no test failures.

- [x] **Step 8: Commit only the correction files**

```bash
git add docs/superpowers/plans/2026-08-28-mage-mp-pressure-correction.md src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/gridDungeonCombat.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/v2/combat/signatureEffects.test.ts
git commit -m "balance: reduce mage MP pressure"
```
