# Overload Lightning Magic Damage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `과부하 낙뢰` pass through magic defense and applicable damage-reduction layers instead of dealing fixed damage.

**Architecture:** Add a distinct raw `damage_magic` Tier 6 command and a primitive shared mitigation helper. PvE and PvP adapters resolve their own target state through that helper; PvP additionally applies magic barrier, triple ward, arena scaling, combat shield, and existing lethal-survival handling. Other Tier 6 signature damage remains fixed.

**Tech Stack:** TypeScript, Vitest, existing v2 combat reducer/adapters, existing magic barrier and triple ward helpers.

## Global Constraints

- Raw overload damage stays `floor(magicAtk * 1.4)` per 100 overload.
- The strike is guaranteed and cannot crit, miss, consume an action, or trigger skill-cast/direct-hit effects.
- Other Tier 6 signature attacks remain `damage_fixed`.
- Cross-mechanic sanctuary storage uses post-mitigation overload damage.
- Do not modify unrelated balance values, deploy, or change maintenance state.
- Preserve unrelated worktree changes; implementation stays in the isolated `/tmp` worktree.
- No Next.js API or application convention changes are involved, so no Next.js guide is applicable.

---

### Task 1: Add a typed magic command and shared mitigation math

**Files:**
- Create: `src/adventure/v2/combat/tier6UniqueMagicDamage.ts`
- Create: `src/adventure/v2/combat/tier6UniqueMagicDamage.test.ts`
- Modify: `src/adventure/v2/combat/tier6UniqueEffects.ts`
- Modify: `src/adventure/v2/combat/tier6UniqueEffects.test.ts`
- Modify: `src/adventure/v2/combat/tier6UniqueSafety.test.ts`

**Interfaces:**
- Produces: `effectiveTier6MagicDefense(input): number`, `tier6MagicDamageAfterMitigation(input): number`, and `tier6DamageAfterMultiplier(amount, multiplier): number`.
- Produces: `Tier6UniqueCommand` branch `{ kind: "damage_magic"; amount: number; label: string; mechanic: Tier6UniqueMechanic }`.
- Preserves: existing `damage_fixed` command behavior for non-overload mechanics.

- [ ] **Step 1: Write failing reducer and pure-math tests**

In `tier6UniqueEffects.test.ts`, change the overload assertion to require two
`damage_magic` commands of 700 and no overload `damage_fixed` command. Keep the
two MP refunds and remaining-overload assertion.

Create `tier6UniqueMagicDamage.test.ts` with hand-derived expectations:

```ts
import { describe, expect, it } from "vitest";
import {
  effectiveTier6MagicDefense,
  tier6DamageAfterMultiplier,
  tier6MagicDamageAfterMitigation,
} from "./tier6UniqueMagicDamage";

describe("6T 과부하 낙뢰 마법 피해", () => {
  it("마법방어 감소를 기존 곱연산 규칙과 합산 상한으로 한 번 적용한다", () => {
    expect(effectiveTier6MagicDefense({
      baseDefense: 400,
      reductionPcts: [10, 20],
    })).toBe(288);
  });

  it("마법방어 뒤 받는 피해 감소를 적용한다", () => {
    const mitigated = tier6MagicDamageAfterMitigation({
      rawDamage: 700,
      magicDefense: 300,
      damageTakenReductionPct: 25,
    });
    expect(mitigated).toBe(300);
    expect(tier6DamageAfterMultiplier(mitigated, 0.65)).toBe(195);
  });
});
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/tier6UniqueMagicDamage.test.ts
```

Expected: FAIL because `damage_magic` and the helper module do not exist.

- [ ] **Step 3: Implement the primitive helper**

`effectiveTier6MagicDefense` clamps the base defense, combines reduction values
with `cappedDefReductionPct`, and calls `reducedMagicDefense`.
`tier6MagicDamageAfterMitigation` floors finite inputs, calls `damageBetween`,
then applies reduction and multiplier with a one-damage floor for positive
stages.

```ts
export type Tier6MagicDamageInput = {
  rawDamage: number;
  magicDefense: number;
  damageTakenReductionPct?: number;
};
```

- [ ] **Step 4: Emit overload as raw magic damage**

Add `damage_magic` to `Tier6UniqueCommand`. Add a dedicated `emitMagicDamage`
inside the reducer that records the overload core but defers signature-damage
links until an adapter knows the mitigated amount. Use it only in the
`arcane_overload` branch.

Update the structural safety simulation to process `damage_magic` commands like
raw damage against its defense-less synthetic target. This preserves the
existing runaway-damage and bounded-state coverage for overload after the new
command classification.

- [ ] **Step 5: Run GREEN and commit**

```bash
npx vitest run src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/tier6UniqueMagicDamage.test.ts
git add src/adventure/v2/combat/tier6UniqueEffects.ts src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/tier6UniqueMagicDamage.ts src/adventure/v2/combat/tier6UniqueMagicDamage.test.ts src/adventure/v2/combat/tier6UniqueSafety.test.ts
git commit -m "fix: classify overload lightning as magic damage"
```

Expected: both test files pass.

---

### Task 2: Apply PvE magic defense and actual-damage links

**Files:**
- Modify: `src/adventure/v2/combat/tier6UniquePveAdapter.ts`
- Modify: `src/adventure/v2/combat/tier6UniquePve.test.ts`

**Interfaces:**
- Consumes: Task 1 `damage_magic`, `effectiveTier6MagicDefense`, and `tier6MagicDamageAfterMitigation`.
- Produces: PvE enemy HP loss after effective magic defense and post-mitigation signature-link state.

- [ ] **Step 1: Write failing PvE behavior tests**

Add tests using a 500-magic-attack overload owner and the real adapter:

```ts
it("과부하 낙뢰는 적 마법방어를 거친 마법 피해를 준다", () => {
  const player = {
    ...basePlayer,
    magicAtk: 500,
    equipSignatures: [signature("arcane_overload")],
  };
  const initial = initialBattleState(
    player,
    { ...enemy, magicDef: 300 },
    "뇌정술사",
  );
  const after = applyTier6UniquePveEvent(initial, player, {
    kind: "mp_spent",
    amount: 100,
    magicAtk: 500,
    targetHasStatus: false,
    origin: { actionId: 1, eventId: 1 },
  });
  expect(initial.enemyHp - after.enemyHp).toBe(400);
  expect(after.log.at(-1)?.text).toContain("400 마법 피해");
});
```

Add a second fixture with `enemyMagicDefReductionPct: 50` and expect 550 damage.
Add a third fixture with `triphase_link`; against 300 magic defense expect
`sanctuaryReserve` to increase by 40, not 70.

- [ ] **Step 2: Run RED**

```bash
npx vitest run src/adventure/v2/combat/tier6UniquePve.test.ts
```

Expected: FAIL because the adapter does not handle `damage_magic`.

- [ ] **Step 3: Implement PvE resolution**

For `damage_magic`, derive base defense from `state.enemy.magicDef ??
state.enemy.def`. Combine active `enemyMagicDefDebuffPct` and
`player.enemyMagicDefReductionPct`, calculate the mitigated damage, and subtract
it from enemy HP. Return the mitigated amount from `applyCommand`.

After applying the command, call `resolveTier6UniqueEvent` with a
`signature_damage` event using the original event origin and mitigated amount,
then store its state. This applies triphase/confluence links after mitigation
without re-emitting damage.

Change only the magic command log text to `${value} 마법 피해`; fixed commands
keep `${value} 추가 피해`.

- [ ] **Step 4: Run GREEN and commit**

```bash
npx vitest run src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/tier6UniqueMagicDamage.test.ts
git add src/adventure/v2/combat/tier6UniquePveAdapter.ts src/adventure/v2/combat/tier6UniquePve.test.ts
git commit -m "fix: mitigate overload lightning in pve"
```

Expected: all focused tests pass.

---

### Task 3: Apply PvP defensive layers

**Files:**
- Create: `src/adventure/v2/combat/pvpDamageReduction.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/tier6UniquePvpAdapter.ts`
- Modify: `src/adventure/v2/combat/tier6UniquePvp.test.ts`

**Interfaces:**
- Moves: `pvpSideDamageTakenReductionPct(side: PvPSide): number` into the new low-level module and re-exports it from `engine-pvp.ts` for existing consumers.
- Consumes: magic barrier, triple ward, combat shield, shared magic mitigation, and hostile-survival helpers.
- Produces: PvP target state after all defensive layers plus the post-mitigation signature-link amount.

- [ ] **Step 1: Write failing PvP behavior tests**

Import `applyTier6UniquePvpEvent` and add these real-state cases:

```ts
it("과부하 낙뢰는 마법방어·받피감·아레나 배율을 순서대로 거친다", () => {
  const attacker = player({
    magicAtk: 500,
    equipSignatures: [signature("arcane_overload")],
  });
  const defender = player({
    magicDef: 300,
    passiveDamageTakenReductionPct: 25,
  });
  const initial = {
    ...initialBattleStatePvP(attacker, defender, "뇌정술사", "방어자"),
    damageMultiplier: 0.65,
  };
  const after = applyTier6UniquePvpEvent(initial, "p1", "p2", {
    kind: "mp_spent",
    amount: 100,
    magicAtk: 500,
    targetHasStatus: false,
    origin: { actionId: 1, eventId: 1 },
  });
  expect(initial.p2.hp - after.p2.hp).toBe(195);
});
```

Add a full magic-barrier case that absorbs the strike without HP loss. Add a
rank-1 magic triple ward plus 100 combat shield case: the ward consumes one
magic charge, the shield reaches zero, and only the remainder reaches HP.

- [ ] **Step 2: Run RED**

```bash
npx vitest run src/adventure/v2/combat/tier6UniquePvp.test.ts
```

Expected: FAIL because PvP still treats the command as fixed or does not handle
the new command.

- [ ] **Step 3: Extract the existing general reduction helper**

Move the current `pvpSideDamageTakenReductionPct` implementation unchanged to
`pvpDamageReduction.ts`. Import it for local use in `engine-pvp.ts` and re-export
it so `engine.pvpPhase.ts` remains source-compatible. Import the same helper in
the Tier 6 PvP adapter, avoiding a runtime adapter↔engine cycle.

- [ ] **Step 4: Implement PvP magic resolution**

Pass the battle state into the adapter's `applyCommand`. For `damage_magic`:

1. call `resolveMagicBarrierDamage` with the raw command amount;
2. in `mitigateBody`, apply effective target magic defense and
   `pvpSideDamageTakenReductionPct`;
3. apply triple-ward stability, then pass the body result through
   `resolveTripleWardDamage(..., "magic", "pvp")`;
4. apply `state.damageMultiplier` with `tier6DamageAfterMultiplier` after the
   ward result;
5. update magic-barrier durability and triple-ward state;
6. subtract the ordinary combat shield before HP;
7. run `resolvePvPHostileDamageSurvival`; and
8. return the HP-bound mitigated damage for the deferred signature link.

Use `${amount} 마법 피해` for the command log and preserve fixed-damage copy.

- [ ] **Step 5: Run GREEN and commit**

```bash
npx vitest run src/adventure/v2/combat/tier6UniquePvp.test.ts src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/tier6UniqueMagicDamage.test.ts src/adventure/battle/engine-pvp.test.ts
git add src/adventure/v2/combat/pvpDamageReduction.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/tier6UniquePvpAdapter.ts src/adventure/v2/combat/tier6UniquePvp.test.ts
git commit -m "fix: mitigate overload lightning in pvp"
```

Expected: all focused PvP and Tier 6 tests pass.

---

### Task 4: Clarify the mechanic copy and verify the repository

**Files:**
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`

**Interfaces:**
- Produces: exact mechanic copy `MP 100 소모마다 마법공격력 140%의 마법 피해를 주는 과부하 낙뢰`.

- [ ] **Step 1: Write the failing copy test**

Add an assertion that the public `arcane_overload` signature label equals the
exact approved copy above.

- [ ] **Step 2: Run RED**

```bash
npx vitest run src/adventure/data/v2/v2Equipment.test.ts
```

Expected: FAIL with the previous label.

- [ ] **Step 3: Update the label and run GREEN**

```bash
npx vitest run src/adventure/data/v2/v2Equipment.test.ts
git add src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2Equipment.test.ts
git commit -m "copy: identify overload lightning as magic damage"
```

Expected: PASS.

- [ ] **Step 4: Run complete verification**

```bash
npx vitest run src/adventure/v2/combat/tier6UniqueEffects.test.ts src/adventure/v2/combat/tier6UniqueMagicDamage.test.ts src/adventure/v2/combat/tier6UniqueSafety.test.ts src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/tier6UniquePvp.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/data/v2/v2Equipment.test.ts
npx eslint src/adventure/v2/combat/tier6UniqueEffects.ts src/adventure/v2/combat/tier6UniqueMagicDamage.ts src/adventure/v2/combat/tier6UniquePveAdapter.ts src/adventure/v2/combat/tier6UniquePvpAdapter.ts src/adventure/v2/combat/pvpDamageReduction.ts src/adventure/v2/combat/engine-pvp.ts
node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit
npm test
git diff --check
```

Expected: all focused and full checks pass. Confirm the branch is clean and no
deployment or maintenance command ran.
