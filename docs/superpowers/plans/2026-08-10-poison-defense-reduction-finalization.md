# Poison And Defense Reduction Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the poison lineage into separately equippable virulence and corrosion passives, preserve existing corrosion owners' access to virulence, rebalance alternative defense-reduction lineages, and cap final percentage defense reduction at 60%.

**Architecture:** Keep corrosion and virulence as independent equipped-passive fields. Aggregate each field through the existing loadout derivation, apply virulence only to poison DoT creation, and combine all applicable percentage defense reductions immediately before defense is applied so the shared 60% cap is enforced once. Backfill existing owners with an idempotent SQL migration that appends only learned virulence skills and never equips them.

**Tech Stack:** TypeScript, Vitest, PostgreSQL JSONB migrations, existing V2 combat engines for PvE and PvP.

## Global Constraints

- Do not deploy to any environment.
- Preserve unrelated changes in the primary worktree.
- Percentage defense reductions stack multiplicatively before the final cap.
- Physical and magical percentage defense reduction each have an independent 60% final cap.
- Armor penetration, flat penetration, and defense-ignore damage are not included in the 60% cap.
- Poison corrosion applies only while the target is poisoned and contributes to the physical 60% cap.
- Virulence increases poison DoT damage but does not reduce defense.
- Existing corrosion owners receive the corresponding virulence skill as learned but not equipped.
- New players learn virulence and corrosion separately.
- Existing poison passive SP costs remain `4/4/4/6/11`; the four new virulence passives use `4/4/4/6`.
- No poison stacks are consumed and no new detonation active is added.

---

### Task 1: Add The Virulence Passive Chain

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Test: `src/adventure/data/v2/poisonPassiveSplit.test.ts`

**Interfaces:**
- Produces: `V2SkillPassive.poisonDamagePct?: number` and four new `V2SkillId` values.
- Produces: `aggregateEquippedPassives(ids).poisonDamagePct` as an additive percentage.
- Consumes: existing `V2_SKILLS`, `skillsForJob`, `spCostOf`, and passive aggregation.

- [ ] **Step 1: Write the failing catalog and aggregation tests**

Create table-driven assertions for these job mappings and values:

```ts
const VIRULENCE = [
  ["venomist", "v2c_venomist_virulence", 24.4, 4],
  ["venomancer", "v2c_venomancer_virulence2", 24.4, 4],
  ["venomlord", "v2c_venomlord_virulence3", 24.4, 4],
  ["plaguebringer", "v2c_plaguebringer_virulence4", 24.4, 6],
] as const;
```

Assert that each skill is passive, is the final job-learning option, has the literal poison damage and SP values above, and that all four plus `v2c_myriadvenom_body` aggregate to `122` poison damage percent. Assert that the five corrosion values are `6/7/9/12/14` and combine to `39.794895%`.

- [ ] **Step 2: Run the new test and verify RED**

Run: `npm test -- src/adventure/data/v2/poisonPassiveSplit.test.ts`

Expected: FAIL because the new skill IDs and `poisonDamagePct` do not exist.

- [ ] **Step 3: Implement the passive field and skill data**

Add `poisonDamagePct?: number` to the passive definition and aggregation result. Sum it additively while aggregating equipped passives. Add four passive skills named `맹독 I`, `맹독 II`, `맹독 III`, and `맹독 IV`, each with `poisonDamagePct: 24.4` and explicit SP costs `4/4/4/6`. Add the matching skill to the four poison jobs without removing their existing corrosion skill.

Change corrosion to `6/7/9/12/14`, use explicit SP costs `4/4/4/6/11`, and add `poisonDamagePct: 24.4` to `만독지배`. Keep its existing LUK, HP, evasion, and critical-damage effects.

- [ ] **Step 4: Run the new and neighboring catalog tests**

Run: `npm test -- src/adventure/data/v2/poisonPassiveSplit.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/v2JobTier34.test.ts src/adventure/data/v2/corrosionStacking.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the passive catalog unit**

```bash
git add src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/poisonPassiveSplit.test.ts
git commit -m "balance: split poison virulence and corrosion passives"
```

### Task 2: Apply Virulence To Poison Damage

**Files:**
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Test: `src/adventure/v2/combat/poisonDamageAmplification.test.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Produces: `PlayerCombat.poisonDamagePct?: number`.
- Consumes: `aggregateEquippedPassives(...).poisonDamagePct`.
- Behavior: poison DoT payloads are multiplied by `1 + poisonDamagePct / 100` in both PvE and PvP; non-poison DoTs are unchanged.

- [ ] **Step 1: Write failing derivation and combat tests**

Assert that a loadout containing all five virulence sources derives `poisonDamagePct: 122`. In real PvE and PvP engine paths, compare otherwise identical poison application at `0` and `100` poison damage percent and assert exactly double poison payload. Also assert bleed payload is unchanged.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/adventure/v2/combat/poisonDamageAmplification.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

Expected: FAIL because combat actors do not carry or apply `poisonDamagePct`.

- [ ] **Step 3: Implement derivation and shared behavior in both engines**

Thread the aggregated passive percentage into `PlayerCombat`. Replace corrosion-derived poison amplification with a helper whose multiplier is:

```ts
const mult = 1 + Math.max(0, player.poisonDamagePct ?? 0) / 100;
```

Apply it only to `dot.tag === "poison"` in PvE and PvP. Remove the obsolete `CORROSION_POISON_DAMAGE_SCALE` dependency and update passive descriptions so corrosion advertises defense reduction only and virulence advertises poison damage only.

- [ ] **Step 4: Run poison, derivation, and description tests**

Run: `npm test -- src/adventure/v2/combat/poisonDamageAmplification.test.ts src/adventure/v2/combat/corrosionSafety.test.ts src/adventure/v2/combat/engine.dotClock.test.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/data/v2/v2Skills.test.ts`

Expected: PASS after replacing obsolete corrosion-amplification expectations with virulence expectations.

- [ ] **Step 5: Commit poison damage separation**

```bash
git add src/adventure/v2/combat/engineState.ts src/lib/server/derivePlayerCombatV2.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/poisonDamageAmplification.test.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/v2/combat/corrosionSafety.test.ts src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2CombatConstants.ts
git commit -m "balance: separate poison damage from corrosion"
```

### Task 3: Rebalance Alternative Defense Reduction And Enforce The 60% Cap

**Files:**
- Modify: `src/adventure/data/v2/v2CombatConstants.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Test: `src/adventure/data/v2/defenseReductionOptions.test.ts`
- Test: `src/adventure/battle/engine.enchant.test.ts`
- Test: `src/adventure/battle/engine-pvp.test.ts`

**Interfaces:**
- Produces: `DEF_REDUCTION_PCT_CAP = 60` and `cappedDefReductionPct(...values): number`.
- Consumes: applicable active defense debuff, passive physical/magic reduction, and conditional corrosion values.

- [ ] **Step 1: Write failing value and cap tests**

Assert literal lineage values and hand-derived totals:

```ts
expect(swordValues).toEqual([9, 11, 13]);       // 29.5387%
expect(fistValues).toEqual([8, 10, 12]);        // 27.136%
expect(shadowValues).toEqual([8, 10, 12]);      // 27.136%
expect(archmageValues).toEqual([9, 11, 13]);    // 29.5387%
```

Add PvE and PvP assertions that 50% and 40% applicable reductions produce exactly the same defense-facing result as a single 60% reduction, while a single 50% reduction remains 50%. Assert physical and magical caps separately and assert flat/percentage armor penetration still applies before the capped reduction.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/adventure/data/v2/defenseReductionOptions.test.ts src/adventure/battle/engine.enchant.test.ts src/adventure/battle/engine-pvp.test.ts`

Expected: FAIL on old lineage values and uncapped combined reduction.

- [ ] **Step 3: Implement final values and cap**

Change the four chains to `9/11/13`, `8/10/12`, `8/10/12`, and `9/11/13`, preserving current SP costs. Add:

```ts
export const DEF_REDUCTION_PCT_CAP = 60;
export function cappedDefReductionPct(...values: number[]): number {
  return Math.min(DEF_REDUCTION_PCT_CAP, combineDefReductionPcts(...values));
}
```

In physical PvE and PvP defense calculation, combine the active percentage defense debuff, always-on physical reduction, and conditional corrosion through this helper, then apply the result once after penetration. In magical skill defense calculation, cap the applicable magic reduction through the same helper. Do not include penetration or defense-ignore damage in the helper inputs.

- [ ] **Step 4: Run PvE, PvP, and defense option tests**

Run: `npm test -- src/adventure/data/v2/defenseReductionOptions.test.ts src/adventure/data/v2/corrosionStacking.test.ts src/adventure/battle/engine.enchant.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/engine.pvpDamageMultiplier.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit defense rebalance and cap**

```bash
git add src/adventure/data/v2/v2CombatConstants.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/data/v2/defenseReductionOptions.test.ts src/adventure/battle/engine.enchant.test.ts src/adventure/battle/engine-pvp.test.ts
git commit -m "balance: cap and raise defense reduction options"
```

### Task 4: Backfill Virulence For Existing Corrosion Owners

**Files:**
- Create: `drizzle/0161_backfill_poison_virulence_skills.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `src/db/poisonVirulenceBackfillMigration.test.ts`

**Interfaces:**
- Consumes: `saves_kv` rows with `key = 'skills.v2'` and a JSONB `learned` array.
- Produces: corresponding learned virulence IDs appended in tier order without changing `equipped` or other save fields.

- [ ] **Step 1: Write the failing PostgreSQL migration test**

Seed rows covering: one corrosion skill, all four corrosion skills, a virulence skill already present, no corrosion, malformed `learned`, and unrelated save keys. Execute the new migration and assert these exact mappings:

```ts
const BACKFILL = {
  v2c_venomist_corrosion: "v2c_venomist_virulence",
  v2c_venomancer_corrosion3: "v2c_venomancer_virulence2",
  v2c_venomlord_sovereign: "v2c_venomlord_virulence3",
  v2c_plaguebringer_decay: "v2c_plaguebringer_virulence4",
} as const;
```

Assert that version and `updated_at` change only for rows receiving at least one skill, that `equipped` is byte-for-byte unchanged, and that a second migration execution makes no further changes.

- [ ] **Step 2: Run against an isolated PostgreSQL instance and verify RED**

Run: `POISON_VIRULENCE_MIGRATION_TEST_DATABASE_URL=<isolated-url> npm test -- src/db/poisonVirulenceBackfillMigration.test.ts`

Expected: FAIL because migration `0161_backfill_poison_virulence_skills.sql` does not exist.

- [ ] **Step 3: Implement the idempotent JSONB migration**

For each eligible `skills.v2` row, build an ordered JSONB array of missing mapped virulence IDs. Update only when that array is non-empty:

```sql
"value" = jsonb_set(
  "skills"."value",
  '{learned}',
  "skills"."value" -> 'learned' || "candidate"."missing",
  true
),
"version" = "skills"."version" + 1,
"updated_at" = now()
```

Do not alter `equipped`, presets, patterns, enhancements, or ordering of existing learned skills. Add journal entry index `161` tagged `0161_backfill_poison_virulence_skills`.

- [ ] **Step 4: Run the migration test twice through its idempotence assertion**

Run: `POISON_VIRULENCE_MIGRATION_TEST_DATABASE_URL=<isolated-url> npm test -- src/db/poisonVirulenceBackfillMigration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the compatibility migration**

```bash
git add drizzle/0161_backfill_poison_virulence_skills.sql drizzle/meta/_journal.json src/db/poisonVirulenceBackfillMigration.test.ts
git commit -m "feat: backfill virulence for corrosion owners"
```

### Task 5: Raise Existing Poison Stack Payoff Coefficients

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/v2/combat/poisonPayoff.test.ts`

**Interfaces:**
- Changes: `v2c_plaguebringer_outbreak` poison `perStackFlat` from `40` to `55`.
- Changes: `v2c_myriadvenom_mutation` poison `perStackFlat` from `48` to `65`.

- [ ] **Step 1: Write failing real-damage payoff assertions**

For each skill, use fixed LUK, defense, poison stacks, and deterministic randomness. Assert the effective incremental damage between zero poison stacks and one poison stack is `50` for `역병 창궐` and `62` for `만독개화`, after the existing job-active scaling. Also assert that their existing `8/12 SP` costs do not rise when the payoff coefficients increase.

- [ ] **Step 2: Run the payoff test and verify RED**

Run: `npm test -- src/adventure/v2/combat/poisonPayoff.test.ts`

Expected: FAIL with the current `40` and `48` increments.

- [ ] **Step 3: Change only the two stack payoff coefficients**

Set `perStackFlat: 55` on `v2c_plaguebringer_outbreak` and `perStackFlat: 65` on `v2c_myriadvenom_mutation`. Preserve the old `40/48` stack values only as their SP-assessment baselines so effective costs remain `8/12 SP` without bypassing the global rubric floor. Do not change stack application, DoT duration, proc chance, MP cost, or stack consumption.

- [ ] **Step 4: Run payoff and combat-neighbor tests**

Run: `npm test -- src/adventure/v2/combat/poisonPayoff.test.ts src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/v2/combat/multiHitLog.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the stack payoff adjustment**

```bash
git add src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/v2/combat/poisonPayoff.test.ts
git commit -m "balance: compensate poison stack payoff damage"
```

### Task 6: Final Verification And Documentation Alignment

**Files:**
- Modify: `docs/superpowers/specs/2026-08-09-poison-corrosion-rebalance-design.md`
- Modify: `docs/superpowers/specs/2026-08-09-cross-job-defense-reduction-options-design.md`

**Interfaces:**
- Produces: documentation matching the implemented `40%` poison target, separate virulence field, `27–30%` alternative lineages, and `60%` cap.

- [ ] **Step 1: Update superseded balance documentation**

Replace the old `22.66%`, corrosion-derived poison damage, low alternative lineage values, and no-cap statements. Record the exact passive mappings, values, SP costs, migration behavior, and cap scope implemented above.

- [ ] **Step 2: Run focused regression tests**

Run: `npm test -- src/adventure/data/v2/poisonPassiveSplit.test.ts src/adventure/data/v2/defenseReductionOptions.test.ts src/adventure/data/v2/corrosionStacking.test.ts src/adventure/v2/combat/poisonDamageAmplification.test.ts src/adventure/v2/combat/poisonPayoff.test.ts src/adventure/v2/combat/corrosionSafety.test.ts src/adventure/battle/engine.enchant.test.ts src/adventure/battle/engine-pvp.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

Expected: PASS.

- [ ] **Step 3: Run static and full-suite verification**

Run: `npx tsc --noEmit`

Expected: exit code `0`.

Run: `npm test`

Expected: all test files pass with zero failures.

- [ ] **Step 4: Review the final diff for scope and migrations**

Run: `git status --short && git diff --check HEAD~5 && git diff --stat HEAD~5`

Expected: only the files named in this plan are changed, no whitespace errors, and no deployment files or commands are present.

- [ ] **Step 5: Commit documentation alignment**

```bash
git add docs/superpowers/specs/2026-08-09-poison-corrosion-rebalance-design.md docs/superpowers/specs/2026-08-09-cross-job-defense-reduction-options-design.md docs/superpowers/plans/2026-08-10-poison-defense-reduction-finalization.md
git commit -m "docs: finalize poison defense reduction design"
```
