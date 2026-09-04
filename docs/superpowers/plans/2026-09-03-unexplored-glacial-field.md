# Unexplored Glacial Battlefield Chill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빙하 거수 전투에서 보스 행동과 별개로 100틱마다 막을 수 없는 한기 1중첩을 적용해 속도 저하와 빙결 압박을 강화한다.

**Architecture:** 기존 한기 수치 계산은 `glacialColossusMechanic.ts`의 순수 규칙을 재사용하고, `engine.atb.ts`가 혹한의 전장을 플레이어·적·포격과 나란한 독립 타임라인 이벤트로 예약한다. 필드 이벤트는 같은 틱의 액터 행동보다 먼저 처리하며 행동 수를 소비하지 않고, 적용 직후 예약된 플레이어 틱만 기존 재조정 함수로 갱신한다.

**Tech Stack:** TypeScript, Vitest, ATB combat engine

## Global Constraints

- 혹한의 전장은 전투 시작 후 `100틱`부터 `100틱`마다 한기 `1`을 적용해야 한다.
- 기존 보스 행동 `+1`, 실제 HP 피해 시 추가 `+1`, 중첩당 속도 감소 `7%`, 빙결 임계값 `10`은 유지한다.
- 필드 한기는 보호막·상태이상 1회 방어·정화결계로 예방할 수 없고, 이미 쌓인 한기는 기존 정화로 제거할 수 있어야 한다.
- 빙결 예약 중 필드 한기를 추가하지 않되 다음 필드 발동 틱은 계속 진행해야 한다.
- 필드 이벤트는 같은 틱의 플레이어·보스 행동보다 먼저 처리하고 행동 수·턴 수·재사용 대기시간을 소비하지 않아야 한다.
- 빙하 거수의 HP와 전투 능력치 및 다른 전투의 타임라인은 변경하지 않는다.
- 배포는 이 계획의 범위가 아니다.

---

### Task 1: 혹한의 전장 ATB 이벤트와 안내 추가

**Files:**
- Modify: `src/adventure/v2/combat/glacialColossusMechanic.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/data/v2/unexploredBosses.ts`
- Test: `src/adventure/v2/combat/glacialColossusAtb.test.ts`
- Test: `src/adventure/data/v2/coopBosses.test.ts`

**Interfaces:**
- Consumes: `resolveGlacialChillGain(input)`, `rescaleReservedPlayerTick(input)`, `appendGlacialLog(state, text, turn, tick)`, `actionInterval(spd)`
- Produces: `GLACIAL_FIELD_INTERVAL_TICKS = 100`, 결정론적 혹한의 전장 이벤트, 보스 특성 문구 `100틱마다 혹한의 전장으로 한기 누적`

- [ ] **Step 1: 100틱 주기의 실제 필드 동작을 회귀 테스트로 작성한다**

간격 상수와 사용자 안내 문구 자체는 변경 감지기일 뿐이므로 직접 검사하지 않는다. 대신 `src/adventure/v2/combat/glacialColossusAtb.test.ts`에서 소비자에게 보이는 실제 발동 틱·상태·로그를 검증한다. 보스 안내 문구는 구현 단계에서 변경하고 리뷰로 확인한다.

- [ ] **Step 2: ATB 필드 누적과 같은 틱 우선순위 테스트를 작성한다**

`src/adventure/v2/combat/glacialColossusAtb.test.ts`에 다음 검증을 추가한다. `glacialMonster({ spd: 1, directActionSpd: true })`는 첫 적 행동을 800틱까지 늦춰 필드만 관찰하게 한다.

```ts
it("100틱마다 액터 행동을 소비하지 않고 혹한의 전장 한기를 쌓는다", () => {
  const result = runGlacialBattle({
    enemy: glacialMonster({ spd: 1, directActionSpd: true }),
    maxTurns: 2,
  });
  const fieldLogs = result.finalState.log.filter((entry) =>
    entry.text.startsWith("[혹한의 전장]"),
  );

  expect(fieldLogs.map((entry) => entry.t)).toEqual([100, 200]);
  expect(fieldLogs.map((entry) => entry.text)).toEqual([
    "[혹한의 전장] 한기 +1 · 현재 1/10",
    "[혹한의 전장] 한기 +1 · 현재 2/10",
  ]);
  expect(
    result.finalState.log.filter((entry) => entry.kind === "player_attack"),
  ).toHaveLength(2);
});

it("같은 100틱이면 혹한의 전장을 플레이어 행동보다 먼저 처리한다", () => {
  const result = runGlacialBattle({
    player: { ...basePlayer, spd: 64 },
    enemy: glacialMonster({ spd: 1, directActionSpd: true }),
    maxTurns: 2,
  });
  const atTick100 = result.finalState.log.filter((entry) => entry.t === 100);

  expect(atTick100.findIndex((entry) => entry.text.startsWith("[혹한의 전장]")))
    .toBeLessThan(atTick100.findIndex((entry) => entry.kind === "player_attack"));
});
```

- [ ] **Step 3: 예방 불가와 빙결 예약 중 정지 테스트를 작성한다**

보호막·상태 방어는 소비되지 않는지, 필드로 빙결된 뒤 예약 중인 500틱은 건너뛰고 빙결 소비 후 600틱부터 다시 쌓이는지 검증한다.

```ts
it("보호막과 상태 방어는 혹한의 전장 한기를 막거나 소비되지 않는다", () => {
  const statusBlock: SignatureEffect = {
    trigger: "status_block_once",
    label: "시험 정화",
    statusBlockOnce: true,
  };
  const result = runGlacialBattle({
    player: { ...basePlayer, bulwarkShield: 100_000, equipSignatures: [statusBlock] },
    enemy: glacialMonster({ spd: 1, directActionSpd: true }),
    maxTurns: 2,
    v2Skills: {
      learned: ["v2c_grandwarder_tripleward"],
      equipped: ["v2c_grandwarder_tripleward"],
    },
  });

  expect(result.finalState.bossMechanic).toMatchObject({ glacialChillStacks: 2 });
  expect(result.finalState.flags.statusBlockUsed).toBe(false);
  expect(result.finalState.stacks.tripleWard.purification).toBe(1);
});

it("빙결 예약 중 필드 한기를 건너뛰고 다음 주기부터 다시 누적한다", () => {
  const result = runGlacialBattle({
    enemy: glacialMonster({ spd: 53, directActionSpd: true }),
    maxTurns: 3,
  });
  const fieldTicks = result.finalState.log
    .filter((entry) => entry.text.startsWith("[혹한의 전장]"))
    .map((entry) => entry.t);

  expect(result.finalState.log).toContainEqual(
    expect.objectContaining({ text: "[빙결] 다음 행동이 봉쇄된다.", t: 400 }),
  );
  expect(fieldTicks).not.toContain(500);
  expect(fieldTicks).toContain(600);
});
```

- [ ] **Step 4: 새 테스트가 기능 부재로 실패하는지 확인한다**

Run:

```bash
npx vitest run src/adventure/v2/combat/glacialColossusMechanic.test.ts src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/data/v2/unexploredBosses.test.ts
```

Expected: 혹한의 전장 로그와 필드 누적 상태가 없어 FAIL.

- [ ] **Step 5: 필드 간격 상수와 보스 안내를 구현한다**

`src/adventure/v2/combat/glacialColossusMechanic.ts`에 다음 상수를 추가한다.

```ts
export const GLACIAL_FIELD_INTERVAL_TICKS = 100;
```

`src/adventure/data/v2/unexploredBosses.ts`의 빙하 거수 특성을 다음과 같이 바꾼다.

```ts
traits: [
  "100틱마다 혹한의 전장으로 한기 누적",
  "냉기장과 피격으로 한기 누적",
  "한기 중첩당 행동 속도 감소",
  "10중첩 빙결 — 다음 행동 취소",
],
```

- [ ] **Step 6: 필드 누적 헬퍼를 구현한다**

`src/adventure/v2/combat/engine.atb.ts`에 보스 행동과 필드 누적이 함께 쓰는 `appendGlacialThresholdWarning`을 추출하고 `applyGlacialFieldChill`을 추가한다. `resolveGlacialChillGain({ gain: 1 })`로 상태를 갱신하고, 일반 누적은 `[혹한의 전장] 한기 +1 · 현재 N/10`을 남긴다. 한기 `4`와 `7`의 단계 전조를 공통 헬퍼로 기록하고, 임계 도달 시 기존과 동일한 한기 한계·빙결 로그를 추가한다. 임계 미도달 시 `rescaleReservedPlayerTick`으로 `playerNextTick`을 재계산한다. `glacialFreezePending === 1`이면 적용 여부 `false`와 기존 상태를 반환한다.

```ts
function applyGlacialFieldChill(args: {
  state: BattleState;
  currentTick: number;
  playerNextTick: number;
}): { state: BattleState; playerNextTick: number; applied: boolean } {
  const mechanic = args.state.bossMechanic;
  if (
    !mechanic ||
    mechanic.kind !== "glacial_colossus" ||
    mechanic.glacialFreezePending === 1
  ) {
    return {
      state: args.state,
      playerNextTick: args.playerNextTick,
      applied: false,
    };
  }

  const resolution = resolveGlacialChillGain({
    current: mechanic.glacialChillStacks,
    gain: 1,
    freezePending: mechanic.glacialFreezePending,
  });
  const displayStacks = resolution.triggered
    ? GLACIAL_CHILL_THRESHOLD
    : resolution.stacks;
  let state = appendGlacialLog(
    {
      ...args.state,
      bossMechanic: {
        ...mechanic,
        glacialChillStacks: resolution.stacks,
        glacialFreezePending: resolution.freezePending,
        glacialFreezeCount:
          mechanic.glacialFreezeCount + (resolution.triggered ? 1 : 0),
      },
    },
    `[혹한의 전장] 한기 +1 · 현재 ${displayStacks}/${GLACIAL_CHILL_THRESHOLD}`,
    "enemy",
    args.currentTick,
  );
  if (resolution.triggered) {
    state = appendGlacialLog(
      state,
      `[한기 ${GLACIAL_CHILL_THRESHOLD}/${GLACIAL_CHILL_THRESHOLD}] 한기가 한계에 도달해 다음 행동이 봉쇄된다.`,
      "enemy",
      args.currentTick,
    );
    state = appendGlacialLog(
      state,
      "[빙결] 다음 행동이 봉쇄된다.",
      "enemy",
      args.currentTick,
    );
    return { state, playerNextTick: args.playerNextTick, applied: true };
  }
  state = appendGlacialThresholdWarning(
    state,
    mechanic.glacialChillStacks,
    displayStacks,
    args.currentTick,
  );
  return {
    state,
    playerNextTick: rescaleReservedPlayerTick({
      currentTick: args.currentTick,
      playerNextTick: args.playerNextTick,
      previousStacks: mechanic.glacialChillStacks,
      nextStacks: resolution.stacks,
    }),
    applied: true,
  };
}
```

- [ ] **Step 7: 필드 이벤트를 ATB 루프에 연결한다**

`resolveBattleAtb`의 로컬 타임라인에 다음 필드 틱을 추가한다.

```ts
let glacialFieldNextTick =
  state.bossMechanic?.kind === "glacial_colossus"
    ? GLACIAL_FIELD_INTERVAL_TICKS
    : Number.POSITIVE_INFINITY;
```

`nextTick` 최솟값에 `glacialFieldNextTick`을 포함한다. 필드 틱이 다른 예약보다 작거나 같으면 `glacialFieldNextTick += GLACIAL_FIELD_INTERVAL_TICKS` 후 `applyGlacialFieldChill`을 실행하고, `applied`가 참이면 HP 바 스냅샷을 추가한 뒤 `continue`한다. 이 분기에서는 `actions`와 `turns`를 증가시키지 않는다.

```ts
const glacialFieldFiresNow =
  glacialFieldNextTick <= playerNextTick &&
  glacialFieldNextTick <= enemyNextTick &&
  glacialFieldNextTick <= skywardArtilleryNextTick;
if (glacialFieldFiresNow) {
  glacialFieldNextTick += GLACIAL_FIELD_INTERVAL_TICKS;
  const field = applyGlacialFieldChill({
    state,
    currentTick: nextTick,
    playerNextTick,
  });
  state = field.state;
  playerNextTick = field.playerNextTick;
  if (field.applied) {
    state = { ...state, log: appendLog(state.log, hpBarEntry(state, nextTick)) };
  }
  continue;
}
```

- [ ] **Step 8: 관련 회귀 테스트를 실행한다**

Run:

```bash
npx vitest run src/adventure/v2/combat/glacialColossusMechanic.test.ts src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/v2/combat/unexploredBossOffenseBalance.test.ts src/adventure/data/v2/coopBosses.test.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 9: 정적 검증과 전체 테스트를 실행한다**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint src/adventure/v2/combat/glacialColossusMechanic.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/coopBosses.test.ts
npm test
git diff --check
```

Expected: 모든 명령 exit 0.

- [ ] **Step 10: 구현을 커밋한다**

```bash
git add docs/superpowers/specs/2026-09-03-unexplored-glacial-field-design.md docs/superpowers/plans/2026-09-03-unexplored-glacial-field.md src/adventure/v2/combat/glacialColossusMechanic.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/glacialColossusAtb.test.ts src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/coopBosses.test.ts
git commit -m "balance: add glacial battlefield chill"
```
