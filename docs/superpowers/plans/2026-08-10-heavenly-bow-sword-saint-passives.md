# Heavenly Bow and Sword Saint Passives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Heavenly Bow's unreachable SPD-overflow conversion with an always-active diminishing SPD conversion and replace Sword Saint's repeated stat passive with `일검필살`.

**Architecture:** Rename the speed passive field to match its whole-SPD meaning, calculate its attack bonus through one exported pure curve, and keep the derived combat object inert when the passive is absent. Add one aggregated single-hit physical skill damage field to `PlayerCombat`; `resolveV2SkillCast` classifies the resolved cast effects and multiplies only an eligible ordinary physical `damage` effect so PvE and PvP share the same rule.

**Tech Stack:** TypeScript, Vitest, V2 combat derivation and skill-cast engine.

## Global Constraints

- `성도 조준` uses `30 × SPD / (SPD + 500)` percent and remains SP 11.
- SPD 500 produces exactly +15% attack; SPD 1,024 is not an activation threshold.
- `일검필살` keeps ID `v2c_swordsaint_transcendence`, adds STR +24%, critical damage +35%, single-hit physical attack-skill damage +30%, and accuracy +15%.
- `일검필살` removes reflected-damage reduction, costs SP 11, and has no defensive effect.
- Ordinary attacks, multi-hit skills, magic, DoT, counter/reflect, healing-to-damage, HP-cost, execute, ambush, and stack-payoff damage are excluded.
- Do not add a job or weapon restriction, create a save migration, or deploy.

---

### Task 1: Whole-SPD diminishing attack conversion

**Files:**
- Modify: `src/lib/server/v2CombatCoefficients.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `scripts/sim-v2-career-loadout.ts`

**Interfaces:**
- Produces: `speedToAttackBonusPct(spd: number, maxPct: number): number`.
- Renames: `spdOverflowToAtkPct` to `spdToAtkMaxPct` and `passiveSpdOverflowToAtkPct` to `passiveSpdToAtkMaxPct`.
- Produces: `SPD_TO_ATK_HALF_SATURATION = 500`.

- [ ] **Step 1: Write failing curve and derive tests**

Replace the threshold test with hand-derived behavior checks. Assert `speedToAttackBonusPct(300, 30) = 11.25`, `speedToAttackBonusPct(1_024, 30) = 20.1574803149`, and `speedToAttackBonusPct(2_000, 30) = 24`. Derive otherwise identical players at SPD 500 with passive values 0 and 30, then assert the second attack is `Math.floor(base.atk * 1.15)`.

Update catalog tests to expect `spdToAtkMaxPct: 30`, no conversion on Marksman or either sword passive, aggregate bow value 30, and SP 11 on `성도 조준`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/lib/server/derivePlayerCombatV2.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts
```

Expected: FAIL because the curve and renamed passive fields do not exist and the derive path is inactive below SPD 1,024.

- [ ] **Step 3: Implement the curve and renamed data path**

Add to `v2CombatCoefficients.ts`:

```ts
export const SPD_TO_ATK_HALF_SATURATION = 500;

export function speedToAttackBonusPct(spd: number, maxPct: number): number {
  const safeSpd = Math.max(0, Number(spd) || 0);
  const safeMaxPct = Math.max(0, Number(maxPct) || 0);
  return safeMaxPct * (safeSpd / (safeSpd + SPD_TO_ATK_HALF_SATURATION));
}
```

Rename the fields throughout. Replace the excess-SPD block in `derivePlayerCombatV2Pure` with:

```ts
if (input.passiveSpdToAtkMaxPct) {
  const pct = speedToAttackBonusPct(specSpd, input.passiveSpdToAtkMaxPct);
  specAtk += Math.floor(specAtk * (pct / 100));
}
```

Set `성도 조준` to `spdToAtkMaxPct: 30`, keep explicit `spCost: 11`, and update its description, chip text, aggregation, SP scoring, and career-simulation scoring.

- [ ] **Step 4: Run the same tests and verify GREEN**

Expected: all targeted tests pass with SPD 500 at +15% and catalog aggregate 30.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/server/v2CombatCoefficients.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts scripts/sim-v2-career-loadout.ts
git commit -m "balance: make heavenly bow scale with total speed"
```

### Task 2: Sword Saint `일검필살`

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/data/v2/buildTags.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Test: `src/adventure/battle/combatShared.test.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`
- Modify: `scripts/sim-v2-career-loadout.ts`

**Interfaces:**
- Produces passive field: `singleHitPhysicalSkillDamagePct?: number`.
- Produces derive input: `passiveSingleHitPhysicalSkillDamagePct?: number`.
- Produces: `PlayerCombat.singleHitPhysicalSkillDamagePct?: number` and matching `V2SkillCastInput.attacker.singleHitPhysicalSkillDamagePct?: number`.

- [ ] **Step 1: Write failing passive-data and derive tests**

Assert that `v2c_swordsaint_transcendence` keeps its ID, is named `일검필살`, has `{ statPct: { str: 24 }, critDmgPct: 35, singleHitPhysicalSkillDamagePct: 30, accuracyPct: 15 }`, has no `reflectDamageTakenReductionPct`, and costs SP 11. Assert aggregation and derive expose the equipped effects.

- [ ] **Step 2: Write failing cast eligibility tests**

Cast real catalog skills with identical attacker input and compare plain with `singleHitPhysicalSkillDamagePct: 30`:

```ts
expect(boosted("v2c_swordsaint_flash").enemyDamage).toBe(
  Math.floor(plain("v2c_swordsaint_flash").enemyDamage * 1.3),
);
expect(boosted("v2c_warrior_flurry").enemyDamage).toBe(
  plain("v2c_warrior_flurry").enemyDamage,
);
expect(boosted("v2c_archmage_collapse").enemyDamage).toBe(
  plain("v2c_archmage_collapse").enemyDamage,
);
expect(boosted("v2c_hegemon_annihilation").enemyDamage).toBe(
  plain("v2c_hegemon_annihilation").enemyDamage,
);
```

Also assert that omission is inert and boosted `hitDamages` still sum to `enemyDamage`.

- [ ] **Step 3: Run tests and verify RED**

```bash
npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/battle/combatShared.test.ts
```

Expected: FAIL because the passive field, derived player field, and cast multiplier do not exist and the catalog still says `검성의 경지`.

- [ ] **Step 4: Implement passive aggregation and derivation**

Add `singleHitPhysicalSkillDamagePct` to passive types, aggregation, display chips, SP scoring (`pct / 10`), build tags, derive input/output, and career-simulation scoring. Set `spCost: 11` explicitly.

- [ ] **Step 5: Implement cast classification and multiplier**

After resolving `castEffects`, classify eligibility with:

```ts
const directEffects = castEffects.filter((effect) => directDamageKinds.has(effect.kind));
const singleDamage = directEffects.length === 1 ? directEffects[0] : undefined;
const singleHitPhysicalBonusActive =
  def.category === "attack" &&
  singleDamage?.kind === "damage" &&
  singleDamage.scaling !== "magic" &&
  singleDamage.scaling !== "spi";
```

For the eligible `damage` effect, multiply `base + pierceBonus` once with `Math.floor(amount * (1 + pct / 100))`. Pass the field from both PvE player-cast paths and the PvP player-cast path; do not pass it for monsters.

- [ ] **Step 6: Run the same tests and verify GREEN**

Expected: all targeted tests pass, including every exclusion case.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/buildTags.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/combatShared.ts src/adventure/battle/combatShared.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts scripts/sim-v2-career-loadout.ts
git commit -m "balance: give sword saint a single-strike passive"
```

### Task 3: Patch notes, simulation, and verification

**Files:**
- Modify: `docs/patch-notes/2026-08-09-combat-balance-follow-up-draft.md`

**Interfaces:**
- Consumes: final passive behavior from Tasks 1 and 2.
- Produces: player-facing notes and verification evidence.

- [ ] **Step 1: Update patch notes**

Replace SPD-overflow wording with total-SPD diminishing conversion and the SPD 500 to +15% reference. State that `검성의 경지` becomes `일검필살`, retains its offensive stat bonuses, grants +30% to eligible single-hit physical attack skills, removes reflected-damage protection, and costs SP 11.

- [ ] **Step 2: Run targeted simulation**

```bash
npx tsx scripts/sim-v2-progression.ts --depths=73,75,78 --tier6-counts=1 --skills
```

Record Heavenly Bow and Sword Saint derived stats and win rates without changing simulation rules.

- [ ] **Step 3: Run full verification**

Run `npm test`, `npx tsc --noEmit`, and `git diff --check`. Expected: all tests and type checking pass with no whitespace errors.

- [ ] **Step 4: Commit Task 3**

```bash
git add docs/patch-notes/2026-08-09-combat-balance-follow-up-draft.md
git commit -m "docs: explain tier-six damage passive changes"
```

- [ ] **Step 5: Confirm and report**

Run `git status --short` and `git log -4 --oneline`. Report final coefficients, simulation results, verification counts, commit hashes, and explicitly state that no deployment occurred.
