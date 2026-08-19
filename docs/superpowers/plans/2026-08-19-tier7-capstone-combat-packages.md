# Tier 7 Capstone Combat Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved 46-SP combat packages for 무영검신, 멸검제, 비천무신, and 태초현자, and enforce the same 16–18 point / 0.35–0.40 point-per-SP standard for every future tier-7 package.

**Architecture:** Add a typed tier-7 mechanic descriptor to skill definitions and keep its scoring in a pure data module so pricing and runtime behavior read the same numbers. Implement each capstone mechanic as a small pure combat module, then wire it into the existing PvE and PvP phases at explicit action boundaries. Keep these four job IDs internal and non-selectable in this plan: catalog exposure, job bonuses, origin-fragment spending, and release activation require a separate approved economy/job-stat specification.

**Tech Stack:** TypeScript, Vitest, existing V2 skill catalog, passive aggregation, ATB PvE/PvP engines, deterministic combat snapshots.

## Global Constraints

- Each package costs exactly 46 SP and scores from 16 through 18 inclusive; efficiency must remain from 0.35 through 0.40 points per SP inclusive.
- Score only the incremental value supplied by tier 7. Never count the referenced tier-6 skill's existing direct damage twice.
- Runtime mechanic fields are the source of truth for `skillPowerScore`; do not add a manual score override or a job-name exception.
- Apply the approved PvP caps separately from the PvE score. PvP caps must not lower the catalog price.
- A core mechanic must be observable within the first two or three player actions in deterministic tests.
- Every active must remain useful without the other two package skills; cover the approved “at least 70% standalone value” rule with isolated-loadout tests.
- Add internal job IDs and skill mappings, but do **not** add the four jobs to `V2_JOB_CATALOG` or `V2_JOB_LIST` in this plan. Therefore the jobs cannot be selected, changed into, or shown in the roadmap.
- Do **not** choose tier-7 job bonuses, cultivation profiles, origin-fragment costs, or unlock API behavior in this plan. Those values were not approved.
- Do not enable a release flag, migrate player data, deploy, or change maintenance mode.
- Preserve unrelated worktree changes and stage only the task being committed.

---

## File and Responsibility Map

- Create `src/adventure/data/v2/tier7SkillMechanics.ts`: internal tier-7 job/skill IDs, discriminated mechanic descriptors, PvE/PvP constants, and pure mechanic-score formulas.
- Create `src/adventure/data/v2/tier7SkillMechanics.test.ts`: formula, package-budget, and future-package validator regressions.
- Modify `src/adventure/data/v2/v2Skills.ts`: attach the typed descriptor to `V2SkillDefinition`, add combat tier 7 normalization, and include mechanic score in `skillPowerScore`.
- Modify `src/adventure/data/v2/v2SkillsCommonCatalog.ts`: define the twelve approved skills and their ordinary effects.
- Modify `src/adventure/data/v2/v2SkillsByJob.ts`: map the twelve skills to the four internal job IDs.
- Modify `src/adventure/data/v2/v2SkillsByJob.test.ts`: assert exact names, prerequisites, SP totals, normalized damage ratios, and internal mappings.
- Create `src/adventure/v2/combat/shadowBladeCombat.ts`: 검영 record/refine/release/follow-up rules.
- Create `src/adventure/v2/combat/ruinBladeCombat.ts`: 검의·멸검 charge and release rules.
- Create `src/adventure/v2/combat/skyAscendantCombat.ts`: 원거리/체술 교차 state and capture/pursuit modifiers.
- Create `src/adventure/v2/combat/primordialSageCombat.ts`: formula stage, completion preview, mana exception, and completion modifiers.
- Create one focused `*.test.ts` beside each combat module.
- Modify `src/adventure/v2/combat/engineState.ts`: serializable tier-7 battle resources.
- Modify `src/adventure/v2/combat/engine.playerPhase.ts` and `engine.pvpPhase.ts`: cast-time and hit-result integration.
- Modify `src/adventure/v2/combat/engine.atb.ts` and `engine.pvp-atb.ts`: enemy-action and next-player-opportunity hooks.
- Modify `src/adventure/v2/combat/combatShared.ts`: damage-only final multiplier/pierce helpers shared by PvE and PvP.
- Modify `src/adventure/data/v2/v2Skills.ts`: extend the existing `describeV2Skill` output for all typed mechanic fields.
- Modify `src/adventure/data/v2/replayPayload.test.ts`: prove tier-7 combat log entries and primitive resource chips survive replay conversion and PvP side swapping.

### Task 1: Establish the typed tier-7 contract and pricing guard

**Files:**
- Create: `src/adventure/data/v2/tier7SkillMechanics.ts`
- Create: `src/adventure/data/v2/tier7SkillMechanics.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**

```ts
export const TIER7_COMBAT_JOB_IDS = [
  "shadowblade",
  "ruinblade",
  "skyascendant",
  "primordialsage",
] as const;
export type Tier7CombatJobId = (typeof TIER7_COMBAT_JOB_IDS)[number];
export const TIER7_COMBAT_JOB_PREREQS: Record<Tier7CombatJobId, readonly [string, string]> = {
  shadowblade: ["swordsaint", "blackmoon"],
  ruinblade: ["swordsaint", "hegemon"],
  skyascendant: ["heavenlybow", "celestialdragon"],
  primordialsage: ["archmage", "primordialmage"],
};

export type Tier7Mechanic =
  | { kind: "shadowStrike"; recordPct: number; refinedRecordPct: number }
  | { kind: "shadowRefine"; refinePctPoints: number; hastePct: number }
  | { kind: "shadowCore"; recordPct: number; refinedRecordPct: number; nextSingleDamagePct: number; pvpScalePct: number }
  | { kind: "intentStrike"; missingHpBonusCapPct: number; lowHpThresholdPct: number }
  | { kind: "intentCore"; maxStacks: number; damagePctPerStack: number; finisherPctPerStack: number }
  | { kind: "chargedFinisher"; currentMissingHpCapPct: number; chargeLostHpCapPct: number; pvpCapPct: number; pvpPenetrationPct: number }
  | { kind: "crossStrike"; family: "ranged" | "martial" }
  | {
      kind: "crossCore";
      captureDamagePct: number;
      captureAccuracyPct: number;
      capturePenetrationPct: number;
      pursuitDamagePct: number;
      pursuitEnemyDelayPct: number;
      hastePct: number;
      pvpCaptureDamagePct: number;
      pvpCapturePenetrationPct: number;
      pvpPursuitDamagePct: number;
      pvpPursuitEnemyDelayPct: number;
      pvpHastePct: number;
    }
  | { kind: "formulaStrike"; stages: 1; completionHastePct: number }
  | { kind: "manaOptimization"; restoreMaxMpPct: number; allowCompletionOverdraft: true }
  | { kind: "completeFormula"; directDamagePct: number; penetrationPct: number; hastePct: number; pvpDamagePct: number; pvpPenetrationPct: number; pvpHastePct: number };

export function tier7MechanicPower(mechanic: Tier7Mechanic): number;
export function validateTier7Package(defs: readonly V2SkillDefinition[]): {
  sp: number;
  score: number;
  efficiency: number;
};
```

- [ ] **Step 1: Add failing contract and validator tests**

Test all eleven union branches and assert that validation rejects a package unless `sp === 46`, `16 <= score <= 18`, and `0.35 <= score / sp <= 0.40`. Also assert that `TIER7_COMBAT_JOB_IDS` and `TIER7_COMBAT_JOB_PREREQS` contain exactly the four IDs and prerequisite pairs above.

```ts
expect(() => validateTier7Package(packageDefs)).not.toThrow();
expect(validateTier7Package(packageDefs)).toMatchObject({ sp: 46 });
expect(result.score).toBeGreaterThanOrEqual(16);
expect(result.score).toBeLessThanOrEqual(18);
expect(result.efficiency).toBeGreaterThanOrEqual(0.35);
expect(result.efficiency).toBeLessThanOrEqual(0.4);
```

- [ ] **Step 2: Confirm RED**

Run:

```bash
npm test -- src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/data/v2/v2Skills.test.ts
```

Expected: imports and the `tier7Mechanic` field fail because the new contract does not exist.

- [ ] **Step 3: Implement the contract and score formulas**

Add `tier7Mechanic?: Tier7Mechanic` to `V2SkillDefinition`. Extend `CombatJobTier`, proc floors, damage normalization, and the uncompressed high-tier branch of `rubricSpCost` to tier 7; use a 40% proc floor and `1.0` direct-damage scale so explicitly approved ratios remain unchanged.

Implement `tier7MechanicPower` from mechanic values using these fixed expectation assumptions:

```ts
const SCORE = {
  finalDamagePer10Pct: 1,
  penetrationPer20Pct: 1,
  hastePer20Pct: 1,
  maxMpPer20Pct: 1,
  mpReductionPer20Pct: 1,
  delayedRealization: 0.8,
  alternatingFamilyUptime: 0.75,
  chargedOncePerBattle: 0.65,
  formulaCompletionUptime: 0.375,
} as const;
```

Each branch must derive its contribution from the runtime percentages in the descriptor. Round only the public result with `Math.round(value * 100) / 100`. For charged finishers, apply `chargedOncePerBattle`; for shadow damage apply `delayedRealization`; for crossover bonuses apply `alternatingFamilyUptime`; for complete-formula effects apply `formulaCompletionUptime`. Add the mechanic result to the existing ordinary `skillPowerScore` result.

- [ ] **Step 4: Run focused GREEN and static checks**

```bash
npm test -- src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/data/v2/v2Skills.test.ts
npx tsc --noEmit
npx eslint src/adventure/data/v2/tier7SkillMechanics.ts src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/data/v2/v2Skills.ts
git diff --check
```

- [ ] **Step 5: Commit the shared contract**

```bash
git add src/adventure/data/v2/tier7SkillMechanics.ts src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts
git diff --cached --check
git commit -m "feat: add tier 7 skill power contract"
```

### Task 2: Add the twelve internal skill definitions

**Files:**
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Modify: `src/adventure/data/v2/tier7SkillMechanics.test.ts`

**Exact package data:**

| Internal job | Skill ID | Name | SP | Ordinary definition | Tier-7 descriptor |
|---|---|---:|---:|---|---|
| `shadowblade` | `v2c_shadowblade_afterimage` | 잔영 | 14 | LUK single physical; 90% of normalized 무심검; proc 45; MP 65; skill crit +25%p; penetration 20 | shadow strike record 70, refined 85 |
| `shadowblade` | `v2c_shadowblade_traceless` | 무흔 | 12 | LUK five-hit physical; total 100% of normalized 암월난무; proc 50; MP 65 | refine +15%p; realized refined shadow gives haste 20 |
| `shadowblade` | `v2c_shadowblade_swordshadow` | 검영 | 20 | passive | base record 50, refined 65, next single physical final +15, PvP scale 80 |
| `ruinblade` | `v2c_ruinblade_limitstrike` | 극한일격 | 10 | STR single physical; 85% of normalized 무심검; proc 45; MP 65; penetration 20; missing-HP cap 60 | intent strike; HP 40% threshold doubles gain |
| `ruinblade` | `v2c_ruinblade_oneintent` | 일념 | 12 | passive STR +18%, accuracy +15 | max 3; single physical final +8 per stack; finisher +15 per stack |
| `ruinblade` | `v2c_ruinblade_ruinsword` | 멸검 | 24 | STR single physical; 180% of normalized 무심검; once per battle; proc 100; MP 100; PvE penetration 45 | current missing cap 75, charge loss cap 75; PvP each cap 40 and penetration 30 |
| `skyascendant` | `v2c_skyascendant_fallingstar` | 낙성 | 13 | DEX single physical; 100% of normalized 무심검; proc 50; MP 65; accuracy +25; penetration 30; skill crit +15%p | ranged family |
| `skyascendant` | `v2c_skyascendant_voidbreak` | 파공 | 13 | DEX four-hit physical at 1:1:1:2; total 105% of normalized 천룡난무; proc 50; MP 65 | martial family |
| `skyascendant` | `v2c_skyascendant_crossover` | 교차 | 20 | passive DEX +20, STR +12, crit +8%p, accuracy +20 | capture +20, pursuit +40, enemy delay 20, haste 15; PvP capture 12, pursuit 25, delay 10, haste 10 |
| `primordialsage` | `v2c_primordialsage_greatorb` | 대마력구 | 12 | INT single magic; 85% of normalized 비전붕괴; penetration 15; proc 60; MP is rounded 70% of 비전붕괴 MP | one formula stage; completion haste 15 |
| `primordialsage` | `v2c_primordialsage_optimization` | 마력 최적화 | 12 | passive max MP +20, MP cost −20% | complete formula restores max MP 10% and may consume all current MP |
| `primordialsage` | `v2c_primordialsage_completeformula` | 완전식 | 22 | passive INT +20, SPI +10, magic skill damage +24 | stage 3; direct final +50, penetration +35, haste 20; PvP +30/+20/+12 |

- [ ] **Step 1: Add failing catalog and ratio tests**

Assert all IDs, Korean names, SP costs, and exact mappings. Assert the prerequisite pairs through `TIER7_COMBAT_JOB_PREREQS` and assert each package totals 46 SP. For damage, compare normalized definitions rather than duplicating fragile flat values:

```ts
expect(totalDamageCoef(V2_SKILLS.v2c_shadowblade_afterimage))
  .toBeCloseTo(totalDamageCoef(V2_SKILLS.v2c_swordsaint_flash) * 0.9, 6);
expect(totalDamageCoef(V2_SKILLS.v2c_ruinblade_ruinsword))
  .toBeCloseTo(totalDamageCoef(V2_SKILLS.v2c_swordsaint_flash) * 1.8, 6);
expect(totalDamageCoef(V2_SKILLS.v2c_skyascendant_voidbreak))
  .toBeCloseTo(totalDamageCoef(V2_SKILLS.v2c_celestialdragon_combo) * 1.05, 6);
expect(totalDamageCoef(V2_SKILLS.v2c_primordialsage_greatorb))
  .toBeCloseTo(totalDamageCoef(V2_SKILLS.v2c_archmage_arcane_collapse) * 0.85, 6);
```

- [ ] **Step 2: Confirm RED**

```bash
npm test -- src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/tier7SkillMechanics.test.ts
```

Expected: all twelve IDs are absent.

- [ ] **Step 3: Add definitions and internal mappings**

Add the exact data table above. Extend the relevant ID unions. Use standard effect fields wherever they exist; add the narrowly scoped active fields `skillCritChancePct?: number` and `accuracyBonusPct?: number` to `V2SkillDefinition`, and add `mpCostReductionPct?: number` to `V2PassiveSkillEffect`. Aggregate MP reduction additively in `aggregateEquippedPassives`. Price active skill crit at `value / 6`, active accuracy at `value / 30`, and passive MP reduction at `value / 20` before the existing proc/MP/cooldown multipliers. Add focused assertions for all three so these ordinary values are not hidden from the score.

Map each skill to its internal job ID in `V2_SKILLS_BY_JOB`. Do not add a job definition. Because trainer pools are reached through catalog jobs and none of these IDs enters `V2_JOB_CATALOG`, generic learning and starter-grant paths cannot expose the skills; add a regression asserting that none appears in any selectable job's skill pool.

- [ ] **Step 4: Calibrate only through runtime descriptor values**

Run the package validator for each group. The accepted ranges are:

```ts
expect(packageScore("shadowblade")).toBeCloseTo(16.4, 1);
expect(packageScore("ruinblade")).toBeCloseTo(16.3, 1);
expect(packageScore("skyascendant")).toBeCloseTo(16.7, 1);
expect(packageScore("primordialsage")).toBeCloseTo(16.4, 1);
```

If rounding moves an estimate by up to 0.1, keep the approved runtime values and accept that rounding. Do not insert a score override. All four must still satisfy the global range validator.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/data/v2/v2Skills.test.ts
npx tsc --noEmit
npx eslint src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2SkillsByJob.test.ts
git diff --check
git add src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/data/v2/v2Skills.ts
git diff --cached --check
git commit -m "feat: add internal tier 7 skill packages"
```

### Task 3: Implement 무영검신 sword-shadow combat

**Files:**
- Create: `src/adventure/v2/combat/shadowBladeCombat.ts`
- Create: `src/adventure/v2/combat/shadowBladeCombat.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`

**Interfaces:**

```ts
export type SwordShadowState = {
  sourceSkillId: V2SkillId;
  sourceFinalDamage: number;
  recordPct: number;
  refined: boolean;
};

export function recordSwordShadow(input: {
  existing?: SwordShadowState;
  sourceSkillId: V2SkillId;
  dealtDamage: number;
  recordPct: number;
}): SwordShadowState | undefined;
export function refineSwordShadow(state: SwordShadowState | undefined, addPctPoints: number): SwordShadowState | undefined;
export function releaseSwordShadow(state: SwordShadowState | undefined): { damage: number; followUpPct: number };
```

- [ ] **Step 1: Write pure RED tests**

Cover: 50/65 base shadow, 70/85 잔영 shadow, stronger record replacement, weaker record preservation, 무흔 refinement once, release after the enemy's next action even when that action is skipped/stunned, stored final damage without re-hit/re-crit/re-defense, shield absorption, caster death during the enemy action, double-death draw, and the one-use +15% next single-physical bonus. Add PvP expectations at 80% of record and follow-up values.

- [ ] **Step 2: Confirm RED and implement the pure module**

```bash
npm test -- src/adventure/v2/combat/shadowBladeCombat.test.ts
```

Expected: module missing. Implement immutable helpers; `releaseSwordShadow` must return zero/empty for missing state and must never perform hit or crit rolls.

- [ ] **Step 3: Add serialized battle state**

Add optional `swordShadow` and `shadowBladeFollowUpPct` fields to `BattleStacks` and the PvP equivalent. Keep the object JSON-safe and absent for non-users.

- [ ] **Step 4: Wire the exact action boundaries**

After a successful single-physical hit, record the source's final dealt damage and its current record percentage. On 무흔 hit, refine the existing shadow before the enemy-action hook. At the end of the enemy action—including stun/skip—release against the enemy shield, then HP. Run this hook before battle-result finalization so caster death plus shadow lethal resolves as a draw. Consume the follow-up on the next attempted single-physical action; the bonus affects damage only when that action hits. For 무심검, select `max(STR, LUK)` only when 검영 is equipped. Preserve 일검필살 on 잔영 and explicitly exclude it from 무흔.

- [ ] **Step 5: Add isolated-loadout and PvE/PvP integration tests**

Use deterministic RNG to show 잔영 and 무흔 each retain at least 70% of their full-package expected damage, and show the shadow fires within three player actions. Repeat the PvP cap assertions through the actual PvP phase, not only the pure helper.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/adventure/v2/combat/shadowBladeCombat.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
npx tsc --noEmit
npx eslint src/adventure/v2/combat/shadowBladeCombat.ts src/adventure/v2/combat/shadowBladeCombat.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.pvp-atb.ts
git diff --check
git add src/adventure/v2/combat/shadowBladeCombat.ts src/adventure/v2/combat/shadowBladeCombat.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.pvp-atb.ts
git diff --cached --check
git commit -m "feat: implement shadowblade sword shadows"
```

### Task 4: Implement 멸검제 intent and charged finisher

**Files:**
- Create: `src/adventure/v2/combat/ruinBladeCombat.ts`
- Create: `src/adventure/v2/combat/ruinBladeCombat.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`

**Interfaces:**

```ts
export type RuinChargeState = {
  startHp: number;
  actualHpLost: number;
  deathBypassTriggered: boolean;
  intentAtStart: number;
};

export function gainSwordIntent(current: number, amount: number, maxStacks?: number): number;
export function startRuinCharge(input: { hp: number; intent: number }): RuinChargeState;
export function recordChargeHpLoss(state: RuinChargeState, actualHpLoss: number): RuinChargeState;
export function ruinSwordBonuses(input: { state: RuinChargeState; hp: number; maxHp: number; pvp: boolean }): {
  damagePct: number;
  penetrationPct: number;
};
```

- [ ] **Step 1: Write pure RED tests**

Cover intent gain from every single-physical skill except 멸검, two stacks from 극한일격 at HP ≤40%, maximum three, +8% final per stack, lower-tier skill generation, charge start consuming the current action, automatic release at the next player opportunity, one wait only, post-start silence/stun not cancelling release, actual death cancelling, 패황 death bypass preserving charge and maximizing the charge-loss portion, shields excluded from HP-loss tracking, one stack returned after release, and one-use-per-battle behavior. Verify PvE caps 75/75 and 45 penetration; PvP caps 40/40 and 30 penetration.

- [ ] **Step 2: Confirm RED and implement helpers**

```bash
npm test -- src/adventure/v2/combat/ruinBladeCombat.test.ts
```

Implement all percentage accumulation additively. Clamp each missing-HP component independently. Keep `actualHpLost` monotonic and shield-exclusive.

- [ ] **Step 3: Wire charge priority and HP-loss observation**

Store `swordIntent` and `ruinCharge` in serialized state. Starting 멸검 pays MP and marks once-per-battle immediately but deals no damage. At the next player opportunity, check an existing charge **before** silence/stun/manual skill selection and auto-release it. If HP reaches zero without the existing 패황 death-bypass state, clear the charge. Feed only post-shield HP loss from enemy damage into `recordChargeHpLoss`.

- [ ] **Step 4: Add deterministic engine tests**

Test the default auto-use condition `own HP <= 60% && enemy HP >= 25%`, manual selection outside that condition, unlimited 극한일격, 일검필살 and 일념 applying to 극한일격, and the first visible charge/release sequence within three player actions. Include no-core isolated 극한일격 and no-finisher 일념 loadouts for the standalone-value rule.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/adventure/v2/combat/ruinBladeCombat.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
npx tsc --noEmit
npx eslint src/adventure/v2/combat/ruinBladeCombat.ts src/adventure/v2/combat/ruinBladeCombat.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.pvp-atb.ts
git diff --check
git add src/adventure/v2/combat/ruinBladeCombat.ts src/adventure/v2/combat/ruinBladeCombat.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.pvp-atb.ts
git diff --cached --check
git commit -m "feat: implement ruinblade charged finisher"
```

### Task 5: Implement 비천무신 crossover combat

**Files:**
- Create: `src/adventure/v2/combat/skyAscendantCombat.ts`
- Create: `src/adventure/v2/combat/skyAscendantCombat.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`

**Interfaces:**

```ts
export type CrossFamily = "ranged" | "martial";
export type CrossState = { lastFamily?: CrossFamily };
export type CrossBonus = "none" | "capture" | "pursuit";

export function resolveCrossover(input: {
  state: CrossState;
  currentFamily?: CrossFamily;
  hit: boolean;
  pvp: boolean;
}): { state: CrossState; bonus: CrossBonus; hastePct: number };
```

- [ ] **Step 1: Write pure RED tests**

Cover ranged→martial pursuit, martial→ranged capture, same-family no bonus but state update, unrelated skill preserving state, misses updating family but granting no extra damage, and haste only after a successful crossover. Assert the exact PvE/PvP values from Task 2.

- [ ] **Step 2: Confirm RED and implement helpers**

```bash
npm test -- src/adventure/v2/combat/skyAscendantCombat.test.ts
```

Keep family transition independent from hit success. Return bonuses only for a hit. Do not mutate the input state.

- [ ] **Step 3: Wire capture and pursuit at damage resolution**

Store `lastCrossFamily` in serialized state. Before damage, capture adds +20% final, +25 accuracy points, and raises total penetration to 45 in PvE; PvP uses +12% final and only +10 penetration points. After a successful 파공, pursuit deals a separate fixed 40% of that action's final direct damage and applies enemy delay 20; PvP uses 25% and delay 10. Apply next-action haste 15 in PvE or 10 in PvP. Lower-tier 천궁궤적/천룡난무 participate in their respective families. For 천룡난무 only, use `max(STR, DEX)` when 교차 is equipped.

- [ ] **Step 4: Add engine and standalone tests**

Prove both orders in the actual PvE and PvP phases, prove misses transition without bonus, prove unrelated actions do not clear state, and prove a visible crossover within the first two player actions. Test 낙성 and 파공 alone at or above 70% of their full-package expected contribution.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/adventure/v2/combat/skyAscendantCombat.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
npx tsc --noEmit
npx eslint src/adventure/v2/combat/skyAscendantCombat.ts src/adventure/v2/combat/skyAscendantCombat.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.pvpPhase.ts
git diff --check
git add src/adventure/v2/combat/skyAscendantCombat.ts src/adventure/v2/combat/skyAscendantCombat.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.pvpPhase.ts
git diff --cached --check
git commit -m "feat: implement skyascendant crossover combat"
```

### Task 6: Implement 태초현자 complete-formula combat

**Files:**
- Create: `src/adventure/v2/combat/primordialSageCombat.ts`
- Create: `src/adventure/v2/combat/primordialSageCombat.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**

```ts
export type FormulaState = {
  stages: number;
  seenSkillIds: V2SkillId[];
};

export function previewFormulaCast(input: {
  state: FormulaState;
  skillId: V2SkillId;
  stages: 0 | 1 | 2;
}): { next: FormulaState; completes: boolean };
export function optimizedMpCost(baseCost: number, reductionPct: number): number;
export function canCastWithFormulaMana(input: {
  currentMp: number;
  normalCost: number;
  completes: boolean;
  optimizationEquipped: boolean;
}): boolean;
```

- [ ] **Step 1: Write pure RED tests**

Cover unused direct magic +1 stage, composite 오원소 폭주/태초회귀 +2, other single/base variants +1, three stages completing the current spell and resetting, repeat ID not advancing or resetting, variants sharing the same ID, support/non-magic no effect, misses advancing, and no extra MP for completion. Cover 20% MP reduction as `baseCost - floor(baseCost * 0.2)` with minimum 1, zero-MP completion allowed only with 마력 최적화, all current MP consumed, and 10% max-MP restoration after completion.

- [ ] **Step 2: Confirm RED and implement helpers**

```bash
npm test -- src/adventure/v2/combat/primordialSageCombat.test.ts
```

`previewFormulaCast` must be pure so the MP gate and committed cast use the same preview. Reset `seenSkillIds` only after successful completion. The direct-damage bonus must not multiply healing, status, delay, shield, or other ancillary effects.

- [ ] **Step 3: Mark composite variants explicitly**

Extract the inline `castVariants` entry into an exported `V2SkillCastVariant` type and add `formulaStages?: 1 | 2`. Mark only `개벽·오원소 폭주` and `개벽·오원소 회귀` as `2`; ordinary direct-magic variants default to `1`. Do not infer the rule from localized names.

- [ ] **Step 4: Wire formula preview before the MP gate**

Store `completeFormula` in battle state. Resolve the variant, compute its stage weight, preview completion, then check MP. Add the passive's 20 points to `aggregateEquippedPassives` and copy the aggregate into `PlayerCombat.mpCostReductionPct` in `derivePlayerCombatV2`. Use the existing refund semantics as the single source of actual cost: `max(1, baseCost - floor(baseCost * reductionPct / 100))`. Expand the pre-cast MP gate to use that effective cost, then remove or bypass the post-cast refund for a cast already charged at effective cost so reduction is never applied twice. A completing cast with insufficient effective MP consumes all current MP, including zero. After a successful completing cast, restore 10% max MP, apply current-action direct final +50%, penetration +35, and next-action haste 20. PvP uses +30%, +20, and haste 12. Apply 대마력구's separate haste 15 when it completes a formula. Never add a second MP charge.

- [ ] **Step 5: Add engine and standalone tests**

Test the complete sequence in PvE and PvP, repetition, miss progression, composite +2, zero-MP completion, ancillary effects unchanged, and visible completion within three player actions. Test 대마력구 without either passive and 마력 최적화 with lower-tier direct magic to prove standalone utility.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/adventure/v2/combat/primordialSageCombat.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
npx tsc --noEmit
npx eslint src/adventure/v2/combat/primordialSageCombat.ts src/adventure/v2/combat/primordialSageCombat.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.pvpPhase.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts
git diff --check
git add src/adventure/v2/combat/primordialSageCombat.ts src/adventure/v2/combat/primordialSageCombat.test.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.pvpPhase.ts src/lib/server/derivePlayerCombatV2.ts src/lib/server/derivePlayerCombatV2.test.ts
git diff --cached --check
git commit -m "feat: implement primordialsage complete formulas"
```

### Task 7: Add descriptions, replay coverage, and the future tier-7 standard

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2Skills.test.ts`
- Modify: `src/adventure/data/v2/replayPayload.test.ts`
- Modify: `src/adventure/data/v2/tier7SkillMechanics.test.ts`
- Modify: `docs/superpowers/specs/2026-08-19-tier7-capstone-balance-design.md` only if implementation uncovered a factual interface name that the design document states incorrectly.

- [ ] **Step 1: Add failing text and serialization regressions**

Assert that every percentage, cap, trigger order, once-per-battle rule, and PvP reduction is visible in `describeV2Skill`. Add representative `info`/`extra_damage` combat-log entries for 검영, 멸검, 교차, and 완전식 to `replayPayload.test.ts`; assert `toReplayPayload` preserves them and `toPvpReplayPayload` swaps their side/turn perspective without changing the text or effect tag. Battle-only nested mechanic state is deliberately not part of replay payloads.

- [ ] **Step 2: Confirm RED and implement descriptions**

```bash
npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/replayPayload.test.ts
```

Render from `tier7Mechanic`; do not duplicate the numbers in a second prose-only table. Keep Korean labels `검영`, `검의`, `충전`, `교차`, and `완전식` consistent between descriptions and combat logs.

- [ ] **Step 3: Make the validator reusable for future packages**

Add parameterized tests showing that future internal IDs can pass without entering a name allowlist. Add failing fixtures for 45 SP, 19 points, and 0.34 efficiency. The validator must inspect definitions only.

- [ ] **Step 4: Verify focused suites and commit**

```bash
npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/replayPayload.test.ts src/adventure/data/v2/tier7SkillMechanics.test.ts
npx tsc --noEmit
npx eslint src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/replayPayload.test.ts src/adventure/data/v2/tier7SkillMechanics.test.ts
git diff --check
git add src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/replayPayload.test.ts src/adventure/data/v2/tier7SkillMechanics.test.ts
git add -p
git diff --cached --check
git commit -m "test: enforce tier 7 capstone standard"
```

### Task 8: Run end-to-end non-release verification

**Files:**
- Test only; modify production files only if a failing test exposes a defect within Tasks 1–7.

- [ ] **Step 1: Run all tier-7 and directly affected suites**

```bash
npm test -- src/adventure/data/v2/tier7SkillMechanics.test.ts src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/replayPayload.test.ts src/adventure/v2/combat/shadowBladeCombat.test.ts src/adventure/v2/combat/ruinBladeCombat.test.ts src/adventure/v2/combat/skyAscendantCombat.test.ts src/adventure/v2/combat/primordialSageCombat.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
```

Expected: all focused suites pass, each package remains 46 SP / 16–18 points / 0.35–0.40 efficiency, and every PvP cap is exercised through the PvP engine.

- [ ] **Step 2: Run repository verification**

```bash
npm test
npx tsc --noEmit
npx eslint src/adventure/data/v2/tier7SkillMechanics.ts src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/data/v2/replayPayload.test.ts src/adventure/v2/combat/shadowBladeCombat.ts src/adventure/v2/combat/ruinBladeCombat.ts src/adventure/v2/combat/skyAscendantCombat.ts src/adventure/v2/combat/primordialSageCombat.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.pvp-atb.ts
npm run build
git diff --check
git status --short
```

Expected: tests, types, lint, and build pass. `prebuild` may optimize only newly added images, but this plan adds no images, so it must not produce image changes.

- [ ] **Step 3: Audit the non-release boundary**

```bash
rg -n 'shadowblade|ruinblade|skyascendant|primordialsage' src/adventure/data/v2/v2JobCatalog.ts src/adventure/v2/jobRoadmapModel.ts src/app/api/adventure/v2
git diff --name-only
```

Expected: no tier-7 job appears in `V2_JOB_CATALOG`, roadmap data, or a job-change API; the IDs appear only in internal skill/mechanic code and tests. No deployment or maintenance script is touched.

- [ ] **Step 4: Commit only any verification-driven fix**

If verification required an in-scope fix, rerun its failing command and commit only that fix:

```bash
git add -p
git diff --cached --check
git commit -m "fix: close tier 7 combat regressions"
```

If no fix was required, do not create an empty commit.

---

## Separate Release Plan Required

This combat plan intentionally ends with four tested but non-selectable internal packages. A later approved release plan must define and test all of the following before adding the jobs to `V2_JOB_CATALOG`:

- exact tier-7 `jobBonus` and `cultivateProfile` values;
- exact origin-fragment material cost and consumption transaction;
- two tier-6 prerequisite validation at cumulative level 100,000;
- roadmap/job-change UI and API behavior;
- release flag and production migration/rollback procedure;
- patch notes and deployment timing.
