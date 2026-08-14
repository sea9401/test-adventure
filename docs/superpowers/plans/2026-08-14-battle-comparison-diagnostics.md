# Battle Comparison Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원정·사냥터·보스·아레나 전투 기록이 같은 캐릭터/적 상세 스탯과 지속 피해 보정을 표시하게 한다.

**Architecture:** 전투 시점의 표시용 스탯을 `ReplayPayload`에 스냅샷으로 저장하고, `ReplayBattleScene`이 호출 화면별 별도 props보다 payload 스냅샷을 공통 기본값으로 사용한다. PvE/PvP 변환기는 같은 스냅샷 구조를 만들며, 공용 `CombatMatchupSummary`는 최대 HP 비례 성분 감산과 상태 피해 경감을 분리해 설명한다. 전투 공식과 밸런스 수치는 바꾸지 않는다.

**Tech Stack:** TypeScript, React Client Components, Next.js App Router Route Handlers, Vitest, server-side React markup tests

## Global Constraints

- 배포하지 않는다.
- 기존 저장 리플레이는 새 필드가 없어도 정상 표시되어야 한다.
- `V2DungeonFloorView.tsx`, 사냥 route, 전투 엔진의 현재 사용자 변경을 덮어쓰지 않는다.
- 카드/패널은 기존 `CombatMatchupSummary`의 `SURFACE_INSET` 불투명 표면을 유지한다.
- PvE 판정·수치 통일과 스탯 성장 곡선 변경은 별도 밸런스 작업으로 분리한다.

---

### Task 1: Replay combat snapshot contract

**Files:**
- Modify: `src/adventure/data/v2/replayPayload.test.ts`
- Modify: `src/adventure/data/v2/replayPayload.ts`

**Interfaces:**
- Consumes: `PlayerCombat`, `BattleState`, `PvPSide.player`
- Produces: `ReplayCombatStats`, `ReplayPayload.playerCombat`, `ReplayPayload.ruleset`, `ReplayPayload.maxHpDamageMult`, `toReplayPayload(..., { playerCombat })`

- [ ] **Step 1: Write the failing PvE snapshot test**

```ts
it("PvE 리플레이가 양쪽 마방·상태 피해 경감과 보스 지속 피해 보정을 보존한다", () => {
  const state = {
    ...fixture(1),
    isBoss: true,
    enemy: {
      name: "수호자",
      hp: 10_000,
      atk: 300,
      def: 200,
      magicDef: 180,
      spd: 40,
      statusDamageReductionPct: 25,
    },
  } as BattleState;
  const payload = toReplayPayload(state, {
    playerCombat: {
      hp: 1_000,
      maxHp: 1_000,
      atk: 400,
      magicAtk: 500,
      def: 220,
      magicDef: 160,
      spd: 50,
      evasionPct: 10,
      accRating: 20,
      attackCount: 1,
      passiveMagicBasicAttack: true,
      statusDamageReductionPct: 12,
    },
  });
  expect(payload).toMatchObject({
    ruleset: "pve",
    maxHpDamageMult: 0.8,
    playerCombat: { magicDef: 160, statusDamageReductionPct: 12, primaryAttack: "magic" },
    enemy: { magicDef: 180, statusDamageReductionPct: 25 },
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/adventure/data/v2/replayPayload.test.ts --run`

Expected: FAIL because `playerCombat`, `ruleset`, and modifier fields are missing.

- [ ] **Step 3: Add the minimal snapshot type and converters**

```ts
export type ReplayCombatStats = {
  atk: number;
  def: number;
  magicDef?: number;
  spd: number;
  accuracy?: number;
  evasionPct?: number;
  evaRating?: number;
  critChancePct?: number;
  magicAtk?: number;
  magicBarrierMax?: number;
  magicBarrierAbsorbPct?: number;
  magicBarrierEfficiencyPct?: number;
  bonusAttackChancePct?: number;
  statusDamageReductionPct?: number;
  primaryAttack?: "physical" | "magic";
};
```

Map PvE `PlayerCombat` and PvP `PvPSide.player` into this type. Copy enemy `magicDef` and `statusDamageReductionPct`. Derive `maxHpDamageMult` as the state override, otherwise `0.8` for bosses and `1` for ordinary PvE/PvP.

- [ ] **Step 4: Add and pass the PvP perspective test**

Assert that p1 and p2 perspectives swap both `playerCombat` and enemy combat stats, and that the payload uses `ruleset: "pvp"`.

- [ ] **Step 5: Run replay payload tests and verify GREEN**

Run: `npm test -- src/adventure/data/v2/replayPayload.test.ts --run`

Expected: PASS.

### Task 2: Common replay consumption and status-damage explanation

**Files:**
- Modify: `src/adventure/v2/ReplayBattleScene.test.tsx`
- Modify: `src/adventure/v2/ReplayBattleScene.tsx`
- Modify: `src/adventure/battle/CombatMatchupSummary.test.tsx`
- Modify: `src/adventure/battle/CombatMatchupSummary.tsx`
- Modify: `src/adventure/battle/BattleScene.tsx`

**Interfaces:**
- Consumes: `ReplayPayload.playerCombat`, `ReplayPayload.ruleset`, `ReplayPayload.maxHpDamageMult`
- Produces: identical stat strip/matchup summary behavior for every replay surface

- [ ] **Step 1: Write failing rendering tests**

Add a replay test whose only combat stats are inside the payload and assert that `마방`, `상태피해감소`, and the matchup heading render. Add a summary test that passes `statusDamageReductionPct: 25` and `maxHpDamageMult: 0.8`, then assert `최대 HP 비례 성분 80%` and `상태 피해 25% 경감`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/adventure/v2/ReplayBattleScene.test.tsx src/adventure/battle/CombatMatchupSummary.test.tsx --run`

Expected: FAIL because payload snapshots and status-damage modifiers are not consumed.

- [ ] **Step 3: Wire the common props through the existing components**

Use `playerCombat ?? payload.playerCombat` in `ReplayBattleScene`. Pass `ruleset` and `maxHpDamageMult` to `BattleScene`, then pass enemy state-damage resistance and the maximum-HP component multiplier to `CombatMatchupSummary`. Keep absent fields backward-compatible with PvE and multiplier `1` defaults.

- [ ] **Step 4: Render the modifier explanation**

Always show one compact `지속 피해 보정` row when both combat sides are available. Describe the two stages separately; do not multiply them into one misleading total because the boss coefficient applies only to the maximum-HP component.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `npm test -- src/adventure/v2/ReplayBattleScene.test.tsx src/adventure/battle/CombatMatchupSummary.test.tsx --run`

Expected: PASS.

### Task 3: Snapshot the two PvE surfaces that currently omit player stats

**Files:**
- Modify: `src/app/api/v2/storm-expedition/route.ts`
- Modify: `src/app/api/v2/coop/attack/route.ts`
- Test: `src/lib/server/stormExpeditionRoute.test.ts`
- Test: existing coop attack route tests selected by `rg`

**Interfaces:**
- Consumes: `toReplayPayload(finalState, { playerCombat })`
- Produces: new 원정 and 협동 보스 replays with complete player stat snapshots

- [ ] **Step 1: Add route-boundary expectations**

Update route fixtures so the real replay converter receives the exact `playerForBattle` used by the simulation. Assert that expedition boons are reflected in the snapshot and that coop passes the full-health derived combatant.

- [ ] **Step 2: Run route tests and verify RED**

Run the two focused route test files. Expected: FAIL because the option is not passed.

- [ ] **Step 3: Pass `playerForBattle` to the replay converter**

```ts
toReplayPayload(battle.finalState, { playerCombat: playerForBattle })
```

Apply the same shape in coop, preserving the existing killing-blow log wrapper.

- [ ] **Step 4: Run route tests and verify GREEN**

Run the focused route tests. Expected: PASS.

### Task 4: Verification and handoff

**Files:**
- Verify only

**Interfaces:**
- Consumes: all previous tasks
- Produces: type-safe, regression-tested local change

- [ ] **Step 1: Run the focused suite**

Run: `npm test -- src/adventure/data/v2/replayPayload.test.ts src/adventure/v2/ReplayBattleScene.test.tsx src/adventure/battle/CombatMatchupSummary.test.tsx --run`

- [ ] **Step 2: Run TypeScript and lint on changed files**

Run: `npx tsc --noEmit` and the repository lint command for changed files.

- [ ] **Step 3: Inspect the final diff for unrelated user changes**

Use `git diff -- <owned files>` and `git status --short`; do not stage `NUL`, `_workspace/`, or pre-existing changes.

- [ ] **Step 4: Commit only owned files**

```bash
git add docs/superpowers/plans/2026-08-14-battle-comparison-diagnostics.md src/adventure/data/v2/replayPayload.ts src/adventure/data/v2/replayPayload.test.ts src/adventure/v2/ReplayBattleScene.tsx src/adventure/v2/ReplayBattleScene.test.tsx src/adventure/battle/BattleScene.tsx src/adventure/battle/CombatMatchupSummary.tsx src/adventure/battle/CombatMatchupSummary.test.tsx src/app/api/v2/storm-expedition/route.ts src/app/api/v2/coop/attack/route.ts
git commit -m "feat: unify battle stat diagnostics"
```
