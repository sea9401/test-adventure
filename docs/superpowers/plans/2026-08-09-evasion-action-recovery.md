# Evasion Action Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the three evasion-heal signature items into once-per-owner-action recovery effects with proc chance equal to half the current matchup evasion reduction and healing based on missing HP.

**Architecture:** Add a dedicated `on_action_evasion` signature shape and a pure roll/calculation helper in `signatureEffects.ts`. PvE and PvP calculate their current matchup evasion reduction at the action-entry boundary, apply the shared helper once, then use existing healing/shield and PvP sustain scaling paths. Existing `on_dodge` speed effects and guaranteed-dodge behavior remain unchanged.

**Tech Stack:** TypeScript, Vitest, existing PvE/PvP combat engines

## Global Constraints

- Proc chance is exactly `current evasion damage reduction pct / 2`.
- Recovery is based on missing HP: sealed ring 4%, royal shadow 3%, abyss tracker 3%.
- Roll once per scheduled owner action after action-start DoT; multi-attacks and multi-hit skills do not add rolls.
- PvE and PvP use their existing evasion matchup formulas; PvP also uses its existing sustain multiplier.
- Existing `on_dodge` speed signatures and guaranteed-dodge class effects do not change.
- Do not deploy.

---

### Task 1: Signature data and pure recovery calculation

**Files:**
- Modify: `src/adventure/data/v2/v2EquipmentTypes.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/v2/combat/signatureEffects.ts`
- Modify: `src/adventure/v2/combat/signatureEffects.test.ts`

**Interfaces:**
- Produces: `rollEvasionActionRecovery(signatures, currentHp, maxHp, evasionReductionPct, roll): { amount: number; label: string } | null`
- Produces: `SignatureEffect` support for `trigger: "on_action_evasion"` and `lostHpHealPct`.

- [x] **Step 1: Write failing helper and catalog tests**

```ts
const RECOVERY: SignatureEffect = {
  trigger: "on_action_evasion",
  label: "봉인",
  lostHpHealPct: 4,
};
expect(rollEvasionActionRecovery([RECOVERY], 500, 1000, 50, () => 0.249)).toEqual({
  amount: 20,
  label: "봉인",
});
expect(rollEvasionActionRecovery([RECOVERY], 500, 1000, 50, () => 0.25)).toBeNull();
```

- [x] **Step 2: Run tests and confirm RED**

Run: `npm test -- src/adventure/v2/combat/signatureEffects.test.ts src/adventure/data/v2/v2Equipment.test.ts`

Expected: FAIL because the trigger, property, and helper do not exist yet.

- [x] **Step 3: Implement the minimal signature shape, helper, item data, and tooltip**

```ts
export function rollEvasionActionRecovery(
  signatures: SignatureEffect[] | undefined,
  currentHp: number,
  maxHp: number,
  evasionReductionPct: number,
  roll: () => number = Math.random,
): { amount: number; label: string } | null;
```

The helper filters `on_action_evasion`, sums `lostHpHealPct`, returns null without consuming RNG at full HP/zero calculated heal/zero proc chance, and succeeds only when `roll() * 100 < evasionReductionPct / 2`.

- [x] **Step 4: Run focused tests and confirm GREEN**

Run: `npm test -- src/adventure/v2/combat/signatureEffects.test.ts src/adventure/data/v2/v2Equipment.test.ts`

Expected: both files pass.

### Task 2: PvE once-per-action integration

**Files:**
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Test: `src/adventure/v2/combat/signatureEffects.test.ts`

**Interfaces:**
- Consumes: `rollEvasionActionRecovery(...)` from Task 1.
- Produces: `applyEvasionActionRecoveryPvE(state, player, playerName, roll?)` for legacy and ATB action-entry loops.

- [x] **Step 1: Write failing PvE action-boundary tests**

Create tests showing a damaged player with 50% current evasion reduction and the sealed ring heals 4% of missing HP on a successful action-start roll, does not heal on the threshold roll, and rolls once for a multi-attack action. Add a skill-action test under forced ATB skills.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/atbSkillCast.test.ts`

Expected: FAIL because action recovery is not connected to PvE action entry.

- [x] **Step 3: Implement PvE action-entry application**

Calculate the same effective PvE evasion reduction used by enemy attacks, call the shared helper after action-start DoT and before action resolution, apply actual healing, append `[label] name의 HP +N`, and pass actual healing through `applyHealShieldIfAny`. Remove item healing from `onDodgeHealAmount` call sites so guaranteed dodge retains only class `evadeHealAmount` plus speed signatures.

- [x] **Step 4: Run focused PvE tests and confirm GREEN**

Run: `npm test -- src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/battle/engine.test.ts`

Expected: all selected files pass.

### Task 3: PvP once-per-action integration and complete verification

**Files:**
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`
- Test: `src/adventure/battle/engine-pvp.test.ts`
- Test: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`

**Interfaces:**
- Consumes: `rollEvasionActionRecovery(...)` from Task 1.
- Produces: `applyEvasionActionRecoveryPvP(state, who, roll?)` for legacy and ATB action-entry loops.

- [x] **Step 1: Write failing PvP action and sustain tests**

Add tests showing one roll per actor action, missing-HP recovery after the PvP sustain multiplier, skill actions receiving the same roll, and guaranteed dodge no longer activating the three recovery signatures.

- [x] **Step 2: Run focused PvP tests and confirm RED**

Run: `npm test -- src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`

Expected: FAIL because PvP action recovery is not connected yet.

- [x] **Step 3: Implement PvP action-entry application**

Calculate the actor's current PvP evasion reduction against the opponent, call the shared helper once after action-start DoT, scale the amount with `scalePvPHealing`, update the actor HP, apply `healToShield`, and log the actual recovery. Remove item recovery from `applyDodgeEffects` while preserving class dodge healing and speed effects.

- [x] **Step 4: Run focused PvP tests and confirm GREEN**

Run: `npm test -- src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`

Expected: both files pass.

- [x] **Step 5: Run regression verification**

Run: `npm test -- src/adventure/v2/combat/signatureEffects.test.ts src/adventure/data/v2/v2Equipment.test.ts src/lib/server/derivePlayerCombatV2.test.ts src/adventure/battle/engine.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts`

Run: `npx tsc --noEmit`

Expected: all tests pass and TypeScript exits 0.

- [x] **Step 6: Commit implementation**

```bash
git add src/adventure/data/v2/v2EquipmentTypes.ts src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/v2/combat/signatureEffects.ts src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvp-atb.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts docs/superpowers/plans/2026-08-09-evasion-action-recovery.md
git commit -m "fix: trigger evasion recovery on owner actions"
```
