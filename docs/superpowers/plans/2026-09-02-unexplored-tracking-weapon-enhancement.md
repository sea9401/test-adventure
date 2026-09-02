# Unexplored Tracking Weapon Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the unexplored Tracking Weapon act every 45 ticks and make Tracking Elimination ignore 50% of physical defense plus the pooled general shield while preserving mana shield and the rest of the standard defensive pipeline.

**Architecture:** Keep the existing forced physical-hit path and add narrowly scoped, default-off damage-policy options to it. The enemy phase remains the single source of truth for evasion, mana shield, mitigation, survival, reflection, and logging; Tracking Elimination only opts into percentage defense penetration and general-shield bypass.

**Tech Stack:** TypeScript, Vitest, existing V2 ATB combat engine and unexplored boss catalog.

## Global Constraints

- Tracking Weapon raw speed is exactly `52`, displayed monster speed is `322`, and its normal action interval is exactly `45` ticks.
- Tracking Elimination remains two physical hits at `2×` current boss attack and still does not crit, apply status, or consume the boss's scheduled action.
- Each Tracking Elimination hit ignores exactly 50% of effective player physical defense.
- Each Tracking Elimination hit bypasses `BattleStacks.playerShield` without consuming it or firing shield-break effects.
- `playerMagicBarrier`, evasion and guaranteed avoidance, triple ward, guard, damage reduction, survival, and reflection retain their current behavior.
- Tracking gain, threshold, one-trigger-per-player-action rule, overflow carry capped at 99, and kill-before-counter behavior do not change.
- New forced-hit options default to existing behavior so no non-opted-in attack changes.
- Do not change summon costs, rewards, other bosses, or deployment configuration. Do not deploy as part of this plan.

---

### Task 1: Lock the 45-tick catalog stats and player-facing traits

**Files:**
- Modify: `src/adventure/data/v2/unexploredBosses.test.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`
- Modify: `src/adventure/data/v2/unexploredBosses.ts`

**Interfaces:**
- Consumes: `monsterActionSpd(monster, depthCorrection?)` and `actionInterval(spd)` from `src/adventure/v2/combat/combatTimeline.ts`.
- Produces: `UNEXPLORED_BOSSES.tracking_weapon.monster.spd === 52` and traits that disclose the 45-tick tempo plus enhanced Tracking Elimination.

- [ ] **Step 1: Write the failing catalog tests**

Add the timeline imports and a focused test to `unexploredBosses.test.ts`:

```ts
import {
  actionInterval,
  monsterActionSpd,
} from "@/adventure/v2/combat/combatTimeline";

it("추적 병기는 표시 속도 322로 45틱마다 행동한다", () => {
  const monster = UNEXPLORED_BOSSES.tracking_weapon.monster;
  const actionSpd = monsterActionSpd(monster);

  expect(monster.spd).toBe(52);
  expect(actionSpd).toBe(322);
  expect(actionInterval(actionSpd)).toBe(45);
});
```

Update the Tracking Weapon expectation in `coopBosses.test.ts` so the contract is explicit:

```ts
expect(tracking.base).toMatchObject({
  atk: 16,
  spd: 52,
  evasionPct: 12,
  skill: { kind: "pierce", armorPierce: 10 },
});
expect(tracking.traits).toEqual([
  "45틱마다 빠른 행동",
  "피해·타격 추적",
  "추적 완료 시 방어 50% 관통·일반 보호막 무시 2연타",
]);
```

- [ ] **Step 2: Run the tests and verify the old data fails**

Run:

```bash
npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts
```

Expected: FAIL because the current raw speed is `27`, the interval is `61`, and the old traits only say `빠른 행동` / `추적 완료 시 2연타 반격`.

- [ ] **Step 3: Apply the minimal catalog change**

Change only the Tracking Weapon fields in `unexploredBosses.ts`:

```ts
spd: 52,
```

```ts
traits: [
  "45틱마다 빠른 행동",
  "피해·타격 추적",
  "추적 완료 시 방어 50% 관통·일반 보호막 무시 2연타",
],
```

- [ ] **Step 4: Run the focused data tests**

Run:

```bash
npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the catalog change**

```bash
git add src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts
git commit -m "balance: speed up tracking weapon"
```

---

### Task 2: Add default-off forced physical-hit defense and shield policies

**Files:**
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Create: `src/adventure/v2/combat/forcedEnemyPhysicalHit.test.ts`

**Interfaces:**
- Produces: `EnemyPhaseDamagePolicy` with `bypassPlayerShield?: boolean`.
- Produces: optional `physicalDefensePiercePct?: number` and `bypassPlayerShield?: boolean` fields on `ForcedEnemyPhysicalHitOptions`.
- Preserves: calls that omit the new fields continue to use full physical defense and normal shield absorption.

- [ ] **Step 1: Write failing helper tests for default behavior, penetration, shield bypass, and mana shield preservation**

Create `forcedEnemyPhysicalHit.test.ts` with deterministic fixtures built from `initialBattleState` and `resolveForcedEnemyPhysicalHit`. Use `vi.spyOn(Math, "random").mockReturnValue(0.5)` and restore mocks after every test.

Use these complete fixtures and helper:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import { damageToDefender } from "./combatShared";
import {
  resolveForcedEnemyPhysicalHit,
} from "./engine.enemyPhase";
import {
  initialBattleState,
  type PlayerCombat,
} from "./engine";

const PLAYER: PlayerCombat = {
  hp: 10_000,
  maxHp: 10_000,
  atk: 10,
  def: 0,
  spd: 30,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
};

const ENEMY: Monster = {
  name: "강제 공격 시험체",
  tags: [],
  hp: 10_000,
  atk: 200,
  def: 0,
  spd: 1,
  accuracy: 0,
  evasionPct: 0,
  exp: 0,
};

afterEach(() => vi.restoreAllMocks());

function runForcedHit(overrides: Partial<PlayerCombat> = {}) {
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const defender = { ...PLAYER, ...overrides };
  const state = initialBattleState(defender, ENEMY, "수호자");
  return resolveForcedEnemyPhysicalHit(state, defender, "수호자", {
    attackName: "보호막 관통타",
    multiplier: 2,
    armorPierce: 0,
    physicalDefensePiercePct: 50,
    bypassPlayerShield: true,
    allowCritical: false,
    applyStatus: false,
    consumeEnemyAction: false,
  });
}
```

The default compatibility test must make the old behavior observable:

```ts
it("새 옵션을 생략하면 일반 보호막이 기존처럼 강제 물리 공격을 흡수한다", () => {
  const defender = { ...PLAYER, def: 200, bulwarkShield: 2_000 };
  const state = initialBattleState(defender, ENEMY, "수호자");
  const result = resolveForcedEnemyPhysicalHit(state, defender, "수호자", {
    attackName: "기본 강제타",
    multiplier: 2,
    armorPierce: 0,
    allowCritical: false,
    applyStatus: false,
    consumeEnemyAction: false,
  });

  expect(result.state.playerHp).toBe(defender.maxHp);
  expect(result.state.stacks.playerShield).toBeLessThan(2_000);
});
```

The opted-in test must assert both exact 50% defense treatment and untouched general shield:

```ts
it("강제 물리 공격은 요청한 경우 방어 50%를 무시하고 일반 보호막을 우회한다", () => {
  const defender = { ...PLAYER, def: 200, bulwarkShield: 2_000 };
  const state = initialBattleState(defender, ENEMY, "수호자");
  const result = resolveForcedEnemyPhysicalHit(state, defender, "수호자", {
    attackName: "보호막 관통타",
    multiplier: 2,
    armorPierce: 0,
    physicalDefensePiercePct: 50,
    bypassPlayerShield: true,
    allowCritical: false,
    applyStatus: false,
    consumeEnemyAction: false,
  });

  const expectedDamage = damageToDefender(ENEMY.atk * 2, 100);
  expect(result.damageToHp).toBe(expectedDamage);
  expect(result.state.playerHp).toBe(defender.maxHp - expectedDamage);
  expect(result.state.stacks.playerShield).toBe(2_000);
});
```

The mana-shield test must compare the same shield-bypassing hit with and without a mana barrier:

```ts
it("일반 보호막 우회 중에도 마나 실드는 피해를 흡수한다", () => {
  const plain = runForcedHit({ bulwarkShield: 2_000 });
  const barrier = runForcedHit({
    bulwarkShield: 2_000,
    magicBarrierMax: 1_000,
    magicBarrierAbsorbPct: 50,
    magicBarrierEfficiencyPct: 0,
  });

  expect(barrier.damageToHp).toBeLessThan(plain.damageToHp);
  expect(barrier.state.playerMagicBarrier).toBeLessThan(1_000);
  expect(barrier.state.stacks.playerShield).toBe(2_000);
});
```

- [ ] **Step 2: Run the new test and verify the API does not exist yet**

Run:

```bash
npm test -- src/adventure/v2/combat/forcedEnemyPhysicalHit.test.ts
```

Expected: FAIL at TypeScript transform/type checking or behavior assertions because the new options and shield policy are not implemented.

- [ ] **Step 3: Add the minimal default-off damage policy to the enemy phase**

Add this type immediately above `resolveEnemyPhase`:

```ts
export type EnemyPhaseDamagePolicy = {
  bypassPlayerShield?: boolean;
};
```

Extend the final argument of `resolveEnemyPhase` without changing existing positional arguments:

```ts
export function resolveEnemyPhase(
  state: BattleState,
  basePlayer: PlayerCombat,
  playerName: string,
  enteringEnemyPhase: boolean,
  skipBasicAttack: boolean = false,
  forceBasicAttack: boolean = false,
  damagePolicy: EnemyPhaseDamagePolicy = {},
): BattleState {
```

Gate only the pooled general-shield absorption:

```ts
const shieldAbsorbed = damagePolicy.bypassPlayerShield
  ? 0
  : Math.min(state.stacks.playerShield, magicBarrier.hpBoundDamage);
```

Because `shieldAbsorbed` is zero when bypassing, the existing code naturally keeps `playerShield` unchanged and does not trigger shield-break handling.

- [ ] **Step 4: Extend the forced physical-hit options and forward the policy**

Add the optional fields:

```ts
export type ForcedEnemyPhysicalHitOptions = {
  attackName: string;
  multiplier: number;
  armorPierce: number;
  physicalDefensePiercePct?: number;
  bypassPlayerShield?: boolean;
  allowCritical: boolean;
  applyStatus: boolean;
  consumeEnemyAction: boolean;
};
```

Normalize the percentage to `0..100` and set the forced enemy's defense vulnerability:

```ts
const physicalDefensePiercePct = Number.isFinite(
  options.physicalDefensePiercePct,
)
  ? Math.max(0, Math.min(100, options.physicalDefensePiercePct ?? 0))
  : 0;

const forcedEnemy: Monster = {
  ...originalEnemy,
  atk: Math.max(0, Math.floor(originalEnemy.atk * multiplier)),
  atkType: "physical",
  playerDefVulnerable: physicalDefensePiercePct / 100,
  critPct: options.allowCritical ? originalEnemy.critPct : 0,
  bonusAttackChancePct: 0,
  ...(options.applyStatus ? {} : { skill: undefined }),
};
```

Keep the existing flat `armorPierce` handling, then pass the new policy only for this forced hit:

```ts
const resolved = resolveEnemyPhase(
  prepared,
  player,
  playerName,
  false,
  false,
  !options.applyStatus,
  { bypassPlayerShield: options.bypassPlayerShield === true },
);
```

- [ ] **Step 5: Run helper and defensive regression tests**

Run:

```bash
npm test -- src/adventure/v2/combat/forcedEnemyPhysicalHit.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/tier6UniquePve.test.ts
```

Expected: PASS. The default test proves omitted options retain old behavior; the opted-in tests prove exact penetration, untouched general shield, and retained mana shield.

- [ ] **Step 6: Commit the reusable engine policy**

```bash
git add src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/forcedEnemyPhysicalHit.test.ts
git commit -m "feat: support shield-bypassing forced physical hits"
```

---

### Task 3: Wire the enhanced policy into Tracking Elimination and verify the feature

**Files:**
- Modify: `src/adventure/v2/combat/trackingWeaponMechanic.ts`
- Modify: `src/adventure/v2/combat/trackingWeaponMechanic.test.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/trackingWeaponAtb.test.ts`

**Interfaces:**
- Consumes: `physicalDefensePiercePct` and `bypassPlayerShield` added in Task 2.
- Produces: `TRACKING_ELIMINATION_PHYSICAL_DEFENSE_PIERCE_PCT === 50`.
- Preserves: `TRACKING_ELIMINATION_HIT_MULTIPLIER === 2`, two-hit loop, trigger timing, overflow, counter cancellation, and all unrelated boss mechanics.

- [ ] **Step 1: Write the failing Tracking Elimination contract tests**

In `trackingWeaponMechanic.test.ts`, import and pin the new tuning constant:

```ts
expect(TRACKING_ELIMINATION_PHYSICAL_DEFENSE_PIERCE_PCT).toBe(50);
```

Replace the old `일반 보호막이 추적 섬멸을 기존 물리 공격처럼 흡수한다` test in `trackingWeaponAtb.test.ts` with:

```ts
it("추적 섬멸은 일반 보호막을 소모하지 않고 HP에 직접 피해를 준다", () => {
  const result = runTrackingBattle({
    initialThreat: 100,
    player: { ...basePlayer, hp: 10_000, maxHp: 10_000, bulwarkShield: 20_000 },
  });

  expect(result.finalState.playerHp).toBeLessThan(10_000);
  expect(result.finalState.stacks.playerShield).toBe(20_000);
  expect(trackingState(result).trackingCounterDamage).toBeGreaterThan(0);
});
```

Add an exact integration assertion for defense penetration:

```ts
it("추적 섬멸은 플레이어 물리 방어력의 50%만 적용한다", () => {
  const result = runTrackingBattle({
    initialThreat: 100,
    player: { ...basePlayer, hp: 10_000, maxHp: 10_000, def: 200 },
  });
  const perHit = damageToDefender(
    trackingWeapon.atk * TRACKING_ELIMINATION_HIT_MULTIPLIER,
    100,
  );

  expect(10_000 - result.finalState.playerHp).toBe(perHit * 2);
});
```

Add this mana-shield integration assertion, comparing otherwise identical fixtures:

```ts
it("추적 섬멸은 일반 보호막을 무시하지만 마나 실드는 유지한다", () => {
  const plain = runTrackingBattle({
    initialThreat: 100,
    player: {
      ...basePlayer,
      hp: 10_000,
      maxHp: 10_000,
      bulwarkShield: 20_000,
    },
  });
  vi.restoreAllMocks();
  const barrier = runTrackingBattle({
    initialThreat: 100,
    player: {
      ...basePlayer,
      hp: 10_000,
      maxHp: 10_000,
      bulwarkShield: 20_000,
      magicBarrierMax: 2_000,
      magicBarrierAbsorbPct: 50,
      magicBarrierEfficiencyPct: 0,
    },
  });

  expect(barrier.finalState.playerHp).toBeGreaterThan(
    plain.finalState.playerHp,
  );
  expect(barrier.finalState.playerMagicBarrier).toBeLessThan(2_000);
  expect(barrier.finalState.stacks.playerShield).toBe(20_000);
});
```

Assert the activation log contains the exact Korean mechanic notice:

```ts
expect(
  result.finalState.log.some((entry) =>
    entry.text.includes("방어력 50% 관통 · 일반 보호막 무시"),
  ),
).toBe(true);
```

- [ ] **Step 2: Run the focused tracking tests and verify they fail**

Run:

```bash
npm test -- src/adventure/v2/combat/trackingWeaponMechanic.test.ts src/adventure/v2/combat/trackingWeaponAtb.test.ts
```

Expected: FAIL because the constant is absent and Tracking Elimination has not opted into Task 2's policies.

- [ ] **Step 3: Add the Tracking Elimination penetration constant**

In `trackingWeaponMechanic.ts`:

```ts
export const TRACKING_ELIMINATION_PHYSICAL_DEFENSE_PIERCE_PCT = 50;
```

Keep `TRACKING_ELIMINATION_HIT_MULTIPLIER = 2` unchanged.

- [ ] **Step 4: Opt Tracking Elimination into the new policies and update its log**

Import the new constant in `engine.atb.ts`, update the activation log, and pass the options on each of the two hits:

```ts
state = appendTrackingLog(
  state,
  "추적 완료 — 추적 섬멸 발동 (방어력 50% 관통 · 일반 보호막 무시)",
  args.tick,
);
```

```ts
const resolved = resolveForcedEnemyPhysicalHit(
  state,
  args.player,
  args.playerName,
  {
    attackName: "추적 섬멸",
    multiplier: TRACKING_ELIMINATION_HIT_MULTIPLIER,
    armorPierce: 0,
    physicalDefensePiercePct:
      TRACKING_ELIMINATION_PHYSICAL_DEFENSE_PIERCE_PCT,
    bypassPlayerShield: true,
    allowCritical: false,
    applyStatus: false,
    consumeEnemyAction: false,
  },
);
```

- [ ] **Step 5: Run all focused feature and regression tests**

Run:

```bash
npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts src/adventure/v2/combat/forcedEnemyPhysicalHit.test.ts src/adventure/v2/combat/trackingWeaponMechanic.test.ts src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/unexploredBossOffenseBalance.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run static verification**

Run:

```bash
npx eslint src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/forcedEnemyPhysicalHit.test.ts src/adventure/v2/combat/trackingWeaponMechanic.ts src/adventure/v2/combat/trackingWeaponMechanic.test.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/trackingWeaponAtb.test.ts
npx tsc --noEmit
git diff --check
```

Expected: all commands exit with status 0.

- [ ] **Step 7: Commit the Tracking Elimination integration**

```bash
git add src/adventure/v2/combat/trackingWeaponMechanic.ts src/adventure/v2/combat/trackingWeaponMechanic.test.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/trackingWeaponAtb.test.ts
git commit -m "balance: strengthen tracking elimination"
```

- [ ] **Step 8: Run final branch verification**

Run:

```bash
npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts src/adventure/v2/combat/forcedEnemyPhysicalHit.test.ts src/adventure/v2/combat/trackingWeaponMechanic.test.ts src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/shieldReactionGate.test.ts src/adventure/v2/combat/tier6UniquePve.test.ts src/adventure/v2/combat/unexploredBossOffenseBalance.test.ts
npx tsc --noEmit
git status --short --branch
```

Expected: tests and typecheck pass; the worktree is clean and the branch contains the design commit plus the three implementation commits. No deployment is performed.
