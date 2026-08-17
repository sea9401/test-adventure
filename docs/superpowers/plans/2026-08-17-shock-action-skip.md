# Shock Action Skip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 감전을 속도 감소에서 낮은 확률의 다음 행동 1회 취소로 변경하고, 취소 후 대상의 정상 행동을 한 번 보장한다.

**Architecture:** 대상 로컬의 선택적 상태 `pending | immune | undefined`를 공통 순수 함수로 전이시킨다. 적중한 공격은 대상이 `undefined`일 때만 `pending`을 부여하고, 대상의 다음 행동 진입이 `pending`을 소비해 행동을 취소하며 `immune`으로 바꾼다. 그 다음 행동은 `immune`을 해제하고 정상 실행한다.

**Tech Stack:** TypeScript, Vitest, 기존 PvE/PvP ATB 전투 엔진

## Global Constraints

- PvE·PvP에 같은 감전 상태 전이를 적용한다.
- 뇌운 송곳니 5%, 뇌침 전도장갑 10%, 뇌정술식 4세트 10%, 뇌정 대궁 15%로 변경한다.
- 다단 스킬은 시전당 한 번만 감전을 판정한다.
- 감전 취소 후 대상의 정상 행동을 최소 한 번 보장한다.
- 한기는 기존 속도 감소를 유지하고 감전과 동시 적용될 수 있다.
- `engine.pvpPhase.ts`의 기존 반사 관련 미커밋 훅은 보존하고, 감전 변경분만 선택적으로 커밋한다. 길드 교역소 변경은 수정·커밋하지 않는다.
- 배포하지 않는다.

---

### Task 1: 공통 감전 상태와 장비 계약

**Files:**
- Create: `src/adventure/v2/combat/shockAction.ts`
- Create: `src/adventure/v2/combat/shockAction.test.ts`
- Modify: `src/adventure/data/v2/v2EquipmentTypes.ts`
- Modify: `src/adventure/data/v2/v2Equipment.ts`
- Modify: `src/adventure/data/v2/v2EquipmentCatalog.ts`
- Modify: `src/adventure/data/v2/v2Equipment.test.ts`
- Modify: `src/adventure/v2/combat/signatureEffects.ts`
- Modify: `src/adventure/v2/combat/signatureEffects.test.ts`
- Modify: `src/lib/server/derivePlayerCombatV2.test.ts`

**Interfaces:**
- Produces: `type ShockActionState = "pending" | "immune" | undefined`
- Produces: `enterShockAction(state): { skip: boolean; next: ShockActionState }`
- Produces: `canApplyShock(state): boolean`
- Produces: `rollOnHitShock(...): { label: string } | null`

- [ ] **Step 1: Write failing pure-state tests**

```ts
expect(enterShockAction(undefined)).toEqual({ skip: false, next: undefined });
expect(enterShockAction("pending")).toEqual({ skip: true, next: "immune" });
expect(enterShockAction("immune")).toEqual({ skip: false, next: undefined });
expect(canApplyShock(undefined)).toBe(true);
expect(canApplyShock("pending")).toBe(false);
expect(canApplyShock("immune")).toBe(false);
```

- [ ] **Step 2: Write failing equipment and trigger tests**

Assert literal catalog chances `5/10/10/15`, the description `다음 행동 1회 취소`, no `shockSlowPct`, and a successful roll result `{ label: "뇌운" }`. Add a same-hit test proving `critChill` and `hitShock` can both be non-null.

- [ ] **Step 3: Run RED tests**

```bash
npm test -- src/adventure/v2/combat/shockAction.test.ts src/adventure/v2/combat/signatureEffects.test.ts src/adventure/data/v2/v2Equipment.test.ts src/lib/server/derivePlayerCombatV2.test.ts
```

Expected: FAIL because the state helper and action-cancel contract do not exist and catalog chances still use `15/20/20/55`.

- [ ] **Step 4: Implement minimal pure state and equipment contract**

```ts
export type ShockActionState = "pending" | "immune" | undefined;

export function canApplyShock(state: ShockActionState): boolean {
  return state == null;
}

export function enterShockAction(state: ShockActionState) {
  if (state === "pending") return { skip: true, next: "immune" as const };
  if (state === "immune") return { skip: false, next: undefined };
  return { skip: false, next: undefined };
}
```

Change shock signatures to use only `shockChancePct`; remove speed multiplier construction and the `critChill` suppression. Keep the existing actual-damage and once-per-cast gates.

- [ ] **Step 5: Run GREEN tests and commit Task 1 only**

Run the Step 3 command, expect PASS, then commit only Task 1 files with `feat: redefine shock as action control`.

---

### Task 2: PvE 감전 행동 취소

**Files:**
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/signatureEffects.test.ts`
- Modify: `src/adventure/v2/combat/atbSkillCast.test.ts`

**Interfaces:**
- Consumes: `ShockActionState`, `canApplyShock`, `enterShockAction`
- Produces: `BattleStacks.enemyShockAction?: "pending" | "immune"`
- Produces: `[감전] <적>이(가) 움직이지 못했다.`

- [ ] **Step 1: Write failing PvE application tests**

Use a 100% test signature and literal assertions to prove a damaging basic attack and a damaging multi-hit skill set `enemyShockAction` to `pending`, while a miss or zero-damage action does not.

- [ ] **Step 2: Write a failing PvE action-sequence test**

Run an ATB fight with deterministic RNG and assert the ordered enemy bundles contain one shock cancellation, then one normal enemy attack before another cancellation. Assert the canceled bundle contains neither an enemy skill cast nor a basic attack.

- [ ] **Step 3: Run RED tests**

```bash
npm test -- src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/atbSkillCast.test.ts
```

Expected: FAIL because shock still writes a speed debuff and enemy actions never consult `enemyShockAction`.

- [ ] **Step 4: Implement PvE application and action entry**

Store `pending` on the enemy after a successful roll. At enemy bundle entry, process DoT and timed clocks first, call `enterShockAction`, then append the cancellation log and finish the bundle on `skip`; the `immune` transition continues through the existing skill/basic path.

- [ ] **Step 5: Run GREEN tests and commit Task 2 only**

Run the Step 3 command, expect PASS, then commit only Task 2 files with `feat: skip shocked enemy actions`.

---

### Task 3: PvP 대칭 감전 행동 취소

**Files:**
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/v2/combat/engine.pvpPhase.ts`
- Modify: `src/adventure/v2/combat/engine.pvp-atb.ts`
- Modify: `src/adventure/battle/engine-pvp.test.ts`
- Modify: `src/adventure/v2/combat/atbSkillCastPvp.test.ts`

**Interfaces:**
- Consumes: `ShockActionState`, `canApplyShock`, `enterShockAction`
- Produces: `PvPSideStacks.shockAction?: "pending" | "immune"`
- Produces: side-tagged PvP cancellation log

- [ ] **Step 1: Write failing symmetric application tests**

For both P1→P2 and P2→P1, assert successful basic and skill shocks store `pending` on the target side rather than the attacker's outward buff object.

- [ ] **Step 2: Write a failing PvP action-sequence test**

Use 100% test shock and deterministic initiative. Assert the shocked side skips exactly one bundle, enters `immune`, performs one normal bundle, and returns to ready before it may be shocked again.

- [ ] **Step 3: Run RED tests**

```bash
npm test -- src/adventure/battle/engine-pvp.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts
```

Expected: FAIL because PvP writes `enemySpdMult` and has no target-local action-control state.

- [ ] **Step 4: Implement PvP target-local application and action entry**

Apply `pending` to `state[targetKey].stacks.shockAction`. At each side's ATB bundle, process target-local DoT and clocks, transition shock state, and on `skip` bypass potion selection, skill casting, basic attacks, and extra attacks while advancing the timeline normally.

- [ ] **Step 5: Preserve direct engine behavior**

Guard direct `advanceTurnPvP` phase entry with the same helper so non-ATB callers cannot bypass shock. Do not duplicate probability logic.

- [ ] **Step 6: Run GREEN tests and commit Task 3 only**

Run the Step 3 command, expect PASS, then commit only Task 3 files with `feat: skip shocked pvp actions`.

---

### Task 4: 통합 회귀 검증

**Files:**
- Test all files modified in Tasks 1–3

- [ ] **Step 1: Run focused shock tests**

```bash
npm test -- src/adventure/v2/combat/shockAction.test.ts src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/battle/engine.skillCrit.test.ts src/adventure/battle/engine-pvp.test.ts src/adventure/data/v2/v2Equipment.test.ts src/lib/server/derivePlayerCombatV2.test.ts
```

- [ ] **Step 2: Run combat suites**

```bash
npm test -- src/adventure/v2/combat src/adventure/battle
```

- [ ] **Step 3: Run static verification**

```bash
npx eslint src/adventure/data/v2/v2EquipmentTypes.ts src/adventure/data/v2/v2Equipment.ts src/adventure/data/v2/v2EquipmentCatalog.ts src/adventure/data/v2/v2Equipment.test.ts src/adventure/v2/combat/shockAction.ts src/adventure/v2/combat/shockAction.test.ts src/adventure/v2/combat/signatureEffects.ts src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/v2/combat/engine.pvpPhase.ts src/adventure/v2/combat/engine.pvp-atb.ts src/adventure/v2/combat/atbSkillCast.test.ts src/adventure/v2/combat/atbSkillCastPvp.test.ts src/adventure/battle/engine.skillCrit.test.ts src/adventure/battle/engine-pvp.test.ts src/lib/server/derivePlayerCombatV2.test.ts
npx tsc --noEmit
git diff --check
```

- [ ] **Step 4: Review scope and repository state**

Confirm the final diff contains only shock behavior, tests, and approved documents. Confirm existing `engine.pvpPhase.ts` and guild trade-post changes remain uncommitted and unchanged.

- [ ] **Step 5: Commit final test-only adjustments if any**

Commit only the explicit final test files with `test: cover shock action lockout`.
