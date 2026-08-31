# Cross-Job Defense Reduction Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expensive, freely equippable physical- and magic-defense reduction passive chains to four offensive job lineages with multiplicative stacking in PvE and PvP.

**Architecture:** Extend the existing passive-skill aggregation and server-derived `PlayerCombat` pipeline with separate physical and magic reduction fields. Apply physical reduction once in the physical defense-facing helpers and magic reduction to the explicit magic-defense target passed into the shared skill resolver, while leaving pierce and vulnerability mechanics independent.

**Tech Stack:** TypeScript, Vitest, existing v2 skill catalog, server combat derivation, PvE/PvP combat engines

## Global Constraints

- Physical and magic defense reduction are separate effects.
- New passives are independently equippable and have no current-job or lineage equip restriction.
- Do not add a gameplay cap; retain numeric `0..100%` safety clamping.
- Same-type reductions and conditional corrosion combine multiplicatively.
- Passive power valuation uses `pct / 3` for both new fields.
- Explicit SP costs are exactly `5/7/9`, `3/5/7`, `3/5/7`, and `5/7/9` in lineage order.
- Existing pierce, vulnerability, magic vulnerability, corrosion values, and corrosion poison amplification remain unchanged.
- Do not wire these passives into simplified combat simulators that do not currently consume equipped passives.
- Do not deploy.

---

### Task 1: Add the 12 passive skills and lock their catalog contract

**Files:**
- Create: `src/adventure/data/v2/defenseReductionOptions.test.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/buildTags.ts`

**Interfaces:**
- Consumes: `V2CommonSkillId`, `V2_COMMON_SKILLS`, `V2_SKILLS_BY_JOB`, `V2PassiveSkillEffect`, `combineDefReductionPcts`
- Produces: `enemyPhysicalDefReductionPct`, `enemyMagicDefReductionPct`, 12 catalog IDs, multiplicative aggregate values, SP costs, display chips, and vulnerability build tags

- [ ] **Step 1: Write the failing catalog, mapping, stacking, SP, display, and tag tests**

Create constants for the approved chains and assert their literal contract.

```ts
const PHYSICAL_CHAINS = [
  ["v2c_veteran_armorinsight", "v2c_swordmaster_armorinsight2", "v2c_swordsaint_armorinsight3"],
  ["v2c_sensei_formationbreak", "v2c_dragonfist_formationbreak2", "v2c_celestialdragon_formationbreak3"],
  ["v2c_phantom_weakpoint", "v2c_nightshade_weakpoint2", "v2c_blackmoon_weakpoint3"],
] as const satisfies readonly (readonly V2SkillId[])[];

const MAGIC_CHAIN = [
  "v2c_sage_magicdismantle",
  "v2c_arcanist_magicdismantle2",
  "v2c_archmage_magicdismantle3",
] as const satisfies readonly V2SkillId[];

expect(PHYSICAL_CHAINS.map((ids) =>
  ids.map((id) => V2_SKILLS[id].passive?.enemyPhysicalDefReductionPct),
)).toEqual([[3, 4, 5], [2, 3, 4], [2, 3, 4]]);
expect(MAGIC_CHAIN.map((id) =>
  V2_SKILLS[id].passive?.enemyMagicDefReductionPct,
)).toEqual([3, 4, 5]);
expect(PHYSICAL_CHAINS.map((ids) => ids.map((id) => spCostOf(V2_SKILLS[id]))))
  .toEqual([[5, 7, 9], [3, 5, 7], [3, 5, 7]]);
expect(MAGIC_CHAIN.map((id) => spCostOf(V2_SKILLS[id]))).toEqual([5, 7, 9]);
```

Assert aggregates `11.536`, `8.7424`, `8.7424`, `26.3276270322`, and `11.536`, plus descriptions `적 물리 방어 -3%` / `적 마법 방어 -3%` and the `vulnerability` build tag.

- [ ] **Step 2: Update the selected job-kit expectations to include a third passive**

Change only the twelve approved jobs from two-skill tuples to these exact arrays:

```ts
veteran: ["v2c_veteran_cleave", "v2c_veteran_lethal", "v2c_veteran_armorinsight"],
sensei: ["v2c_sensei_combo", "v2c_sensei_ironbody", "v2c_sensei_formationbreak"],
sage: ["v2c_sage_bolt", "v2c_sage_insight", "v2c_sage_magicdismantle"],
phantom: ["v2c_phantom_ambush", "v2c_phantom_stealth", "v2c_phantom_weakpoint"],
swordmaster: ["v2c_swordmaster_cut", "v2c_swordmaster_focus", "v2c_swordmaster_armorinsight2"],
dragonfist: ["v2c_dragonfist_rupture", "v2c_dragonfist_footwork", "v2c_dragonfist_formationbreak2"],
nightshade: ["v2c_nightshade_eclipse", "v2c_nightshade_cloak", "v2c_nightshade_weakpoint2"],
arcanist: ["v2c_arcanist_burst", "v2c_arcanist_theory", "v2c_arcanist_magicdismantle2"],
swordsaint: ["v2c_swordsaint_flash", "v2c_swordsaint_transcendence", "v2c_swordsaint_armorinsight3"],
celestialdragon: ["v2c_celestialdragon_combo", "v2c_celestialdragon_breath", "v2c_celestialdragon_formationbreak3"],
blackmoon: ["v2c_blackmoon_flurry", "v2c_blackmoon_dominion", "v2c_blackmoon_weakpoint3"],
archmage: ["v2c_archmage_collapse", "v2c_archmage_theory", "v2c_archmage_magicdismantle3"],
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm test -- --run src/adventure/data/v2/defenseReductionOptions.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts`

Expected: FAIL because the IDs, passive fields, catalog definitions, mappings, aggregation, descriptions, and tags do not exist.

- [ ] **Step 4: Add the passive fields and multiplicative aggregation**

Extend `V2PassiveSkillEffect`, `skillPowerScore`, `aggregateEquippedPassives`, and `describeV2Skill` with the exact fields and labels.

```ts
enemyPhysicalDefReductionPct?: number;
enemyMagicDefReductionPct?: number;

mag += (p.enemyPhysicalDefReductionPct ?? 0) / 3;
mag += (p.enemyMagicDefReductionPct ?? 0) / 3;

enemyPhysicalDefReductionPct = combineDefReductionPcts(
  enemyPhysicalDefReductionPct,
  p.enemyPhysicalDefReductionPct ?? 0,
);
enemyMagicDefReductionPct = combineDefReductionPcts(
  enemyMagicDefReductionPct,
  p.enemyMagicDefReductionPct ?? 0,
);

if (p.enemyPhysicalDefReductionPct)
  chips.push(`적 물리 방어 -${p.enemyPhysicalDefReductionPct}%`);
if (p.enemyMagicDefReductionPct)
  chips.push(`적 마법 방어 -${p.enemyMagicDefReductionPct}%`);
```

In `addPassiveTags`, add `vulnerability` for either field and additionally add `magic` for `enemyMagicDefReductionPct`.

- [ ] **Step 5: Add the 12 skill definitions and job mappings**

Add the IDs to `V2CommonSkillId`. Define all as `category: "passive"`, `tier: 3`, `mpCost: 0`, `cooldown: 0`, and `effects: []`. Use the approved names and literal effects/costs:

```ts
passive: { enemyPhysicalDefReductionPct: 3 }, spCost: 5 // 갑주 간파 I
passive: { enemyPhysicalDefReductionPct: 4 }, spCost: 7 // 갑주 간파 II, learnCost 8000
passive: { enemyPhysicalDefReductionPct: 5 }, spCost: 9 // 갑주 간파 III, learnCost 12000
passive: { enemyPhysicalDefReductionPct: 2 }, spCost: 3 // 파진경 I / 급소 노출 I
passive: { enemyPhysicalDefReductionPct: 3 }, spCost: 5 // 파진경 II / 급소 노출 II, learnCost 8000
passive: { enemyPhysicalDefReductionPct: 4 }, spCost: 7 // 파진경 III / 급소 노출 III, learnCost 12000
passive: { enemyMagicDefReductionPct: 3 }, spCost: 5 // 마력 해체 I
passive: { enemyMagicDefReductionPct: 4 }, spCost: 7 // 마력 해체 II, learnCost 8000
passive: { enemyMagicDefReductionPct: 5 }, spCost: 9 // 마력 해체 III, learnCost 12000
```

Append each new ID to its approved job in `V2_SKILLS_BY_JOB` without changing the order of the existing active and passive.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run: `npm test -- --run src/adventure/data/v2/defenseReductionOptions.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.test.ts`

Expected: all focused catalog tests pass.

- [ ] **Step 7: Commit the catalog contract**

Stage only the six Task 1 files and commit with: `feat: add defense reduction passive chains`

### Task 2: Carry both reductions through server combat derivation

**Files:**
- Create: `src/lib/server/derivePlayerCombatV2.defenseReduction.test.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`

**Interfaces:**
- Consumes: `aggregateEquippedPassives().enemyPhysicalDefReductionPct`, `aggregateEquippedPassives().enemyMagicDefReductionPct`
- Produces: `PlayerCombat.enemyPhysicalDefReductionPct`, `PlayerCombat.enemyMagicDefReductionPct`

- [ ] **Step 1: Write the failing pure-derive tests**

```ts
const player = derivePlayerCombatV2Pure({
  level: 50,
  v2Equipped: {},
  passiveEnemyPhysicalDefReductionPct: 12,
  passiveEnemyMagicDefReductionPct: 9,
}).player;

expect(player.enemyPhysicalDefReductionPct).toBe(12);
expect(player.enemyMagicDefReductionPct).toBe(9);
```

Also derive with both inputs omitted and assert both output properties are `undefined` so zero-value builds remain byte-compatible.

- [ ] **Step 2: Run the derive test and verify RED**

Run: `npm test -- --run src/lib/server/derivePlayerCombatV2.defenseReduction.test.ts`

Expected: FAIL because the pure input and `PlayerCombat` fields are missing.

- [ ] **Step 3: Add the pure input, output, and save-derived wiring**

Add these optional fields to the pure input and `PlayerCombat` types:

```ts
passiveEnemyPhysicalDefReductionPct?: number;
passiveEnemyMagicDefReductionPct?: number;

enemyPhysicalDefReductionPct?: number;
enemyMagicDefReductionPct?: number;
```

Return nonzero values from `derivePlayerCombatV2Pure`, and pass both aggregate values from `derivePlayerCombatV2FromSaves`:

```ts
...(input.passiveEnemyPhysicalDefReductionPct
  ? { enemyPhysicalDefReductionPct: input.passiveEnemyPhysicalDefReductionPct }
  : {}),
...(input.passiveEnemyMagicDefReductionPct
  ? { enemyMagicDefReductionPct: input.passiveEnemyMagicDefReductionPct }
  : {}),

passiveEnemyPhysicalDefReductionPct: passiveAgg.enemyPhysicalDefReductionPct,
passiveEnemyMagicDefReductionPct: passiveAgg.enemyMagicDefReductionPct,
```

- [ ] **Step 4: Run derive and catalog tests and verify GREEN**

Run: `npm test -- --run src/lib/server/derivePlayerCombatV2.defenseReduction.test.ts src/lib/server/derivePlayerCombatV2.corrosion.test.ts src/adventure/data/v2/defenseReductionOptions.test.ts`

Expected: all tests pass and the existing corrosion derive remains unchanged.

- [ ] **Step 5: Commit the derive pipeline**

Stage only the three Task 2 files and commit with: `feat: derive defense reduction combat stats`

### Task 3: Apply separate physical and magic reductions in PvE

**Files:**
- Modify: `src/adventure/battle/engine.enchant.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`

**Interfaces:**
- Consumes: `PlayerCombat.enemyPhysicalDefReductionPct`, `PlayerCombat.enemyMagicDefReductionPct`, `combineDefReductionPcts`, existing poison-state detection
- Produces: always-on physical reduction for PvE physical attacks and physical skills, magic-only reduction for PvE magic skills

- [ ] **Step 1: Write failing PvE damage-isolation tests**

Add deterministic tests with crit/evasion RNG disabled:

```ts
expect(measureBasic({ enemyPhysicalDefReductionPct: 50 })).toBeGreaterThan(
  measureBasic({}),
);
expect(measureBasic({ enemyMagicDefReductionPct: 50 })).toBe(
  measureBasic({}),
);
expect(measureSkill("v2_skill_strike", { enemyPhysicalDefReductionPct: 50 }))
  .toBeGreaterThan(measureSkill("v2_skill_strike", {}));
expect(measureSkill("v2c_mage_fireball", { enemyMagicDefReductionPct: 50 }))
  .toBeGreaterThan(measureSkill("v2c_mage_fireball", {}));
expect(measureSkill("v2c_mage_fireball", { enemyPhysicalDefReductionPct: 50 }))
  .toBe(measureSkill("v2c_mage_fireball", {}));
```

Use an enemy with both `def: 80` and `magicDef: 80`. Add a monster without explicit `magicDef` and assert magic reduction applies to the physical-defense fallback while physical reduction does not.

- [ ] **Step 2: Run the PvE test and verify RED**

Run: `npm test -- --run src/adventure/battle/engine.enchant.test.ts`

Expected: FAIL because neither new `PlayerCombat` field is consumed.

- [ ] **Step 3: Implement physical reduction exactly once**

In `playerFacingEnemyDef`, apply the generic reduction after existing pierce/debuff processing and before conditional corrosion:

```ts
const physicalReductionPct = combineDefReductionPcts(
  player.enemyPhysicalDefReductionPct ?? 0,
);
const afterPhysicalReduction = Math.round(
  afterDebuff * (1 - physicalReductionPct / 100),
);
```

In `playerSkillTargetDef`, combine the generic reduction and active corrosion multiplicatively and apply once to `state.enemy.def`.

- [ ] **Step 4: Implement a separate magic-defense target**

Add a helper that starts from `state.enemy.magicDef ?? state.enemy.def`, applies only `enemyMagicDefReductionPct`, clamps at zero, and pass it as the resolver target:

```ts
function playerSkillTargetMagicDef(state: BattleState, player: PlayerCombat): number {
  const base = state.enemy.magicDef ?? state.enemy.def;
  const pct = combineDefReductionPcts(player.enemyMagicDefReductionPct ?? 0);
  return Math.max(0, Math.round(base * (1 - pct / 100)));
}

target: {
  def: playerSkillTargetDef(state, player),
  magicDef: playerSkillTargetMagicDef(state, player),
}
```

- [ ] **Step 5: Run PvE and corrosion tests and verify GREEN**

Run: `npm test -- --run src/adventure/battle/engine.enchant.test.ts src/adventure/v2/combat/corrosionSafety.test.ts src/adventure/data/v2/corrosionStacking.test.ts`

Expected: all tests pass; poison amplification and corrosion conditions remain unchanged.

- [ ] **Step 6: Commit the PvE engine change**

Stage only the two Task 3 files and commit with: `feat: apply defense reduction in pve combat`

### Task 4: Mirror the rules in PvP and remove duplicate skill corrosion

**Files:**
- Modify: `src/adventure/battle/engine-pvp.test.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`

**Interfaces:**
- Consumes: the same `PlayerCombat` fields and stacking helper as PvE
- Produces: PvP physical/magic separation and single application of corrosion to physical skills

- [ ] **Step 1: Write failing PvP parity and corrosion-once tests**

Build deterministic one-cast comparisons for physical and magic skills with defender `def: 80` and `magicDef: 80`. Assert physical reduction increases only physical skill damage and magic reduction increases only magic skill damage.

For corrosion, create a poisoned defender and `poisonedEnemyDefReductionPct: 50`; assert the physical target defense used by a skill is `40`, not `20`. Verify the resulting skill damage equals a control cast against a defender whose raw `def` is `40` with no corrosion.

- [ ] **Step 2: Run the PvP test and verify RED**

Run: `npm test -- --run src/adventure/battle/engine-pvp.test.ts`

Expected: FAIL because new reductions are absent and `skillTargetDef` reapplies corrosion after `attackerFacingDef`.

- [ ] **Step 3: Apply generic physical reduction in `attackerFacingDef`**

Apply `enemyPhysicalDefReductionPct` after the existing timed defense debuffs and before conditional corrosion. Keep zero clamping and multiplicative application identical to PvE.

- [ ] **Step 4: Make physical skills reuse the already-reduced facing defense**

Replace the second corrosion calculation in `skillTargetDef` with:

```ts
function skillTargetDef(attacker: PvPSide, defender: PvPSide): number {
  return attackerFacingDef(attacker, defender);
}
```

- [ ] **Step 5: Pass a separately reduced PvP magic defense**

```ts
function skillTargetMagicDef(attacker: PvPSide, defender: PvPSide): number {
  const base = defender.player.magicDef ?? defender.player.def;
  const pct = combineDefReductionPcts(
    attacker.player.enemyMagicDefReductionPct ?? 0,
  );
  return Math.max(0, Math.round(base * (1 - pct / 100)));
}
```

Use `skillTargetMagicDef(side, opp)` for `target.magicDef` in the shared resolver input.

- [ ] **Step 6: Run PvP, PvE, and derive tests and verify GREEN**

Run: `npm test -- --run src/adventure/battle/engine-pvp.test.ts src/adventure/battle/engine.enchant.test.ts src/lib/server/derivePlayerCombatV2.defenseReduction.test.ts`

Expected: all tests pass with PvE/PvP parity.

- [ ] **Step 7: Commit the PvP engine change**

Stage only the two Task 4 files and commit with: `feat: apply defense reduction in pvp combat`

### Task 5: Verify the complete feature without deployment

**Files:**
- Verify all files created or modified in Tasks 1–4
- Modify if required by formatting only: the same files from Tasks 1–4

**Interfaces:**
- Consumes: complete catalog, derive, PvE, and PvP implementation
- Produces: verified local commits with unrelated worktree changes preserved

- [ ] **Step 1: Run focused feature verification**

Run: `npm test -- --run src/adventure/data/v2/defenseReductionOptions.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/lib/server/derivePlayerCombatV2.defenseReduction.test.ts src/adventure/battle/engine.enchant.test.ts src/adventure/battle/engine-pvp.test.ts`

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/data/v2/defenseReductionOptions.test.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/buildTags.ts src/lib/server/derivePlayerCombatV2.defenseReduction.test.ts src/lib/server/derivePlayerCombatV2.ts src/adventure/v2/combat/engineState.ts src/adventure/battle/engine.enchant.test.ts src/adventure/v2/combat/engine.ts src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/engine-pvp.ts`

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: zero failed test files.

- [ ] **Step 4: Inspect the final diff and commit plan documentation**

Run: `git diff --check`

Run: `git status --short`

Confirm the unrelated pre-existing changes remain unstaged. Stage only `docs/superpowers/plans/2026-08-09-cross-job-defense-reduction-options.md` and commit with: `docs: plan cross-job defense reduction options`
