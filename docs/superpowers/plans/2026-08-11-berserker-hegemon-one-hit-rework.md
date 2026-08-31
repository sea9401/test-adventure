# Berserker–Hegemon One-Hit Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the berserker-to-hegemon lineage's repeated HP-cost attacks with a missing-HP-scaled setup/finisher loop and tier-5/6 death-overcome mechanics.

**Architecture:** Add one shared `missingHpDamage` effect for deterministic damage math, derive the cumulative passive as `berserkerMadnessRank`, and keep transient setup/death state in a focused `berserkerCombat.ts` helper shared by PvE and PvP. Existing skill IDs and persisted loadouts remain intact; generic `enduranceActive` stays separate.

**Tech Stack:** TypeScript 5, Vitest 4, existing V2 combat engines and skill catalog.

## Global Constraints

- Keep all eight skill IDs and persistence formats.
- Keep active SP at 6/7/10/13, passive SP at 5/7/14/15, and runtime active MP at 76.
- Scale actives from maximum-HP-relative lost HP, never raw missing HP.
- Death overcome sets HP to `max(1, floor(maxHp * 0.4))`; healing modifiers do not affect it.
- PvP uses 60% of the PvE missing-HP coefficient contribution.
- Do not add a gauge, HUD, dependency, migration, or deployment.
- Preserve unrelated worktree changes and make focused commits.

---

### Task 1: Missing-HP Effect and Catalog

**Files:**
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/adventure/data/v2/v2SkillsCommonCatalog.ts`
- Modify: `src/adventure/data/v2/v2SkillsByJob.ts`
- Test: `src/adventure/data/v2/v2Skills.test.ts`
- Test: `src/adventure/data/v2/v2SkillsByJob.test.ts`
- Test: `src/adventure/data/v2/hpScaledAttackCompensation.test.ts`

**Interfaces:**
- Produces: `{ kind: "missingHpDamage"; attackCoef: number; statCoef: number; missingHpCoef: number; selfCurrentHpCostPct?: number; scaling: "physical" }`.
- Produces: 사혈격, 혈전, 파멸일격, 멸왕일도 catalog contracts.

- [ ] **Step 1: Write failing catalog tests**

Assert these exact effects and names:

```ts
expect(V2_SKILLS.v2c_berserker_bloodslash.effects[0]).toEqual({
  kind: "missingHpDamage", attackCoef: 1, statCoef: 1,
  missingHpCoef: 0.4, selfCurrentHpCostPct: 10, scaling: "physical",
});
expect(V2_SKILLS.v2c_warlord_bloodbath.effects[0]).toMatchObject({
  kind: "missingHpDamage", attackCoef: 1.1, statCoef: 1.2,
  missingHpCoef: 0.7, selfCurrentHpCostPct: 15,
});
expect(V2_SKILLS.v2c_overlord_ruin).toMatchObject({ name: "파멸일격" });
expect(V2_SKILLS.v2c_hegemon_annihilation).toMatchObject({ name: "멸왕일도", oncePerBattle: true });
```

Also assert 파멸일격 uses 1.5/1.8/1.4, 멸왕일도 uses 2.0/2.4/2.0, the old execute/debuff effects are absent, and SP totals remain 51.

- [ ] **Step 2: Run tests and observe RED**

Run: `npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/hpScaledAttackCompensation.test.ts`

Expected: FAIL because the new effect and catalog values do not exist.

- [ ] **Step 3: Implement the effect type and exhaustive handling**

Add `missingHpDamage` to the `V2SkillEffect` union, direct-damage guards, SP pricing, enhancement scaling, description chips, and `DAMAGE_EFFECT_KINDS`. Price at a 50% expected lost-HP ratio and apply the HP-cost discount only when `selfCurrentHpCostPct` exists.

- [ ] **Step 4: Replace the eight catalog entries**

Use the approved coefficients, names, costs, 56/50/44/40 proc rates, explicit SP costs, and 70/70/50/25 HP default conditions. Remove old generic berserk attack, max-HP, crit-damage, reflect reduction, execute, vulnerability, and healing-reduction effects. Keep `berserker_madness` ranks 1–4.

- [ ] **Step 5: Run GREEN and commit**

Run the Step 2 command. Expected: PASS.

Commit: `git commit -m "feat: redefine berserker lineage finishers"` with only Task 1 files staged.

### Task 2: Shared Damage Math and Cast Transitions

**Files:**
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/combatPattern.ts`
- Test: `src/adventure/v2/combat/combatPattern.test.ts`
- Test: `src/adventure/v2/combat/combatPatternCast.test.ts`
- Test: `src/adventure/v2/combat/multiHitLog.test.ts`

**Interfaces:**
- Consumes: `missingHpDamage` from Task 1.
- Produces: `V2BerserkerCastContext` and `V2BerserkerCastTransition`.

```ts
export type V2BerserkerCastContext = {
  madnessRank: 0 | 1 | 2 | 3 | 4;
  finisherReady: boolean;
  deathDamageReady: boolean;
  annihilationUsesRemaining: number;
};
export type V2BerserkerCastTransition = {
  grantFinisher: boolean;
  consumeFinisher: boolean;
  consumeDeathDamage: boolean;
  consumeAnnihilationUse: boolean;
  forceSkillCrit: boolean;
  bonusSkillCritDamagePct: number;
};
```

- [ ] **Step 1: Write failing formula tests**

For `{ atk: 100, str: 100, maxHp: 1000 }` and DEF 0, assert 100/70/50/25/1 HP boundaries. Assert 사혈격 and 혈전 use projected post-cost HP. Assert PvP replaces `missingHpCoef` with `missingHpCoef * 0.6` after blood/death multipliers.

- [ ] **Step 2: Write failing state tests**

Cover prepared 파멸일격, unprepared 혈전, low-HP 멸왕일도, death-ready 멸왕일도, blood retention after proc failure, blood consumption after an executed miss, forced crit, and rank-2 `bonusSkillCritDamagePct: 30`.

- [ ] **Step 3: Run tests and observe RED**

Run: `npm test -- src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/multiHitLog.test.ts`

- [ ] **Step 4: Implement formula and transition output**

Project the on-hit cost, clamp lost fraction to `[0,1]`, multiply attack and STR terms before DEF, and return the cost for engine application. Death-ready attacks force the proc gate, use lost fraction 1, and multiply the coefficient by 1.5. Blood multiplies the coefficient by 1.25 and marks the finisher for forced crit.

- [ ] **Step 5: Implement internal pattern state**

Extend `V2PatternSelfStatus` with `berserkerFinisher` and `berserkerDeathOvercome`. Enforce annihilation use count in `isUsable`; saved custom patterns remain authoritative. On default patterns, death-ready 멸왕일도 precedes normal catalog priority.

- [ ] **Step 6: Run GREEN and commit**

Run the Step 3 command. Expected: PASS.

Commit: `git commit -m "feat: add berserker finisher cast flow"` with only Task 2 files staged.

### Task 3: Passive Rank and Pure Death-Overcome Helper

**Files:**
- Create: `src/adventure/v2/combat/berserkerCombat.ts`
- Create: `src/adventure/v2/combat/berserkerCombat.test.ts`
- Modify: `src/adventure/data/v2/v2Skills.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`

**Interfaces:**
- Produces: `PlayerCombat.berserkerMadnessRank?: 1 | 2 | 3 | 4`.
- Produces: `BerserkerCombatState` and pure lifecycle helpers.

```ts
export type BerserkerCombatState = {
  finisherReady: boolean;
  deathOvercomeUsed: boolean;
  deathDamageReady: boolean;
  hpFloor: number;
  guardUntil: "none" | "current_action_end" | "player_attack_end";
  annihilationUsesRemaining: number;
};
```

- [ ] **Step 1: Write failing rank derivation tests**

Assert the selected exclusive passive derives exactly rank 1/2/3/4. Assert removed generic passive fields are absent from `PlayerCombat`.

- [ ] **Step 2: Write failing pure helper tests**

Cover rank 0/2 no-op, rank 3 HP 40% with current-action guard, rank 4 HP 40% with player-attack guard and death snapshot, voluntary cost exclusion, maximum two annihilation uses after recharge, second lethal death, and generic endurance remaining unused on the first lethal event.

- [ ] **Step 3: Run tests and observe RED**

Run: `npm test -- src/adventure/v2/combat/berserkerCombat.test.ts src/lib/server/derivePlayerCombatV2.test.ts`

- [ ] **Step 4: Aggregate and derive rank**

In `equippedV2PassiveBonuses`, take the maximum `exclusiveRank` for `exclusiveGroup === "berserker_madness"`. Pass it through `derivePlayerCombatV2Pure`; do not map it back to `berserkAtkPctPerLostHpPct`.

- [ ] **Step 5: Implement lifecycle helpers**

Create `initialBerserkerCombatState`, `applyBerserkerLethalDamage`, `finishBerserkerCurrentActionGuard`, and `finishBerserkerPlayerAttack`. Rank 4 increments remaining 멸왕일도 uses with a cap of 2 and sets `deathDamageReady`.

- [ ] **Step 6: Run GREEN and commit**

Run the Step 3 command. Expected: PASS.

Commit: `git commit -m "feat: derive berserker death-overcome state"` with only Task 3 files staged.

### Task 4: PvE Integration

**Files:**
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Create: `src/adventure/v2/combat/berserkerHegemonRework.test.ts`
- Test: `src/adventure/battle/combatShared.test.ts`

**Interfaces:**
- Consumes: Task 2 cast transitions and Task 3 lifecycle helpers.
- Produces: PvE battle-state and log behavior.

- [ ] **Step 1: Write failing end-to-end tests**

Assert the sequence `사혈격 → 혈전 → 파멸일격 → 일반 멸왕일도 → 치명 피해 → HP 40% → 재충전된 강화 멸왕일도`. Add rank-3 action-boundary, rank-4 queued-hit guard, MP-shortage/basic-attack consumption, miss consumption, DoT, and reflection cases.

- [ ] **Step 2: Run tests and observe RED**

Run: `npm test -- src/adventure/v2/combat/berserkerHegemonRework.test.ts src/adventure/battle/combatShared.test.ts`

- [ ] **Step 3: Wire cast state and critical behavior**

Seed berserker state in `initialBattleState`, pass it to `resolveV2SkillCast`, consume cast transitions after execution, OR forced crit into existing skill-critical logic, and add the rank-2 30% critical damage only to blood-prepared finishers.

- [ ] **Step 4: Wire lethal damage paths**

Invoke the helper after shields/barriers/reductions but before generic endurance/outcome resolution for direct enemy damage, enemy V2 skills, DoT ticks, and reflection. Preserve generic endurance for a later lethal hit.

- [ ] **Step 5: Add logs and cleanup**

Emit the approved `[혈전]`, `[혈전 해방]`, `[사망 극복]`, `[패황의 지배]`, and enhanced 멸왕일도 labels. Clear rank-3 guard at current action end and rank-4 guard after the next player attack, including basic attack, failed cast, and miss.

- [ ] **Step 6: Run GREEN and commit**

Run the Step 2 command plus `src/adventure/v2/combat/combatPatternCast.test.ts`. Expected: PASS.

Commit: `git commit -m "feat: integrate hegemon finishers in pve"` with only Task 4 files staged.

### Task 5: PvP Integration

**Files:**
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Test: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`
- Test: `src/adventure/battle/engine-pvp.test.ts`

**Interfaces:**
- Consumes: shared cast/death state from Tasks 2–3.
- Produces: symmetric state for both PvP sides.

- [ ] **Step 1: Write failing PvP tests**

Assert the 0.6 coefficient rule after blood/death multipliers, both sides can trigger HP-40% death overcome, rank-4 guard lasts to that side's next attack, an opponent's death overcome answers lethal 멸왕일도, and generic endurance fires only on a later lethal event.

- [ ] **Step 2: Run tests and observe RED**

Run: `npm test -- src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/battle/engine-pvp.test.ts`

- [ ] **Step 3: Mirror the shared state and helper calls**

Add berserker state to each side, pass it to its V2 cast, consume transitions, and invoke the lethal helper after arena scaling/shields but before generic endurance. End guards at the same boundaries as PvE.

- [ ] **Step 4: Run GREEN and commit**

Run the Step 2 command. Expected: PASS.

Commit: `git commit -m "feat: mirror hegemon death overcome in pvp"` with only Task 5 files staged.

### Task 6: Regression and Balance Verification

**Files:**
- Modify: `src/adventure/data/v2/levelDesignSim.test.ts`
- Modify: `docs/superpowers/specs/2026-08-11-berserker-hegemon-line-rework-verification.md`

**Interfaces:**
- Consumes: completed implementation.
- Produces: updated fixed-seed evidence and 51-SP regression.

- [ ] **Step 1: Update the progression assertions**

Keep `[사혈격, 혈전, 파멸일격, 멸왕일도, 패황의 지배]` at exactly 51 SP. Replace the old four-HP-cost usage assertions with setup, finisher, death overcome, and recharge assertions.

- [ ] **Step 2: Run all focused tests**

Run:

```bash
npm test -- src/adventure/data/v2/v2Skills.test.ts src/adventure/data/v2/v2SkillsByJob.test.ts src/adventure/data/v2/hpScaledAttackCompensation.test.ts src/adventure/data/v2/levelDesignSim.test.ts src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/combat/multiHitLog.test.ts src/adventure/v2/combat/berserkerCombat.test.ts src/adventure/v2/combat/berserkerHegemonRework.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/battle/combatShared.test.ts src/adventure/battle/engine-pvp.test.ts src/lib/server/derivePlayerCombatV2.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run static verification**

Run: `npx tsc --noEmit`

Run:

```bash
npx eslint src/adventure/data/v2/v2Skills.ts src/adventure/data/v2/v2SkillsCommonCatalog.ts src/adventure/data/v2/v2SkillsByJob.ts src/adventure/v2/combat/berserkerCombat.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/combatPattern.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpPhase.ts src/lib/server/derivePlayerCombatV2.ts
```

Expected: both exit 0.

- [ ] **Step 4: Run fixed-seed simulation**

Use seed `20260811`. Record 광왕/패왕/패황 win rates and average actions. Confirm 광왕/패왕 remain within ±10%p, 패황 remains at least 80%, non-critical death-overcome 멸왕일도 is at least 4× a same-tier normal single hit, and the blood-critical peak is approximately 6–8×.

- [ ] **Step 5: Update verification evidence and commit**

Record commands and measured numbers in the verification report; do not claim thresholds without output.

Commit: `git commit -m "test: verify hegemon one-hit combat flow"` with only Task 6 files staged.
