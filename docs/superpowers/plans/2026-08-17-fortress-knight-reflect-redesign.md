# Fortress Knight Reflect Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Fortress Knight's permanent defense reflection with a three-hit Iron Wall stance and a hit-generated Impact resource shared by PvE, PvP, and combat patterns.

**Architecture:** Add pure Fortress runtime helpers and explicit battle-stack fields, then pass the resource state through the existing shared skill resolver. Catalog metadata declares which skill grants Iron Wall and which attacks consume Impact; PvE and PvP engines own hit qualification, resource consumption, and damage application. Existing `selfBuffPct` storage is retained but defensive entries become incoming-attack charges.

**Tech Stack:** TypeScript, Vitest, React 19 server rendering tests, existing PvE/PvP battle engines.

## Global Constraints

- Apply all combat rules identically in PvE and PvP unless the existing PvP damage multiplier or mitigation path already differs.
- Do not deploy.
- Preserve unrelated dirty-worktree changes, including the in-progress duelist job-line edits.
- Existing combat-pattern saves remain compatible; malformed or unknown resource conditions fail safely.
- Use test-first red/green cycles for behavior changes.

---

### Task 1: Runtime resource model and shared pattern condition

**Files:**
- Create: `src/adventure/v2/combat/fortressKnight.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/combatPattern.ts`
- Test: `src/adventure/v2/combat/fortressKnight.test.ts`
- Test: `src/adventure/v2/combat/combatPattern.test.ts`

**Interfaces:**
- Produces `FORTRESS_IMPACT_MAX`, `ironWallDamageReductionPct(charges)`, and `resolveFortressReaction(...)`.
- Adds `fortressImpact` and `ironWallReflectCharges` to PvE/PvP stack types.
- Adds `self_resource` conditions for resources `impact | ironWallReflect`.

- [ ] Write failing pure-helper tests for a landed hit consuming one Iron Wall charge, producing DEF×180% raw reflect, granting at most three Impact, and doing nothing on a miss.
- [ ] Run `npm test -- src/adventure/v2/combat/fortressKnight.test.ts` and verify the missing module/API failure.
- [ ] Implement the minimal pure helper and stack fields; initialize both resources to zero.
- [ ] Add failing pattern tests for `none`, inclusive `atLeast`/`atMost`, parser clamping, and unknown-resource rejection.
- [ ] Run `npm test -- src/adventure/v2/combat/combatPattern.test.ts` and verify the new condition fails.
- [ ] Implement `self_resource` type, evaluator, parser, and pattern context values.
- [ ] Run both focused test files and verify they pass.

### Task 2: Passive aggregation, derived combat properties, and skill catalog

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Test: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Adds passive fields `fortressImpactOnHit`, `fortressImpactDamagePctPerStack`, and `fortressDefSkillStatCoefPct`.
- Adds active-skill metadata `ironWallReflect` and `consumesFortressImpact`.
- Exposes matching optional fields on `PlayerCombat`.

- [ ] Replace old reflect assertions with failing assertions for zero lineage `thornsDefPct`, Impact flags, +15% DEF-skill coefficient, and max +20% Impact payoff.
- [ ] Run the two focused test files and confirm failures describe the old catalog/derive behavior.
- [ ] Change `가시 방벽` to `충격 방벽`, replace three passive reflect fields, and declare Iron Wall/Impact-consumer metadata.
- [ ] Set raw catalog coefficients so normalized effects reach 1.45, 1.65, and 2.05, retaining legacy flats 120, 200, and 450 after normalization.
- [ ] Aggregate and derive the new properties without changing unrelated passive behavior.
- [ ] Update skill descriptions/chips and job comments; run the focused tests to green.

### Task 3: Shared skill resolution and Impact consumption

**Files:**
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Test: `src/adventure/v2/combat/combatPatternCast.test.ts`

**Interfaces:**
- `V2SkillCastInput.attacker` consumes current fortress resources and passive modifiers.
- `V2SkillCastResult` produces Iron Wall state to apply and the number of Impact stacks to consume only on a successful target hit.

- [ ] Add failing cast tests showing DEF-scaling coefficient +15%, final Impact multipliers of 1.45/1.60, no consumption on miss, Iron Wall setup, and resource-aware default selection.
- [ ] Run `npm test -- src/adventure/v2/combat/combatPatternCast.test.ts` and confirm the intended failures.
- [ ] Thread resource values into `buildPatternCtx`, apply the DEF coefficient modifier only to `scaling="def"`, and apply Impact after pattern throttling as a final direct-damage multiplier.
- [ ] Emit Iron Wall setup and Impact consumption in cast results; clear target-bound consumption in `removeMissedV2SkillTargetEffects`.
- [ ] Add smart default conditions for max-Impact `성채 충각` and empty-charge `철벽 태세`; run the focused tests to green.

### Task 4: PvE incoming attacks and attack-count defensive buffs

**Files:**
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Test: `src/adventure/v2/combat/atbSkillCast.test.ts`
- Test: `src/adventure/battle/engine.tier5.test.ts`

**Interfaces:**
- Normal basics, provoked basics, and enemy direct skills each resolve one Fortress reaction.
- Defensive `selfBuffPct` counters are consumed by qualifying incoming attacks, not player turns.

- [ ] Add failing PvE tests for Iron Wall refresh-to-three, 30% reduction, three reflections, Impact gain/cap, successful direct-skill consumption, multi-hit one-charge behavior, and two provoked basics consuming two charges.
- [ ] Add a failing regression proving player turns no longer reduce evasion/damage-reduction/reflect counters and incoming attacks consume the applicable counters once.
- [ ] Run the focused PvE tests and verify expected failures.
- [ ] Apply cast state, resource context, hit reactions, logs, and resource consumption to PvE basic/skill paths.
- [ ] Move defensive counter decrements out of `finishPlayerTurn`; consume them in direct incoming attack resolution while excluding DoT ticks.
- [ ] Run focused PvE tests to green.

### Task 5: PvP incoming attacks and parity

**Files:**
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Test: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`
- Test: `src/adventure/v2/combat/engine-pvp.test.ts`

**Interfaces:**
- PvP uses the same Fortress helper, then existing reflect mitigation, arena damage multiplier, barriers, and survival handling.
- Each PvP basic or direct-skill action consumes at most one reactive charge even for multi-hit skills.

- [ ] Add failing PvP tests mirroring the PvE three-charge, Impact, miss, multi-hit, provoke, and defensive-counter cases.
- [ ] Run focused PvP tests and confirm failures are due to missing new behavior.
- [ ] Thread resources through PvP casts, apply Iron Wall reduction before normal mitigation, resolve its raw reflect through the existing PvP reflect pipeline, and update logs/stacks.
- [ ] Remove owner-action decrements for defensive counters and consume them on incoming direct attacks.
- [ ] Run focused PvP tests to green.

### Task 6: Combat-pattern editor and user-facing descriptions

**Files:**
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Test: `src/adventure/v2/V2CombatPatternView.test.tsx`
- Test: `src/adventure/data/v2/v2Skills.test.ts`

**Interfaces:**
- The editor exposes `내 전투 자원`, resource selector, `없을 때 | 이상 | 이하`, and an integer threshold.

- [ ] Add failing render tests for the new resource condition controls and skill-detail chips.
- [ ] Run the two focused test files and verify failures.
- [ ] Add condition defaults, selector options, and parameter controls using existing opaque surface primitives.
- [ ] Update log/skill wording from action duration to attack counts where applicable.
- [ ] Run focused UI/data tests to green.

### Task 7: Verification and balance simulation

**Files:**
- Modify or create only a reusable local simulation script if an existing one cannot express the matchup.

**Interfaces:**
- No new production interface; produces verification evidence and coefficient comparison.

- [ ] Run all touched focused tests together.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm test`.
- [ ] Run the Fortress Knight versus mana-shield mage PvP simulation for DEF-calibrated builds at Iron Wall reflect coefficients 160%, 180%, and 200%; record win rate, reflect median, and direct-skill contribution.
- [ ] Review `git diff --check`, `git status --short`, and the scoped diff to ensure unrelated worktree changes were not included.
- [ ] Commit only the implementation and its tests/docs; do not deploy or push.
