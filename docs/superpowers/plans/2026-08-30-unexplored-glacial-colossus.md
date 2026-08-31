# Unexplored Glacial Colossus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미개척지 개인 보스 `빙하 거수`에 보스 행동으로 누적되는 한기, 즉시 반영되는 중첩형 ATB 감속과 10중첩 플레이어 행동 취소 순환을 추가한다.

**Architecture:** 빙하 거수 전용 순수 전이·속도 산식 모듈을 만들고, 기존 선택적 보스 메커니즘 union에 별도 전투 상태를 추가한다. ATB 적 행동 경계는 냉기장과 정형 실제 HP 피해를 한 번만 정산하며 이미 예약된 플레이어 행동 시간을 비례 조정한다. 플레이어 행동 경계는 빙결 예약을 다른 행동 시작 효과보다 먼저 소비하며, 공격 API와 재생은 세션에 저장하지 않은 전투 요약만 노출한다.

**Tech Stack:** TypeScript 5, Next.js 16 App Router Route Handlers, React 19, Vitest 4, 기존 ATB 전투 엔진

## Global Constraints

- 얼음 마법사·빙결술사·빙천제의 기존 `한기 5중첩 → 빙결 추가 피해와 행동 지연` 규칙과 수치는 변경하지 않는다.
- 공용 몬스터 `chill`, PvP와 다른 보스의 결정론적 결과를 변경하지 않는다.
- 냉기장으로 적 행동마다 한기 `+1`, 같은 행동이 실제 HP 피해를 주면 추가 `+1`만 부여한다.
- 다단·추가 공격은 같은 적 행동 묶음에서 피격 추가량을 한 번만 부여한다.
- 한기 1중첩당 플레이어 유효 속도를 7% 줄이고 저장 중첩은 `0~9`로 제한한다.
- 10중첩에서 한기를 0으로 초기화하고 다음 플레이어 행동 한 번을 완전히 취소한다.
- 빙결 예약 중에는 새 한기를 쌓지 않으며 예약은 정화로 제거하지 않는다.
- 취소 행동에서는 자동 행동 선택, 공격·스킬·물약·회복·지속 피해·버프 시간 감소와 자원 소비를 실행하지 않는다.
- 상태이상 1회 방어와 정화 결계는 피격 추가 `+1`만 막고 냉기장 `+1`은 막지 않는다.
- 일반 정화는 현재 보스 전용 한기를 0으로 만들고 다음 예약 시간부터 속도를 복구한다.
- 빙하 거수 전용 상태는 공격 시도마다 초기화하며 세션 `mechanic_state`에 저장하지 않는다.
- 새 UI 표면을 만들지 않고 기존 불투명 카드와 재생 자원 영역만 사용한다.
- `src/app/**/route.ts`를 수정하기 전 현재 저장소의 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`와 `03-api-reference/03-file-conventions/route.md`를 읽는다.
- 운영 데이터 쓰기, 배포, 푸시와 PR 생성은 하지 않는다.
- 사용자가 요청하지 않았으므로 서브에이전트를 생성하지 않는다.

## Execution Prerequisite

현재 설계·계획 브랜치에서 `/tmp` 아래 격리 worktree와 `feat/glacial-colossus` 브랜치를 만든다. 이 기능은 독혈군주가 확장한 보스 메커니즘 union과 정형 `enemyHpDamage` 로그를 사용하므로, 코드 작업 전에 로컬 `feat/toxic-blood-lord`를 새 브랜치에 결합한다.

```bash
git merge --no-ff feat/toxic-blood-lord
```

병합 뒤 `npm install`, `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`과 `npm test`를 실행한다. 현재 원본 브랜치에서 상점 가격 기대값은 이미 수정되었으므로 결합 기준선은 전체 통과가 원칙이다. 실패가 있으면 기능 구현 전에 원인과 정확한 테스트명을 기록한다.

---

## File Structure

- Create `src/adventure/v2/combat/glacialColossusMechanic.ts`: 한기 정규화·전이, 속도 배율과 남은 ATB 예약 시간 재조정 순수 함수.
- Create `src/adventure/v2/combat/glacialColossusMechanic.test.ts`: 순수 산식 경계와 손상 값 회귀.
- Create `src/adventure/v2/combat/glacialColossusAtb.test.ts`: 누적·즉시 감속·빙결 행동 취소와 격리 회귀.
- Modify `src/adventure/v2/combat/engineState.ts`: 빙하 거수 컨텍스트·전투 상태 union.
- Modify `src/adventure/v2/combat/engine.atb.ts`: 상태 초기화, 적 행동 정산, 예약 시간 조정, 빙결 행동 취소와 재생 자원.
- Modify `src/adventure/v2/combat/engine.enemyPhase.ts`: 적 행동 중 발생한 정화가 보스 전용 한기도 제거하도록 연결.
- Modify `src/adventure/v2/combat/engine.playerPhase.ts`: 플레이어 정화가 보스 전용 한기를 제거하도록 연결.
- Modify `src/adventure/data/v2/unexploredBosses.ts`: 기존 공용 한기 스킬 제거와 보스 특성 문구 교체.
- Modify `src/adventure/data/v2/coopBosses.test.ts`: 빙하 거수 데이터·얼음 마법사 비변경 회귀.
- Modify `src/app/api/v2/coop/attack/route.ts`: 빙하 거수 메커니즘 활성화와 결과 요약.
- Modify `src/app/api/v2/coop/attack/route.test.ts`: 활성화·응답·세션 비저장 회귀.
- Modify `src/adventure/v2/coop/useCoopBossState.ts`: 빙하 거수 공격 결과 타입.
- Modify `src/adventure/battle/BattleLogList.tsx`: 보스 전용 `glacialChill`, `glacialFreeze` 자원 라벨.
- Modify `src/adventure/battle/BattleLogList.test.tsx`: 한기·빙결 재생 표시 회귀.
- Modify `scripts/sim-v2-coop-boss.ts`: 완료 플레이어 행동·빙결 발동·행동 취소 지표.
- Modify `src/adventure/data/v2/coopBossBalance.test.ts`: 빙하 거수 결정론적 보고서 회귀.
- Modify `docs/superpowers/specs/2026-08-30-unexplored-glacial-colossus-design.md`: 최종 캘리브레이션 기록.
- Modify `src/adventure/v2/__snapshots__/combatGolden.test.ts.snap`: 의도된 정형 로그 변화가 확인될 때만 갱신.

---

### Task 1: 순수 한기 전이·속도 산식과 보스 데이터

**Files:**
- Create: `src/adventure/v2/combat/glacialColossusMechanic.ts`
- Create: `src/adventure/v2/combat/glacialColossusMechanic.test.ts`
- Modify: `src/adventure/data/v2/unexploredBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`

**Interfaces:**
- Produces: `GLACIAL_CHILL_THRESHOLD = 10`, `GLACIAL_CHILL_SLOW_PER_STACK = 0.07`.
- Produces: `resolveGlacialChillGain(input): GlacialChillTransition`.
- Produces: `glacialChillSpeedMultiplier(stacks): number`.
- Produces: `rescaleReservedPlayerTick(input): number`.

- [x] **Step 1: 순수 산식 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import {
  glacialChillSpeedMultiplier,
  rescaleReservedPlayerTick,
  resolveGlacialChillGain,
} from "./glacialColossusMechanic";

describe("glacial colossus mechanic", () => {
  it("한기 9중첩은 속도를 63% 줄인다", () => {
    expect(glacialChillSpeedMultiplier(0)).toBe(1);
    expect(glacialChillSpeedMultiplier(9)).toBeCloseTo(0.37, 10);
  });

  it("9+1과 8+2는 한 번 빙결하고 0중첩이 된다", () => {
    expect(resolveGlacialChillGain({ current: 9, gain: 1, freezePending: 0 }))
      .toEqual({ stacks: 0, freezePending: 1, triggered: true, appliedGain: 1 });
    expect(resolveGlacialChillGain({ current: 8, gain: 2, freezePending: 0 }))
      .toEqual({ stacks: 0, freezePending: 1, triggered: true, appliedGain: 2 });
  });

  it("빙결 예약 중에는 새 한기를 쌓지 않는다", () => {
    expect(resolveGlacialChillGain({ current: 0, gain: 2, freezePending: 1 }))
      .toEqual({ stacks: 0, freezePending: 1, triggered: false, appliedGain: 0 });
  });

  it("중첩 증가와 정화는 남은 예약 시간을 속도 비율로 조정한다", () => {
    expect(rescaleReservedPlayerTick({
      currentTick: 100,
      playerNextTick: 200,
      previousStacks: 0,
      nextStacks: 5,
    })).toBeCloseTo(253.8461538462, 8);
    expect(rescaleReservedPlayerTick({
      currentTick: 100,
      playerNextTick: 253.8461538462,
      previousStacks: 5,
      nextStacks: 0,
    })).toBeCloseTo(200, 8);
  });
});
```

- [x] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/v2/combat/glacialColossusMechanic.test.ts`

Expected: FAIL because `glacialColossusMechanic.ts` does not exist.

- [x] **Step 3: 최소 순수 구현 작성**

```ts
export const GLACIAL_CHILL_THRESHOLD = 10;
export const GLACIAL_CHILL_SLOW_PER_STACK = 0.07;

export type GlacialChillTransition = {
  stacks: number;
  freezePending: 0 | 1;
  triggered: boolean;
  appliedGain: number;
};

function whole(value: unknown, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.floor(value)))
    : 0;
}

export function glacialChillSpeedMultiplier(stacks: unknown): number {
  return 1 - whole(stacks, GLACIAL_CHILL_THRESHOLD - 1) * GLACIAL_CHILL_SLOW_PER_STACK;
}

export function resolveGlacialChillGain(input: {
  current: unknown;
  gain: unknown;
  freezePending: unknown;
}): GlacialChillTransition {
  const pending = whole(input.freezePending, 1) as 0 | 1;
  if (pending === 1) {
    return { stacks: 0, freezePending: 1, triggered: false, appliedGain: 0 };
  }
  const current = whole(input.current, GLACIAL_CHILL_THRESHOLD - 1);
  const gain = whole(input.gain, 2);
  if (current + gain >= GLACIAL_CHILL_THRESHOLD) {
    return { stacks: 0, freezePending: 1, triggered: true, appliedGain: gain };
  }
  return {
    stacks: current + gain,
    freezePending: 0,
    triggered: false,
    appliedGain: gain,
  };
}

export function rescaleReservedPlayerTick(input: {
  currentTick: number;
  playerNextTick: number;
  previousStacks: unknown;
  nextStacks: unknown;
}): number {
  const currentTick = Number.isFinite(input.currentTick) ? input.currentTick : 0;
  const nextTick = Number.isFinite(input.playerNextTick)
    ? Math.max(currentTick, input.playerNextTick)
    : currentTick;
  const remaining = nextTick - currentTick;
  return currentTick + remaining *
    glacialChillSpeedMultiplier(input.previousStacks) /
    glacialChillSpeedMultiplier(input.nextStacks);
}
```

- [x] **Step 4: 보스 데이터 실패 테스트 추가**

`coopBosses.test.ts`에 다음 계약을 추가한다.

```ts
expect(COOP_BOSSES.glacial_colossus.base.skill).toBeUndefined();
expect(COOP_BOSSES.glacial_colossus.traits).toEqual([
  "냉기장으로 한기 누적",
  "한기 중첩당 행동 속도 감소",
  "10중첩 빙결 — 다음 행동 취소",
]);
expect(COOP_BOSSES.glacial_colossus.enrageStages).toEqual([]);
```

`unexploredBosses.ts`에서 빙하 거수의 기존 `{ kind: "chill", ... }` 스킬을 제거하고 세 특성을 위 문구로 교체한다. `atkType: "magic"`과 나머지 원본 수치는 유지한다.

- [x] **Step 5: Task 1 통과 확인**

Run: `npm test -- src/adventure/v2/combat/glacialColossusMechanic.test.ts src/adventure/data/v2/coopBosses.test.ts src/adventure/data/v2/frostSovereignCatalog.test.ts src/adventure/v2/combat/frostChill.test.ts`

Expected: PASS; 얼음 마법사 한기 테스트도 기존 값으로 통과.

- [x] **Step 6: Task 1 커밋**

```bash
git add src/adventure/v2/combat/glacialColossusMechanic.ts src/adventure/v2/combat/glacialColossusMechanic.test.ts src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/coopBosses.test.ts
git commit -m "feat: add glacial colossus mechanic rules"
```

---

### Task 2: ATB 한기 누적·즉시 감속·빙결 행동 취소

**Files:**
- Create: `src/adventure/v2/combat/glacialColossusAtb.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`

**Interfaces:**
- Consumes: Task 1의 `resolveGlacialChillGain`, `glacialChillSpeedMultiplier`, `rescaleReservedPlayerTick`.
- Consumes: 독혈군주 기반의 `BattleLogEntry.enemyHpDamage` 정형 메타데이터.
- Produces: `BossMechanicContext`의 `{ kind: "glacial_colossus" }`.
- Produces: `GlacialColossusBattleState`와 ATB 한기·빙결 순환.

- [x] **Step 1: ATB 실패 픽스처와 누적 테스트 작성**

고정 난수, 높은 HP와 낮은 공격력 플레이어, 빠른 빙하 거수 픽스처를 사용한다.

```ts
it("보스 행동은 냉기장과 실제 HP 피해로 한기를 두 번 쌓는다", () => {
  const result = runGlacialBattle({ maxTurns: 2 });
  expect(result.finalState.bossMechanic).toMatchObject({
    kind: "glacial_colossus",
    glacialChillStacks: 2,
    glacialFreezePending: 0,
  });
  expect(result.finalState.log.some((entry) =>
    entry.text.includes("[한기] +2 · 현재 2/10"),
  )).toBe(true);
});

it("일반 보호막이 HP 피해를 전부 막으면 냉기장 한기만 쌓는다", () => {
  const result = runGlacialBattle({ player: { ...basePlayer, bulwarkShield: 100_000 } });
  expect(result.finalState.bossMechanic).toMatchObject({ glacialChillStacks: 1 });
});
```

- [x] **Step 2: 즉시 예약 감속 실패 테스트 작성**

플레이어와 보스의 첫 행동 틱을 고정하고, 한기 정산 뒤 다음 플레이어 공격 로그 틱이 한기 없는 대조군보다 늦는지 검사한다. 계산 기대값은 `rescaleReservedPlayerTick`으로 만들지 말고 독립 리터럴 값으로 고정해 같은 버그를 공유하지 않게 한다.

```ts
expect(secondPlayerAttackTick(glacial)).toBeGreaterThan(secondPlayerAttackTick(plain));
expect(glacial.finalState.log.some((entry) =>
  entry.kind === "hp_bar" && entry.enemySignatureResources?.glacialChill === "2/10",
)).toBe(true);
```

- [x] **Step 3: 10중첩과 행동 취소 실패 테스트 작성**

```ts
it("10중첩 빙결은 다음 플레이어 행동을 정확히 한 번 취소한다", () => {
  const pickAction = vi.fn(() => ({ kind: "attack" as const }));
  const result = runGlacialBattle({ pickAction, enemySpd: 75, maxTurns: 3 });
  expect(result.finalState.bossMechanic).toMatchObject({
    kind: "glacial_colossus",
    glacialFreezeCount: 1,
    glacialSkippedActionCount: 1,
    glacialFreezePending: 0,
  });
  expect(result.finalState.log.filter((entry) =>
    entry.text.includes("몸이 얼어붙어 행동할 수 없다"),
  )).toHaveLength(1);
  expect(pickAction).toHaveBeenCalledTimes(result.turns);
});
```

빙결 예약 중 보스가 여러 번 행동해도 두 번째 빙결이 발생하지 않는 테스트와, 취소 시 재생·플레이어 DoT·버프 시간·물약·MP가 변하지 않는 테스트를 각각 추가한다.

- [x] **Step 4: 실패 확인**

Run: `npm test -- src/adventure/v2/combat/glacialColossusAtb.test.ts`

Expected: FAIL because glacial boss context/state and ATB handling do not exist.

- [x] **Step 5: 상태 union과 초기 상태 구현**

`engineState.ts`에 다음 타입을 추가한다.

```ts
export type GlacialColossusBattleState = {
  kind: "glacial_colossus";
  glacialChillStacks: number;
  glacialFreezePending: 0 | 1;
  glacialFreezeCount: number;
  glacialSkippedActionCount: number;
};
```

`BossMechanicContext`에 `{ kind: "glacial_colossus" }`를 추가하고 `BossMechanicBattleState` union에 새 상태를 포함한다. `resolveBattleAtb` 초기화에서 네 값을 모두 0으로 만든다.

- [x] **Step 6: 적 행동 한기 정산 구현**

`engine.atb.ts`에 문자열을 파싱하지 않는 다음 경계를 만든다.

```ts
function settleGlacialChillAfterEnemyAction(args: {
  state: BattleState;
  player: PlayerCombat;
  logStart: number;
  previousStacks: number;
  currentTick: number;
  playerNextTick: number;
}): { state: BattleState; playerNextTick: number };
```

`logStart` 이후 `enemy_attack.enemyHpDamage` 합계가 양수면 피격 후보를 1로 만든다. 먼저 냉기장 1로 10중첩 경계를 확인하고, 냉기장만으로 빙결하지 않았을 때만 피격 후보를 더한다. 비빙결 전이는 `previousStacks → nextStacks`로 `playerNextTick`을 비례 조정한다. 빙결 전이는 기존 예약 틱을 보존하고 횟수·로그만 갱신한다. `glacialFreezePending === 1`, 플레이어 사망 또는 보스 사망이면 무변으로 반환한다.

적 행동 묶음 시작에 `previousStacks`를 캡처하고, 감전 건너뛰기와 일반·스킬 공격 처리가 끝난 뒤 정산 함수를 정확히 한 번 호출한다.

- [x] **Step 7: 플레이어 행동 취소 구현**

플레이어 actor 분기에서 독혈 지속 피해와 다른 행동 시작 처리를 실행하기 전에 다음 분기를 둔다.

```ts
if (state.bossMechanic?.kind === "glacial_colossus" &&
    state.bossMechanic.glacialFreezePending === 1) {
  state = consumeGlacialFrozenPlayerAction(state, nextTick);
  playerNextTick = nextTick + actionInterval(effectivePlayerSpd(atbPlayer, state));
  continue;
}
```

`consumeGlacialFrozenPlayerAction`은 예약을 0으로 만들고 취소 횟수를 1 증가시키며 취소 로그만 추가한다. `turns`, 완료 플레이어 턴, 자동 행동 선택, 행동 자원과 지속효과를 건드리지 않는다. 공용 `actions` 가드는 이미 증가하므로 무한 루프 안전장치는 유지된다.

`effectivePlayerSpd`는 빙하 거수 상태에서만 기존 결과에 `glacialChillSpeedMultiplier`를 마지막으로 곱한다.

- [x] **Step 8: 재생 자원과 집중 테스트 통과**

HP 바의 보스 자원 분기에서 한기가 있으면 `glacialChill: "X/10"`, 한기 0이고 예약이 있으면 `glacialFreeze: "1/1"`를 넣는다. 둘을 동시에 넣지 않는다.

Run: `npm test -- src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/combatAtb.test.ts`

Expected: PASS.

- [x] **Step 9: 타입 검사와 Task 2 커밋**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

```bash
git add src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.atb.ts
git commit -m "feat: add glacial colossus combat cycle"
```

---

### Task 3: 상태 방어·정화와 종료 경계

**Files:**
- Modify: `src/adventure/v2/combat/glacialColossusAtb.test.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`

**Interfaces:**
- Consumes: Task 2의 `GlacialColossusBattleState`와 적 행동 정산 함수.
- Produces: 상태이상 1회 방어·정화 결계·일반 정화가 보스 전용 한기에 적용되는 경계.

- [x] **Step 1: 상태 방어 실패 테스트 작성**

상태 방어 시그니처와 삼중 결계 픽스처를 사용해 각각 첫 실제 HP 피격에서 `+2`가 아니라 냉기장 `+1`만 남고, 정확한 방어 횟수와 로그가 한 번 소비되는지 검사한다. 두 방어를 함께 둔 테스트는 상태이상 1회 방어만 먼저 소비되는지 확인한다.

```ts
expect(first.finalState.bossMechanic).toMatchObject({ glacialChillStacks: 1 });
expect(first.finalState.flags.statusBlockUsed).toBe(true);
expect(first.finalState.log.some((entry) => entry.text.includes("상태이상을 막았다"))).toBe(true);
```

9중첩에서 냉기장만으로 빙결이 발생하는 픽스처는 상태 방어 횟수를 소비하지 않는지 별도로 검사한다.

- [x] **Step 2: 정화 실패 테스트 작성**

플레이어 정화 스킬과 보호막 파괴 정화 각각에서 보스 전용 한기가 0이 되는지 검사한다. 적 행동 도중 정화가 발생하는 픽스처는 정화 전 중첩보다 다음 플레이어 행동 틱이 앞당겨지는지 확인한다. 빙결 예약 뒤 정화를 시도한 경우에는 예약 1과 행동 취소가 유지되어야 한다.

- [x] **Step 3: 실패 확인**

Run: `npm test -- src/adventure/v2/combat/glacialColossusAtb.test.ts`

Expected: FAIL on status defense consumption and glacial-specific cleanse assertions.

- [x] **Step 4: 피격 추가량 방어 구현**

`settleGlacialChillAfterEnemyAction`에서 냉기장 전이가 빙결하지 않았고 실제 HP 피해가 있을 때만 기존 `statusBlockOnce`와 삼중 결계 정화 횟수를 검사한다. 상태이상 1회 방어를 우선하고, 없을 때만 `consumePurificationWard`를 호출한다. 차단 시 피격 추가량을 0으로 만들고 기존 형식의 방어 로그를 남긴다. 냉기장으로 이미 빙결했으면 어느 방어도 조회·소비하지 않는다.

- [x] **Step 5: 정화 연결 구현**

`engine.playerPhase.ts`의 `shouldCleanseDebuffs` 상태 갱신과 `engine.enemyPhase.ts`의 `trackedShieldEffect?.cleanse` 상태 갱신에 다음 선택적 변환을 추가한다.

```ts
bossMechanic:
  state.bossMechanic?.kind === "glacial_colossus"
    ? { ...state.bossMechanic, glacialChillStacks: 0 }
    : state.bossMechanic,
```

빙결 예약과 횟수는 보존한다. 적 행동 묶음의 `previousStacks`는 정화 전 값을 유지해 최종 정산 함수가 정화 후 냉기장 중첩까지 포함한 속도 회복 비율을 계산하게 한다.

- [x] **Step 6: 종료·격리 회귀 추가 후 통과 확인**

플레이어 사망, 보스 반사 사망, 메커니즘 미지정 대조군을 추가한다. 메커니즘 미지정 대조군은 로그·틱·최종 HP·MP가 기존 결과와 동일해야 한다.

Run: `npm test -- src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/v2/combat/tripleWardPve.test.ts src/adventure/v2/combat/signatureEffects.test.ts src/adventure/v2/combat/frostChillPve.test.ts src/adventure/v2/combat/frostChillPvp.test.ts`

Expected: PASS.

- [x] **Step 7: 타입 검사와 Task 3 커밋**

Run: `env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`

```bash
git add src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.playerPhase.ts
git commit -m "feat: apply glacial chill defenses"
```

---

### Task 4: 공격 API·결과 타입·재생 표시

**Files:**
- Modify: `src/app/api/v2/coop/attack/route.ts`
- Modify: `src/app/api/v2/coop/attack/route.test.ts`
- Modify: `src/adventure/v2/coop/useCoopBossState.ts`
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`

**Interfaces:**
- Consumes: Task 2의 `{ kind: "glacial_colossus" }` 컨텍스트와 최종 전투 상태.
- Produces: 공격 응답의 네 빙하 거수 요약 필드와 한글 재생 자원 라벨.

- [x] **Step 1: 현재 Next.js Route Handler 문서 읽기**

Run:

```bash
cat node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
cat node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
```

- [x] **Step 2: 공격 API 실패 테스트 작성**

`route.test.ts`에 빙하 거수 세션을 추가하고 `resolveBattle` 호출이 다음 컨텍스트를 받는지 검사한다.

```ts
expect(mocks.resolveBattle).toHaveBeenCalledWith(
  expect.anything(),
  expect.anything(),
  expect.any(String),
  expect.objectContaining({ bossMechanic: { kind: "glacial_colossus" } }),
);
```

모의 최종 상태는 `glacialChillStacks: 7`, `glacialFreezePending: 1`, `glacialFreezeCount: 2`, `glacialSkippedActionCount: 1`을 반환한다. 응답의 네 값이 일치하고 DB에 기록한 `mechanicState`에는 네 키가 전혀 없는지 검사한다.

- [x] **Step 3: 재생 표시 실패 테스트 작성**

`BattleLogList.test.tsx`에서 적 자원 `glacialChill: "7/10"`, `glacialFreeze: "1/1"`를 각각 렌더링한다. 화면에 `한기 7/10`, `빙결 1/1`이 있고 원시 키 문자열이 없는지 검사한다.

- [x] **Step 4: 실패 확인**

Run: `npm test -- src/app/api/v2/coop/attack/route.test.ts src/adventure/battle/BattleLogList.test.tsx`

Expected: FAIL because route context/result fields and labels are absent.

- [x] **Step 5: API와 타입 구현**

공격 라우트의 보스 컨텍스트 선택을 추적 병기, 독혈 군주, 빙하 거수의 명시적 분기로 확장한다. 최종 상태가 빙하 거수일 때 네 값을 추출해 JSON 결과에 넣고, 세션 `mechanic_state` 갱신에는 포함하지 않는다.

`CoopAttackResult`에 다음 필드를 추가한다.

```ts
glacialChillStacks: number;
glacialFreezePending: 0 | 1;
glacialFreezeCount: number;
glacialSkippedActionCount: number;
```

다른 보스 응답은 네 값을 0으로 반환한다.

- [x] **Step 6: 재생 라벨 구현**

`BattleLogList.tsx`의 자원 라벨에 다음 두 항목을 추가한다.

```ts
glacialChill: "한기",
glacialFreeze: "빙결",
```

- [x] **Step 7: 집중·타입 검사와 Task 4 커밋**

Run:

```bash
npm test -- src/app/api/v2/coop/attack/route.test.ts src/adventure/battle/BattleLogList.test.tsx src/adventure/v2/coop/useCoopBossState.test.ts
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
```

Expected: PASS.

```bash
git add src/app/api/v2/coop/attack/route.ts src/app/api/v2/coop/attack/route.test.ts src/adventure/v2/coop/useCoopBossState.ts src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx
git commit -m "feat: expose glacial colossus battle state"
```

---

### Task 5: 결정론적 캘리브레이션과 전체 검증

**Files:**
- Modify: `scripts/sim-v2-coop-boss.ts`
- Modify: `src/adventure/data/v2/coopBossBalance.test.ts`
- Modify: `docs/superpowers/specs/2026-08-30-unexplored-glacial-colossus-design.md`
- Modify if intentional: `src/adventure/v2/__snapshots__/combatGolden.test.ts.snap`

**Interfaces:**
- Consumes: 빙하 거수 최종 상태의 빙결 발동·행동 취소 횟수와 `BattleResolution.turns`.
- Produces: 계보별 생존 틱, 완료 행동 수, 기여도, 빙결 횟수와 취소 횟수 보고서.

- [x] **Step 1: 시뮬레이터 실패 테스트 작성**

```ts
it("빙하 거수 보고서는 완료 행동과 빙결·취소 횟수를 결정적으로 집계한다", () => {
  const first = buildCoopBossBalanceReport({
    trials: 2,
    seed: 20260830,
    bossIds: ["glacial_colossus"],
  });
  const second = buildCoopBossBalanceReport({
    trials: 2,
    seed: 20260830,
    bossIds: ["glacial_colossus"],
  });
  expect(second).toEqual(first);
  expect(first[0].builds.every((build) =>
    build.medianCompletedPlayerActions >= 0 &&
    build.medianGlacialFreezeCount >= 0 &&
    build.medianGlacialSkippedActionCount >= 0,
  )).toBe(true);
  expect(first[0].builds.some((build) =>
    build.medianGlacialFreezeCount > 0,
  )).toBe(true);
});
```

- [x] **Step 2: 실패 확인**

Run: `npm test -- src/adventure/data/v2/coopBossBalance.test.ts`

Expected: FAIL because glacial context and report metrics are absent.

- [x] **Step 3: 시뮬레이터 지표 구현**

`glacial_colossus` 시뮬레이션에 `{ kind: "glacial_colossus" }`를 전달하고 로그 수집을 켠다. 각 trial에 `completedPlayerActions: result.turns`, `glacialFreezeCount`, `glacialSkippedActionCount`를 저장한다. build와 boss 집계에 각 중앙값 필드를 추가하고 JSON·텍스트 보고서에 출력한다. 정상 종료 표본에서는 `freezeCount - skippedCount`가 `0` 또는 종료 시 남은 예약 `1`인지 검증한다.

- [x] **Step 4: 고정 시드 캘리브레이션 실행**

Run:

```bash
npm run sim:coop-boss -- --trials=50 --seed=20260830 --boss=glacial_colossus --json
```

7계보별 생존 틱, 완료 행동 수, 기여도, 빙결 발동과 실제 취소 중앙값을 기록한다. 대부분의 계보가 첫 빙결 전에 기존 공격으로 죽으면 같은 고정 빌드에서 메커니즘을 끈 대조 실행과 비교한다. 빙결이 관측되지 않거나 감속이 완료 행동 수에 의미 있는 차이를 만들지 못할 때만 `GLACIAL_CHILL_SLOW_PER_STACK` 또는 냉기장·피격 획득량을 조정한다. 얼음 마법사, 공용 한기와 다른 보스 수치는 바꾸지 않는다.

최종 명령, 시드, 상수와 계보별 결과를 설계 문서의 `구현 캘리브레이션 기록` 절에 표로 추가한다.

- [x] **Step 5: 집중 회귀·타입·린트 검증**

Run:

```bash
npm test -- src/adventure/v2/combat/glacialColossusMechanic.test.ts src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/attack/route.test.ts src/adventure/battle/BattleLogList.test.tsx src/adventure/data/v2/coopBossBalance.test.ts src/adventure/v2/combat/frostChill.test.ts src/adventure/v2/combat/frostChillPve.test.ts src/adventure/v2/combat/frostChillPvp.test.ts
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint src/adventure/v2/combat/glacialColossusMechanic.ts src/adventure/v2/combat/glacialColossusMechanic.test.ts src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/data/v2/unexploredBosses.ts src/app/api/v2/coop/attack/route.ts src/adventure/v2/coop/useCoopBossState.ts src/adventure/battle/BattleLogList.tsx scripts/sim-v2-coop-boss.ts src/adventure/data/v2/coopBossBalance.test.ts
```

Expected: PASS.

- [x] **Step 6: 전체 회귀와 골든 판단**

Run: `npm test`

Expected: PASS. `combatGolden.test.ts`가 정형 로그 필드 때문에 `logSha`만 달라지고 HP·MP·턴·승패가 동일할 때만 `npm test -- src/adventure/v2/combatGolden.test.ts -u`로 스냅샷을 갱신한다. 다른 값이 달라지면 의도된 빙하 거수 전용 변화인지 먼저 조사하고 일반 전투 결과 변화는 수정한다.

- [x] **Step 7: 최종 캘리브레이션 커밋**

```bash
git add scripts/sim-v2-coop-boss.ts src/adventure/data/v2/coopBossBalance.test.ts docs/superpowers/specs/2026-08-30-unexplored-glacial-colossus-design.md src/adventure/v2/__snapshots__/combatGolden.test.ts.snap
git commit -m "test: calibrate glacial colossus boss"
```

스냅샷이 변하지 않았으면 해당 경로는 `git add`에서 제외한다.

## Completion Gate

- 얼음 마법사의 현재 한기·빙결 테스트와 골든 결과가 유지된다.
- 냉기장·피격 한기 → 즉시 예약 감속 → 10중첩 빙결 → 행동 한 번 취소 → 0중첩 재누적이 로그와 재생 자원에서 일치한다.
- 빙결 예약 중 추가 누적이 멈추고 연속 행동 봉쇄가 발생하지 않는다.
- 회피·보호막·마법 장벽·상태 방어·정화가 합의한 경계대로 작동한다.
- 빙하 거수 상태가 공격 시도 사이에 저장되지 않는다.
- 빙하 거수가 아닌 PvE, PvP, 추적 병기, 독혈 군주와 표준 협동 보스 결과가 유지된다.
- 집중 테스트, 타입 검사, 린트와 전체 회귀 결과를 기록한다.
- 구현 커밋에는 다른 세션의 변경을 포함하지 않는다.
- 배포·푸시·PR 생성은 수행하지 않는다.
