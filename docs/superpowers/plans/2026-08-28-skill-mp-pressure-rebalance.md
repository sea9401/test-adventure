# Skill MP Pressure Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise active skill MP consumption relative to player MP pools, with stronger pressure for every mage-lineage job.

**Architecture:** Resolve each skill job's root combat lineage from `V2_JOB_CATALOG`, preserving the existing archetype baseline discounts. Apply a final 1.5 non-caster or 2.5 caster pressure multiplier after ordinary or fixed skill cost resolution, while keeping zero/monster literals and SP prices stable.

**Tech Stack:** TypeScript, Vitest

## Global Constraints

- Do not deploy.
- Mage descendants must be discovered from job prerequisites rather than a manual allowlist.
- UI display and combat deduction must continue sharing `v2SkillMpCostValue`.
- Ordinary SP loadout prices must not change.

---

### Task 1: Apply lineage-aware MP pressure

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`

**Interfaces:**
- Consumes: `V2_JOB_CATALOG`, `V2SkillDefinition`
- Produces: unchanged `v2SkillMpCostValue(def: V2SkillDefinition): number`

- [x] **Step 1: Write the failing behavior tests**

```ts
expect(v2SkillMpCostValue(V2_SKILLS.v2c_warrior_strike)).toBe(63);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_guardian_bash)).toBe(93);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_hegemon_annihilation)).toBe(132);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_mage_fireball)).toBe(225);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_shaman_hex)).toBe(263);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_ritualist_guardingarray)).toBe(210);
expect(v2SkillMpCostValue(V2_SKILLS.v2c_lawweaver_release)).toBe(500);
```

- [x] **Step 2: Verify RED**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts`

Expected: FAIL because current costs are 42/62/88/90/105/62/200 and manual lineage classification omits ritualist and lawweaver.

- [x] **Step 3: Implement lineage and pressure resolution**

```ts
type MpArchetype = "caster" | "martial" | "rogue" | "default";

const MP_ARCHETYPE_MULT: Record<MpArchetype, number> = {
  caster: 1.3,
  martial: 0.85,
  rogue: 0.7,
  default: 1,
};
const MP_PRESSURE_MULT: Record<MpArchetype, number> = {
  caster: 2.5,
  martial: 1.5,
  rogue: 1.5,
  default: 1.5,
};
```

Resolve ancestors through `unlock.prereqs` and `jobUnlocked`, then apply
`Math.round(baseCost * MP_PRESSURE_MULT[archetype])` after fixed or ordinary
base-cost selection. Apply the same pressure multiplier to the SP comparison
baseline so fixed-cost SP efficiency remains unchanged.

- [x] **Step 4: Verify GREEN and connected combat paths**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/gridDungeonCombat.test.ts src/adventure/battle/combatShared.test.ts src/adventure/battle/engine-pvp.test.ts`

Expected: PASS.

- [x] **Step 5: Run full verification**

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm test`

Expected: all commands exit 0.

- [x] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-28-skill-mp-pressure-rebalance-design.md docs/superpowers/plans/2026-08-28-skill-mp-pressure-rebalance.md src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2Skills.ts
git commit -m "balance: increase skill MP pressure"
```
