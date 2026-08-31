# Unexplored Toxic Blood Lord Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미개척지 개인 보스 `독혈군주`에 피격으로 누적되는 독혈, 행동 시작 지속 피해, 회복 억제와 10중첩 폭발 순환을 추가한다.

**Architecture:** 순수 독혈 산식은 전용 모듈에 격리하고, ATB 엔진의 선택적 보스 메커니즘 상태가 공격 행동 경계와 플레이어 행동 경계를 연결한다. 전투 중 회복 배율은 기존 `receivedHealMult`에 독혈 배율을 합성한 플레이어 뷰를 각 PvE 행동 경로에 전달한다. 공격 API는 독혈군주일 때만 메커니즘을 활성화하고, 세션 JSON에는 저장하지 않은 채 결과·리플레이에 전투 요약만 반환한다.

**Tech Stack:** TypeScript 5, Next.js 16 App Router Route Handlers, React 19, Vitest 4, 기존 ATB 전투 엔진

## Global Constraints

- 전투는 기존 자동 ATB 방식이며 플레이어 수동 회피·해제 입력을 추가하지 않는다.
- 일반 직접 공격 행동으로 실제 HP 피해를 받고 살아남으면 독혈 `+1`, `독혈 파열`이면 `+2`다.
- 다단 공격은 행동당 한 번만 부여하고 빗나감·피해 완전 무효·일반 보호막 전량 흡수·사망에는 부여하지 않는다.
- 독혈은 공격 시도 안에서 자연 해제되지 않으며 10중첩에서 한 번 폭발하고 초과분 없이 0으로 초기화한다.
- 행동 시작 지속 피해는 `max(1, floor(maxHp × stacks × 0.003))`, 중첩형 회복 감소는 중첩당 3%다.
- 폭발 피해는 `floor(maxHp × 0.20)`이며 방어력·일반/활성 피해 감소·일반 보호막을 무시한다. 상태 피해 감소·마법 장벽·사망 방지는 적용한다.
- 폭발 생존 후 다음 2회 플레이어 행동 동안 받는 회복량을 50% 줄인다. 중첩형 감소와 겹치면 더 강한 한 효과만 적용한다.
- 회복 억제는 회복 스킬·물약·재생·흡혈·피격 및 회피 회복에 적용하고 직접 보호막·사망 방지는 줄이지 않는다.
- 독혈 상태는 세션 `mechanic_state`에 저장하지 않고 매 공격 시도 0에서 시작한다.
- 독혈군주가 아닌 PvE, PvP, 추적 병기와 빙하 거수의 결과를 변경하지 않는다.
- 보스 카드 특성은 `피격 시 독혈 누적`, `10중첩 독혈 폭발`, `중독·폭발 후 회복 억제`다.
- 새 UI 표면은 만들지 않고 기존 리플레이 자원 영역을 사용한다.
- 운영 데이터 쓰기, 배포, 푸시와 PR 생성은 하지 않는다.

---

## File Structure

- Create `src/adventure/v2/combat/toxicBloodLordMechanic.ts`: 상수, 중첩·폭발 전이, 지속 피해와 회복 배율 순수 함수.
- Create `src/adventure/v2/combat/toxicBloodLordMechanic.test.ts`: 경계값·정규화·회복 억제 순수 회귀.
- Create `src/adventure/v2/combat/toxicBloodLordAtb.test.ts`: ATB 부여·폭발·피해 방어·회복·격리 회귀.
- Modify `src/adventure/v2/combat/engineState.ts`: 독혈 보스 컨텍스트·전투 상태 union과 정형 적 공격 메타데이터.
- Modify `src/adventure/v2/combat/engine.enemyPhase.ts`: 일반 적 공격의 실제 HP 피해·강타 메타데이터 및 피격/회피 회복 배율 적용.
- Modify `src/adventure/v2/combat/engine.ts`: v2 적 공격의 실제 HP 피해 메타데이터.
- Modify `src/adventure/v2/combat/engine.atb.ts`: 독혈 상태 초기화, 공격 행동 정산, 상태 피해, 행동 시작/종료 처리, 회복 플레이어 뷰와 리플레이 자원.
- Modify `src/adventure/data/v2/unexploredBosses.ts`: 독혈군주 특성 문구.
- Modify `src/adventure/data/v2/coopBosses.test.ts`: 개인 보스 데이터 회귀.
- Modify `src/app/api/v2/coop/attack/route.ts`: 독혈 메커니즘 활성화와 결과 요약.
- Modify `src/app/api/v2/coop/attack/route.test.ts`: 독혈군주 활성화·응답·비저장 회귀.
- Modify `src/adventure/v2/coop/useCoopBossState.ts`: 공격 결과 독혈 요약 타입.
- Modify `src/adventure/battle/BattleLogList.tsx`: `toxicBlood`, `toxicRecoveryLock` 자원 한글 라벨.
- Modify `src/adventure/battle/BattleLogList.test.tsx`: 독혈 리플레이 자원 표시 회귀.
- Modify `scripts/sim-v2-coop-boss.ts`: 독혈 폭발 횟수·피해 지표 출력.
- Modify `src/adventure/data/v2/coopBossBalance.test.ts`: 독혈군주 결정론적 시뮬레이션 회귀.
- Modify `docs/superpowers/specs/2026-08-30-unexplored-toxic-blood-lord-design.md`: 최종 캘리브레이션 기록.

---

### Task 1: 순수 독혈 상태와 보스 데이터

**Files:**
- Create: `src/adventure/v2/combat/toxicBloodLordMechanic.ts`
- Create: `src/adventure/v2/combat/toxicBloodLordMechanic.test.ts`
- Modify: `src/adventure/data/v2/unexploredBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`

**Interfaces:**
- Produces: `TOXIC_BLOOD_MAX_STACKS`, `TOXIC_BLOOD_DOT_MAX_HP_FRACTION`, `TOXIC_BLOOD_HEAL_REDUCTION_PER_STACK`, `TOXIC_BLOOD_EXPLOSION_MAX_HP_FRACTION`, `TOXIC_RECOVERY_LOCK_REDUCTION`, `TOXIC_RECOVERY_LOCK_ACTIONS`.
- Produces: `resolveToxicBloodGain(input): { stacks: number; exploded: boolean }`.
- Produces: `toxicBloodRawDotDamage(maxHp, stacks): number`, `toxicBloodRawExplosionDamage(maxHp): number`.
- Produces: `toxicBloodRecoveryMultiplier(input): number`, `consumeToxicRecoveryAction(actions): number`.

- [ ] **Step 1: 순수 산식 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import {
  consumeToxicRecoveryAction,
  resolveToxicBloodGain,
  toxicBloodRawDotDamage,
  toxicBloodRawExplosionDamage,
  toxicBloodRecoveryMultiplier,
} from "./toxicBloodLordMechanic";

describe("toxic blood lord mechanic", () => {
  it("9+1과 8+2는 한 번 폭발하고 초과분 없이 0이 된다", () => {
    expect(resolveToxicBloodGain({ current: 9, gain: 1 })).toEqual({ stacks: 0, exploded: true });
    expect(resolveToxicBloodGain({ current: 8, gain: 2 })).toEqual({ stacks: 0, exploded: true });
    expect(resolveToxicBloodGain({ current: 9, gain: 2 })).toEqual({ stacks: 0, exploded: true });
  });

  it("최대 HP 100000의 6중첩 지속 피해와 폭발 피해를 계산한다", () => {
    expect(toxicBloodRawDotDamage(100_000, 6)).toBe(1_800);
    expect(toxicBloodRawExplosionDamage(100_000)).toBe(20_000);
  });

  it("중첩형과 폭발 후 회복 감소 중 더 강한 하나만 쓴다", () => {
    expect(toxicBloodRecoveryMultiplier({ stacks: 9, recoveryLockActions: 0 })).toBe(0.73);
    expect(toxicBloodRecoveryMultiplier({ stacks: 2, recoveryLockActions: 2 })).toBe(0.5);
    expect(consumeToxicRecoveryAction(2)).toBe(1);
    expect(consumeToxicRecoveryAction(1)).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/v2/combat/toxicBloodLordMechanic.test.ts`

Expected: FAIL because `toxicBloodLordMechanic.ts` does not exist.

- [ ] **Step 3: 최소 순수 구현 작성**

```ts
export const TOXIC_BLOOD_MAX_STACKS = 10;
export const TOXIC_BLOOD_DOT_MAX_HP_FRACTION = 0.003;
export const TOXIC_BLOOD_HEAL_REDUCTION_PER_STACK = 0.03;
export const TOXIC_BLOOD_EXPLOSION_MAX_HP_FRACTION = 0.2;
export const TOXIC_RECOVERY_LOCK_REDUCTION = 0.5;
export const TOXIC_RECOVERY_LOCK_ACTIONS = 2;

const whole = (value: number, max: number) =>
  Math.min(max, Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

export function resolveToxicBloodGain(input: { current: number; gain: number }) {
  const total = whole(input.current, 9) + whole(input.gain, 10);
  return total >= TOXIC_BLOOD_MAX_STACKS
    ? { stacks: 0, exploded: true }
    : { stacks: total, exploded: false };
}

export function toxicBloodRawDotDamage(maxHp: number, stacks: number): number {
  const normalizedStacks = whole(stacks, 9);
  if (normalizedStacks <= 0) return 0;
  return Math.max(1, Math.floor(Math.max(0, maxHp) * normalizedStacks * TOXIC_BLOOD_DOT_MAX_HP_FRACTION));
}

export function toxicBloodRawExplosionDamage(maxHp: number): number {
  return Math.floor(Math.max(0, maxHp) * TOXIC_BLOOD_EXPLOSION_MAX_HP_FRACTION);
}

export function toxicBloodRecoveryMultiplier(input: { stacks: number; recoveryLockActions: number }): number {
  const stacked = 1 - whole(input.stacks, 9) * TOXIC_BLOOD_HEAL_REDUCTION_PER_STACK;
  return input.recoveryLockActions > 0 ? Math.min(stacked, 1 - TOXIC_RECOVERY_LOCK_REDUCTION) : stacked;
}

export function consumeToxicRecoveryAction(actions: number): number {
  return Math.max(0, whole(actions, TOXIC_RECOVERY_LOCK_ACTIONS) - 1);
}
```

- [ ] **Step 4: 보스 데이터 실패 테스트 추가 후 구현**

`coopBosses.test.ts`에서 `COOP_BOSSES.toxic_blood_lord`의 기술명, 빈 `enrageStages`와 정확한 세 특성을 검사한다. `unexploredBosses.ts`의 기존 일반 중독 설명을 확정 문구로 교체하고 HP 구간 격노는 추가하지 않는다.

Run: `npm test -- src/adventure/v2/combat/toxicBloodLordMechanic.test.ts src/adventure/data/v2/coopBosses.test.ts`

Expected: PASS.

- [ ] **Step 5: Task 1 커밋**

```bash
git add src/adventure/v2/combat/toxicBloodLordMechanic.ts src/adventure/v2/combat/toxicBloodLordMechanic.test.ts src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/coopBosses.test.ts
git commit -m "feat: add toxic blood mechanic rules"
```

---

### Task 2: ATB 독혈 누적·지속 피해·폭발

**Files:**
- Create: `src/adventure/v2/combat/toxicBloodLordAtb.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`

**Interfaces:**
- Consumes: Task 1의 독혈 상수와 순수 함수.
- Produces: `BossMechanicContext` union의 `{ kind: "toxic_blood_lord" }`.
- Produces: `ToxicBloodBattleState` with `toxicBloodStacks`, `toxicRecoveryLockActions`, `toxicExplosionCount`, `toxicDamageTaken`.
- Produces: `BattleLogEntry.enemyHpDamage?: number`, `BattleLogEntry.heavyBlowFired?: boolean`.

- [ ] **Step 1: ATB 실패 테스트 작성**

고정 난수와 저공격·고체력 플레이어, `everyPhases: 1` 독혈 파열 몬스터를 사용해 다음을 검사한다.

```ts
it("실제 HP 피해를 준 일반 행동은 독혈을 한 번 쌓는다", () => {
  const result = runToxicBattle({ maxTurns: 2 });
  expect(result.finalState.bossMechanic).toMatchObject({ kind: "toxic_blood_lord", toxicBloodStacks: 1 });
  expect(result.finalState.log.some((entry) => entry.text.includes("[독혈] +1"))).toBe(true);
});

it("독혈 파열은 행동당 2중첩이며 10중첩에서 폭발한다", () => {
  const result = runToxicBattle({ heavyBlowEvery: 1, maxTurns: 12 });
  expect(result.finalState.bossMechanic?.kind).toBe("toxic_blood_lord");
  expect(result.finalState.log.some((entry) => entry.text.includes("[독혈 폭발]"))).toBe(true);
  expect(result.finalState.bossMechanic).toMatchObject({ toxicExplosionCount: 1 });
});

it("독혈 설정이 없는 같은 전투에는 독혈 상태와 로그가 없다", () => {
  const result = runPlainBattle();
  expect(result.finalState.bossMechanic).toBeUndefined();
  expect(result.finalState.log.some((entry) => entry.text.includes("독혈"))).toBe(false);
});
```

보호막 전량 흡수는 중첩 없음, 7중첩 경고 1회, 지속 피해가 행동 시작 회복보다 먼저 적용됨, 상태 피해 감소·마법 장벽·사망 방지 적용, 일반 보호막 우회도 별도 테스트한다.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/v2/combat/toxicBloodLordAtb.test.ts`

Expected: FAIL because toxic boss context and state do not exist.

- [ ] **Step 3: 상태 union과 정형 적 공격 메타데이터 추가**

```ts
export type BossMechanicContext =
  | { kind: "tracking_weapon"; initialThreat: number }
  | { kind: "toxic_blood_lord" };

export type ToxicBloodBattleState = {
  kind: "toxic_blood_lord";
  toxicBloodStacks: number;
  toxicRecoveryLockActions: number;
  toxicExplosionCount: number;
  toxicDamageTaken: number;
};
```

`BossMechanicBattleState`를 추적 상태와 독혈 상태의 union으로 바꾼다. 일반 적 공격 로그에는 `enemyHpDamage: dmgToHp`, `heavyBlowFired`, v2 적 공격 로그에는 `enemyHpDamage: enemySkillDamageToHp`를 기록한다. ATB는 문자열이 아니라 새 로그의 정형 메타데이터를 합산하고, 한 적 행동 묶음에서 한 번만 독혈을 부여한다.

- [ ] **Step 4: 독혈 상태 피해와 공격 행동 정산 구현**

`engine.atb.ts`에 다음 경계를 둔다.

```ts
function settleToxicBloodAfterEnemyAction(args: {
  state: BattleState;
  player: PlayerCombat;
  logStart: number;
  tick: number;
}): BattleState;

function tickToxicBloodOnPlayerAction(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  tick: number,
): BattleState;
```

정형 `enemyHpDamage` 합계가 0보다 크고 플레이어와 보스가 모두 살아 있을 때 `heavyBlowFired`가 하나라도 있으면 `+2`, 아니면 `+1`을 적용한다. 7중첩을 처음 넘을 때 경고를 남긴다. 폭발이면 중첩을 0으로 만들고 전용 상태 피해 처리로 최대 HP 20% 원시 피해를 즉시 적용한 뒤 생존 시 회복 억제 2회를 설정한다.

전용 상태 피해 처리는 `resolveMagicBarrierDamage`, `statusDamageAfterReduction`, `applyBerserkerHostileDamage`, 불굴, 파멸 충전 HP 손실 기록을 기존 일반 DoT와 같은 순서로 사용한다. 실제 HP 차감량만 `toxicDamageTaken`에 합산하고 로그에 표시한다.

플레이어 행동 시작에는 일반 DoT와 회복보다 먼저 독혈 지속 피해를 처리한다. 사망하면 그 행동을 중단한다. `hpBarEntry()`는 독혈 중첩이 있으면 `{ toxicBlood: "X/10" }`, 중첩이 0이고 회복 억제가 남으면 `{ toxicRecoveryLock: "X/2" }`를 기존 적 자원과 병합한다.

- [ ] **Step 5: 집중 테스트 통과**

Run: `npm test -- src/adventure/v2/combat/toxicBloodLordMechanic.test.ts src/adventure/v2/combat/toxicBloodLordAtb.test.ts`

Expected: PASS.

- [ ] **Step 6: Task 2 커밋**

```bash
git add src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.atb.ts
git commit -m "feat: add toxic blood combat cycle"
```

---

### Task 3: 모든 PvE 회복에 독혈 회복 억제 적용

**Files:**
- Modify: `src/adventure/v2/combat/toxicBloodLordAtb.test.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`

**Interfaces:**
- Consumes: `toxicBloodRecoveryMultiplier()` and `ToxicBloodBattleState`.
- Produces: `playerWithToxicRecoveryMultiplier(state, player): PlayerCombat` 내부 헬퍼.

- [ ] **Step 1: 회복 억제 실패 테스트 추가**

```ts
it("9중첩에서는 기존 받는 회복 배율과 73%를 한 번씩 곱한다", () => {
  const result = runToxicHealingFixture({ stacks: 9, receivedHealMult: 1.2, rawHeal: 1_000 });
  expect(result.actualCalculatedHeal).toBe(Math.floor(1_000 * 1.2 * 0.73));
});

it("폭발 후 정확히 두 플레이어 행동은 50% 회복만 받고 세 번째에 해제된다", () => {
  const result = runRecoveryLockFixture();
  expect(result.recoveryMultipliers.slice(0, 3)).toEqual([0.5, 0.5, 1]);
  expect(result.logs.filter((text) => text.includes("[회복 억제] 해제"))).toHaveLength(1);
});
```

회복 스킬/물약 또는 재생 하나, 공격 흡혈, 피격 회복, 회피 회복을 대표 픽스처로 검사한다. 직접 보호막 값은 동일한지 확인한다.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/v2/combat/toxicBloodLordAtb.test.ts`

Expected: FAIL because recovery paths still use the unmodified player multiplier.

- [ ] **Step 3: 행동별 유효 플레이어 뷰 연결**

```ts
function playerWithToxicRecoveryMultiplier(
  state: BattleState,
  player: PlayerCombat,
): PlayerCombat {
  if (state.bossMechanic?.kind !== "toxic_blood_lord") return player;
  const toxic = toxicBloodRecoveryMultiplier({
    stacks: state.bossMechanic.toxicBloodStacks,
    recoveryLockActions: state.bossMechanic.toxicRecoveryLockActions,
  });
  return { ...player, receivedHealMult: (player.receivedHealMult ?? 1) * toxic };
}
```

플레이어 행동에서 독혈 틱 이후 이 뷰를 만들고 `applyEvasionActionRecoveryPvE`, `applyPlayerV2SkillCast`, `resolvePlayerPhase`, `finishPlayerTurn`에 전달한다. 적 행동 시작에도 현재 상태로 뷰를 만들고 `applyEnemyV2SkillCast`, `resolveEnemyPhase`와 적 DoT로 발생하는 플레이어 회복에 전달한다.

`engine.enemyPhase.ts`의 곡예와 흡혈 갑옷 원시 회복은 `healingAfterReceivedMultiplier(raw, player.receivedHealMult)`를 한 번 사용한다. 직접 보호막 수치는 이 배율에 넣지 않는다.

- [ ] **Step 4: 회복 억제 행동 수 차감**

플레이어 행동 진입 시 회복 억제 잔여 수를 캡처한다. 행동이 실제로 시작됐으면 행동 종료 후 1 차감하고 0이 되는 순간 해제 로그를 기록한다. 지속 피해로 행동 전에 사망하면 차감하지 않는다. 추적 반격 등 플레이어 행동이 아닌 사건에는 차감하지 않는다.

- [ ] **Step 5: 집중 회귀 실행 및 커밋**

Run: `npm test -- src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/atbSkillHealReduce.test.ts src/adventure/v2/combat/signatureEffects.test.ts`

Expected: PASS.

```bash
git add src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.atb.ts
git commit -m "feat: apply toxic blood recovery suppression"
```

---

### Task 4: 공격 API·결과 타입·리플레이 표시

**Files:**
- Modify: `src/app/api/v2/coop/attack/route.ts`
- Modify: `src/app/api/v2/coop/attack/route.test.ts`
- Modify: `src/adventure/v2/coop/useCoopBossState.ts`
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`

**Interfaces:**
- Consumes: `BattleResolution.finalState.bossMechanic` toxic variant.
- Produces: `CoopAttackResult.toxicBloodStacks`, `toxicRecoveryLockActions`, `toxicExplosionCount`, `toxicDamageTaken`.

- [ ] **Step 1: API 실패 테스트 작성**

독혈군주 공격에서 `resolveBattle` 입력이 `{ bossMechanic: { kind: "toxic_blood_lord" } }`인지 확인하고 성공 응답의 네 독혈 필드를 검사한다. 업데이트된 `mechanicState`에는 기존 `bossMp`/추적 값 외 독혈 필드가 생기지 않는지 확인한다. 추적 병기 요청에는 독혈 컨텍스트를 넣지 않는 격리 테스트도 둔다.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/app/api/v2/coop/attack/route.test.ts`

Expected: FAIL because toxic context and response fields are absent.

- [ ] **Step 3: Route Handler와 클라이언트 타입 구현**

`kindId === "toxic_blood_lord"`일 때만 `bossMechanic` 입력을 만든다. 추적 병기 분기와 상호 배타적인 함수로 구성해 context를 두 번 넣지 않는다. 최종 상태가 독혈 variant면 네 요약값을 읽고, 아니면 모두 0을 반환한다. DB `mechanicState` 병합에는 독혈 값을 넘기지 않는다.

```ts
toxicBloodStacks: battleToxicState?.toxicBloodStacks ?? 0,
toxicRecoveryLockActions: battleToxicState?.toxicRecoveryLockActions ?? 0,
toxicExplosionCount: battleToxicState?.toxicExplosionCount ?? 0,
toxicDamageTaken: battleToxicState?.toxicDamageTaken ?? 0,
```

`CoopAttackResult`에도 같은 네 `number` 필드를 추가한다.

- [ ] **Step 4: 리플레이 라벨 실패 테스트와 구현**

```tsx
enemySignatureResources={{ toxicBlood: "7/10", toxicRecoveryLock: "2/2" }}
```

렌더 결과에 `독혈 7/10`, `회복 억제 2/2`가 있고 원시 키가 없는지 검사한다. `RESOURCE_LABELS`에 `toxicBlood: "독혈"`, `toxicRecoveryLock: "회복 억제"`를 추가한다.

- [ ] **Step 5: API·UI 테스트와 커밋**

Run: `npm test -- src/app/api/v2/coop/attack/route.test.ts src/adventure/battle/BattleLogList.test.tsx`

Expected: PASS.

```bash
git add src/app/api/v2/coop/attack/route.ts src/app/api/v2/coop/attack/route.test.ts src/adventure/v2/coop/useCoopBossState.ts src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx
git commit -m "feat: expose toxic blood battle state"
```

---

### Task 5: 결정론적 캘리브레이션과 전체 검증

**Files:**
- Modify: `scripts/sim-v2-coop-boss.ts`
- Modify: `src/adventure/data/v2/coopBossBalance.test.ts`
- Modify: `docs/superpowers/specs/2026-08-30-unexplored-toxic-blood-lord-design.md`
- Test: 관련 골든 스냅샷은 실제 의도된 전투 변화가 확인된 경우에만 갱신.

**Interfaces:**
- Consumes: 공격 결과의 `toxicExplosionCount`, `toxicDamageTaken`.
- Produces: 독혈군주 빌드별 생존·폭발 횟수·독혈 피해 지표.

- [ ] **Step 1: 시뮬레이터 실패 테스트 추가**

독혈군주를 선택한 고정 시드 실행이 각 빌드에 대해 중앙 생존 시간, 중앙 폭발 횟수, 중앙 독혈 피해/최대 HP 비율을 내고 같은 시드에서 동일 JSON을 만드는지 검사한다.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/data/v2/coopBossBalance.test.ts`

Expected: FAIL because toxic metrics are absent.

- [ ] **Step 3: 시뮬레이터 지표 구현과 캘리브레이션 실행**

Run: `npm run sim:coop-boss -- --trials=50 --seed=20260830 --boss=toxic_blood_lord --json`

고방어 회복형이 긴 시도에서 폭발을 최소 한 번 겪고 균형형이 첫 폭발을 견디는지 확인한다. 시작 상수 `0.003`, `0.03`, `0.20`, `0.50`, `2`를 먼저 유지하고, 실패할 때만 네 피해/회복 수치를 조절한다. 다른 보스 상수는 바꾸지 않는다. 명령, 시드, 최종 상수와 빌드별 결과를 설계 문서의 캘리브레이션 기록에 남긴다.

- [ ] **Step 4: 집중·타입·린트·전체 회귀 검증**

Run:

```bash
npm test -- src/adventure/v2/combat/toxicBloodLordMechanic.test.ts src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/attack/route.test.ts src/adventure/battle/BattleLogList.test.tsx src/adventure/data/v2/coopBossBalance.test.ts
npx tsc --noEmit
npx eslint src/adventure/v2/combat/toxicBloodLordMechanic.ts src/adventure/v2/combat/toxicBloodLordMechanic.test.ts src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.atb.ts src/adventure/data/v2/unexploredBosses.ts src/app/api/v2/coop/attack/route.ts src/adventure/v2/coop/useCoopBossState.ts src/adventure/battle/BattleLogList.tsx scripts/sim-v2-coop-boss.ts
npm test
```

Expected: focused tests, typecheck, lint and full suite PASS. 이미 알려진 독립 기준선 실패가 있으면 독혈 변경을 제외한 깨끗한 기준선에서 재현하고 정확한 테스트명을 기록한다.

- [ ] **Step 5: 최종 캘리브레이션 커밋**

```bash
git add scripts/sim-v2-coop-boss.ts src/adventure/data/v2/coopBossBalance.test.ts docs/superpowers/specs/2026-08-30-unexplored-toxic-blood-lord-design.md
git commit -m "test: calibrate toxic blood lord boss"
```

## Completion Gate

- 중첩→지속 피해→10중첩 폭발→2행동 회복 억제→0부터 재누적 순환이 ATB 로그와 리플레이 자원에서 일치한다.
- 독혈 상태가 공격 시도 사이에 저장되지 않는다.
- 독혈군주가 아닌 전투의 결정론적 결과가 유지된다.
- 계획의 모든 집중 테스트, 타입 검사, 린트와 전체 회귀 결과가 기록된다.
- 구현 커밋에는 현재 작업 트리의 다른 세션 변경을 포함하지 않는다.
- 배포·푸시·PR 생성은 수행하지 않는다.
