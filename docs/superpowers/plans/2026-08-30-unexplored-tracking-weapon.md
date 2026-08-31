# Unexplored Tracking Weapon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미개척지 개인 보스 `추적 병기`에 세션 간 유지되는 피해·타격 추적 게이지와 방어 가능한 2연타 자동 반격을 추가한다.

**Architecture:** 순수 게이지 산식과 세션 JSON 파싱은 독립 모듈과 데이터 헬퍼에 둔다. ATB 엔진은 선택적인 `bossMechanic` 입력을 받을 때만 플레이어 행동 묶음의 실제 피해·정형 타격 수를 계산하고, 기존 적 물리 피해 경감 경로를 재사용해 반격을 즉시 해결한다. 협동 보스 API는 엔진의 시작·종료 게이지를 세션 행과 연결하고, 클라이언트는 목록·상세·리플레이에서 같은 서버 권위 값을 표시한다.

**Tech Stack:** TypeScript 5, Next.js 16 App Router route handlers, React 19, Vitest 4, Drizzle ORM, 기존 ATB 전투 엔진

## Global Constraints

- 전투는 기존 자동 ATB 방식이며 플레이어 수동 패턴 입력을 추가하지 않는다.
- 추적 게이지는 `0~100`, 피해 계수는 `500`, 직접 타격당 게이지는 `4`, 추적 섬멸은 각 타격 보스 기본 물리 공격 `1.0배`로 시작한다.
- 한 플레이어 행동 묶음에는 추적 섬멸이 최대 한 번만 발동하며 반격 후 초과분은 최대 99다.
- 적 행동 중 발생한 지속·반사·플레이어 반격 피해는 100까지만 누적하고 다음 플레이어 행동 뒤 반격한다.
- 추적 섬멸은 물리 2타이며 치명타·상태이상·방어 관통이 없다. 기존 방어력, PvE 회피 경감, 피해 감소, 보호막, 마법 방벽과 사망 방지를 적용한다.
- 보스를 처치한 플레이어 행동에는 반격하지 않고, 보스 처치 시 저장 게이지를 0으로 정리한다.
- 추적 병기는 HP 구간 페이즈를 갖지 않는다. `spd: 27`, `atk: 2.2`를 유지하고 확정 추가 공격을 제거하며 `evasionPct: 12`, `armorPierce: 10`을 사용한다.
- 추적 설정이 없는 일반 사냥, 기존 협동 보스, 독혈 군주와 빙하 거수의 전투 결과를 변경하지 않는다.
- 문자열 로그를 정규식으로 읽어 피해나 타격 수를 판정하지 않는다.
- 새 UI 표면은 `SURFACE_CARD`, `SURFACE_INSET`, `SURFACE_ACCENT`만 사용하며 카드 전체에 비활성 `opacity-*`를 적용하지 않는다.
- 운영 데이터는 쓰지 않으며 사용자가 명시적으로 요청하지 않은 배포·푸시·PR 생성은 하지 않는다.

---

## File Structure

- Create `src/adventure/v2/combat/trackingWeaponMechanic.ts`: 게이지 상수, 순수 산식, 플레이어 행동 경계와 적 행동 누적 판정.
- Create `src/adventure/v2/combat/trackingWeaponMechanic.test.ts`: 순수 게이지 경계 회귀.
- Create `src/adventure/v2/combat/trackingWeaponAtb.test.ts`: 실제 ATB 행동·반격·피해 경감·격리 회귀.
- Modify `src/adventure/v2/combat/engineState.ts`: 정형 직접 타격 수와 선택적 보스 메커니즘 전투 상태 타입.
- Modify `src/adventure/v2/combat/engine.playerPhase.ts`: 기본 공격 로그에 직접 타격 수 메타데이터 기록.
- Modify `src/adventure/v2/combat/engine.ts`: 스킬 타격 로그 메타데이터, 선택적 `bossMechanic` 입력, 공용 적 물리 강제타 헬퍼.
- Modify `src/adventure/v2/combat/engine.enemyPhase.ts`: 기존 적 물리 피해 경로에서 추적 섬멸용 강제타 헬퍼 추출.
- Modify `src/adventure/v2/combat/engine.atb.ts`: 행동 묶음별 게이지 정산, 반격, 리플레이 자원 스냅샷.
- Modify `src/adventure/data/v2/unexploredBosses.ts`: 추적 병기 일반 공격 수치와 특성 문구.
- Modify `src/adventure/data/v2/coopBosses.ts`: `trackingThreat` 세션 JSON 파싱·조회·병합 헬퍼.
- Modify `src/adventure/data/v2/coopBosses.test.ts`: 개인 보스 수치와 세션 상태 회귀.
- Modify `src/app/api/v2/coop/route.ts`: 목록 게이지 응답.
- Modify `src/app/api/v2/coop/[sessionId]/route.ts`: 상세 게이지 응답.
- Modify `src/app/api/v2/coop/attack/route.ts`: 시작 게이지 주입, 종료 게이지 원자적 저장, 공격 결과 메타데이터.
- Modify `src/app/api/v2/coop/route.test.ts`: 목록 응답 회귀.
- Modify `src/app/api/v2/coop/[sessionId]/route.test.ts`: 상세 응답 회귀.
- Modify `src/app/api/v2/coop/attack/route.test.ts`: 성공·사망·처치·거부 시 저장 회귀.
- Modify `src/lib/server/v2Coop.ts`: 새 세션 게이지 0 초기화와 만료 세션 메커니즘 상태 정리.
- Modify `src/lib/server/v2Coop.test.ts`: 생성·만료 초기화 회귀.
- Create `src/adventure/v2/coop/TrackingThreatMeter.tsx`: 목록·상세 공용 게이지 표현.
- Create `src/adventure/v2/coop/TrackingThreatMeter.test.tsx`: 기본·임박·준비 상태 렌더 회귀.
- Modify `src/adventure/v2/coop/useCoopBossState.ts`: 목록·상세·공격 응답 타입과 낙관적 상태 갱신.
- Modify `src/adventure/v2/coop/useCoopBossState.test.ts`: 공격 응답의 게이지 상태 반영 회귀.
- Modify `src/adventure/v2/coop/V2CoopBossListView.tsx`: 개인 보스 카드 게이지 표시.
- Modify `src/adventure/v2/coop/V2CoopBossListView.test.tsx`: 목록 표시 및 타 보스 미표시 회귀.
- Modify `src/adventure/v2/coop/V2CoopBossDetailView.tsx`: 상세 헤더 게이지 표시.
- Create `src/adventure/v2/coop/V2CoopBossDetailView.test.tsx`: 상세 화면 게이지 표시 회귀.
- Modify `src/adventure/battle/BattleLogList.tsx`: 리플레이 자원 키 `trackingThreat` 라벨.
- Modify `src/adventure/battle/BattleLogList.test.tsx`: 리플레이 게이지 칩 회귀.
- Modify `scripts/sim-v2-coop-boss.ts`: 추적 병기 선택 실행과 반격 지표 집계.
- Modify `src/adventure/data/v2/coopBossBalance.test.ts`: 시뮬레이터 결정성·지표 범위 회귀.
- Modify `docs/superpowers/specs/2026-08-30-unexplored-tracking-weapon-design.md`: 최종 캘리브레이션 명령과 확정 수치 기록.

---

### Task 1: 순수 추적 게이지와 개인 보스 세션 상태

**Files:**
- Create: `src/adventure/v2/combat/trackingWeaponMechanic.ts`
- Create: `src/adventure/v2/combat/trackingWeaponMechanic.test.ts`
- Modify: `src/adventure/data/v2/unexploredBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.ts`
- Modify: `src/adventure/data/v2/coopBosses.test.ts`

**Interfaces:**
- Produces: `TRACKING_THREAT_MAX`, `TRACKING_DAMAGE_THREAT_SCALE`, `TRACKING_DIRECT_HIT_THREAT`, `TRACKING_ELIMINATION_HIT_MULTIPLIER`.
- Produces: `trackingThreatGain(input): number`, `accumulateTrackingThreat(input): number`, `resolveTrackingThreatAfterPlayerAction(input): TrackingThreatResolution`.
- Produces: `coopBossTrackingThreat(kind, stateRaw): number`, `coopBossTrackingThreatMax(kind): number`, `withCoopBossTrackingThreat(kind, stateRaw, threat): CoopMechanicState`.
- Consumes: `UnexploredBossDefinition`, `CoopBossKind`, 기존 `CoopMechanicState.bossMp` 병합 계약.

- [ ] **Step 1: 순수 산식의 실패 테스트 작성**

```ts
import { describe, expect, it } from "vitest";
import {
  accumulateTrackingThreat,
  resolveTrackingThreatAfterPlayerAction,
  trackingThreatGain,
} from "./trackingWeaponMechanic";

describe("tracking weapon threat", () => {
  it("보스 HP 1% 피해와 직접 2타를 함께 계산한다", () => {
    expect(
      trackingThreatGain({ damage: 108_000, bossMaxHp: 10_800_000, directHits: 2 }),
    ).toBe(13);
  });

  it("적 행동 피해는 100에서 준비 상태로 멈춘다", () => {
    expect(accumulateTrackingThreat({ current: 94, gain: 20 })).toBe(100);
  });

  it("플레이어 행동은 한 번만 발동하고 초과분을 99 이하로 남긴다", () => {
    expect(
      resolveTrackingThreatAfterPlayerAction({ current: 90, gain: 125, bossAlive: true }),
    ).toEqual({ threat: 99, triggered: true });
  });

  it("보스가 죽었으면 반격 없이 0으로 정리한다", () => {
    expect(
      resolveTrackingThreatAfterPlayerAction({ current: 99, gain: 20, bossAlive: false }),
    ).toEqual({ threat: 0, triggered: false });
  });
});
```

- [ ] **Step 2: 실패를 확인**

Run: `npm test -- src/adventure/v2/combat/trackingWeaponMechanic.test.ts`

Expected: FAIL because `trackingWeaponMechanic.ts` does not exist.

- [ ] **Step 3: 최소 순수 구현 작성**

```ts
export const TRACKING_THREAT_MAX = 100;
export const TRACKING_DAMAGE_THREAT_SCALE = 500;
export const TRACKING_DIRECT_HIT_THREAT = 4;
export const TRACKING_ELIMINATION_HIT_MULTIPLIER = 1;

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function trackingThreatGain(input: {
  damage: number;
  bossMaxHp: number;
  directHits: number;
}): number {
  const maxHp = Math.max(1, nonNegativeInteger(input.bossMaxHp));
  return Math.floor(
    (nonNegativeInteger(input.damage) * TRACKING_DAMAGE_THREAT_SCALE) / maxHp,
  ) + nonNegativeInteger(input.directHits) * TRACKING_DIRECT_HIT_THREAT;
}

export function accumulateTrackingThreat(input: {
  current: number;
  gain: number;
}): number {
  return Math.min(
    TRACKING_THREAT_MAX,
    nonNegativeInteger(input.current) + nonNegativeInteger(input.gain),
  );
}

export type TrackingThreatResolution = {
  threat: number;
  triggered: boolean;
};

export function resolveTrackingThreatAfterPlayerAction(input: {
  current: number;
  gain: number;
  bossAlive: boolean;
}): TrackingThreatResolution {
  if (!input.bossAlive) return { threat: 0, triggered: false };
  const total = nonNegativeInteger(input.current) + nonNegativeInteger(input.gain);
  if (total < TRACKING_THREAT_MAX) return { threat: total, triggered: false };
  return {
    threat: Math.min(TRACKING_THREAT_MAX - 1, total - TRACKING_THREAT_MAX),
    triggered: true,
  };
}
```

- [ ] **Step 4: 세션 파서와 보스 카탈로그 실패 테스트 추가**

```ts
it("추적 게이지만 0~100으로 보정하며 bossMp를 보존한다", () => {
  const kind = COOP_BOSSES.tracking_weapon;
  expect(parseCoopMechanicState({ bossMp: 17, trackingThreat: 180 })).toEqual({
    bossMp: 17,
    trackingThreat: 100,
  });
  expect(coopBossTrackingThreat(kind, { trackingThreat: 73 })).toBe(73);
  expect(coopBossTrackingThreatMax(kind)).toBe(100);
  expect(withCoopBossTrackingThreat(kind, { bossMp: 17 }, 31)).toEqual({
    bossMp: 17,
    trackingThreat: 31,
  });
  expect(coopBossTrackingThreatMax(COOP_BOSSES.toxic_blood_lord)).toBe(0);
});

it("추적 병기는 확정 연타 대신 낮은 회피와 관통을 사용한다", () => {
  expect(COOP_BOSSES.tracking_weapon.base).toMatchObject({
    atk: 2.2,
    spd: 27,
    evasionPct: 12,
    skill: { kind: "pierce", armorPierce: 10 },
  });
  expect(COOP_BOSSES.tracking_weapon.base.bonusAttackChancePct).toBeUndefined();
  expect(COOP_BOSSES.tracking_weapon.enrageStages).toEqual([]);
  expect(COOP_BOSSES.tracking_weapon.traits).toEqual([
    "빠른 행동",
    "피해·타격 추적",
    "추적 완료 시 2연타 반격",
  ]);
});
```

- [ ] **Step 5: 세션 상태와 카탈로그 구현 후 집중 테스트 실행**

`CoopMechanicState`와 파서에 `trackingThreat?: number`를 추가한다. `coopBossTrackingThreatMax()`는 `kind.id === "tracking_weapon"`일 때만 100을 반환하고, 조회·병합 헬퍼는 다른 보스에서 0을 반환하되 기존 `bossMp`를 보존한다. `unexploredBosses.ts`의 추적 병기 수치와 특성은 Global Constraints의 정확한 값으로 바꾼다.

Run: `npm test -- src/adventure/v2/combat/trackingWeaponMechanic.test.ts src/adventure/data/v2/coopBosses.test.ts`

Expected: PASS.

- [ ] **Step 6: Task 1 커밋**

```bash
git add src/adventure/v2/combat/trackingWeaponMechanic.ts src/adventure/v2/combat/trackingWeaponMechanic.test.ts src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/coopBosses.ts src/adventure/data/v2/coopBosses.test.ts
git commit -m "feat: add tracking weapon threat state"
```

---

### Task 2: ATB 행동 추적과 추적 섬멸 반격

**Files:**
- Create: `src/adventure/v2/combat/trackingWeaponAtb.test.ts`
- Modify: `src/adventure/v2/combat/engineState.ts`
- Modify: `src/adventure/v2/combat/engine.playerPhase.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine.enemyPhase.ts`
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Modify: `src/adventure/v2/combat/trackingWeaponMechanic.ts`

**Interfaces:**
- Consumes: Task 1의 게이지 함수와 상수.
- Produces: `BossMechanicContext = { kind: "tracking_weapon"; initialThreat: number }`.
- Produces: `BattleState.bossMechanic` with `trackingThreat`, `trackingCounterCount`, `trackingCounterDamage`.
- Produces: `BattleLogEntry.directHits?: number` on non-`hp_bar` entries.
- Produces: `resolveForcedEnemyPhysicalHit(state, player, playerName, options)` returning `{ state, damageToHp }` without advancing the enemy ATB clock.

- [ ] **Step 1: 엔진 실패 테스트 작성**

`trackingWeaponAtb.test.ts`에 고정된 플레이어·몬스터 픽스처와 `Math.random` 스파이를 사용한다. 최소한 다음 네 테스트를 작성한다.

```ts
it("저장 게이지 96에서 직접 1타 뒤 추적 섬멸을 한 번 발동한다", () => {
  const result = resolveTrackingBattle({ initialThreat: 96, player: dpsPlayer });
  expect(result.finalState.bossMechanic).toMatchObject({
    kind: "tracking_weapon",
    trackingCounterCount: 1,
  });
  expect(result.finalState.log.filter((entry) => entry.text.includes("추적 섬멸!")).length)
    .toBe(2);
  expect(result.finalState.log.some((entry) => entry.text.includes("추적 완료 — 추적 섬멸 발동")))
    .toBe(true);
});

it("한 행동의 큰 초과분도 반격 한 번과 99 이하 게이지만 남긴다", () => {
  const result = resolveTrackingBattle({ initialThreat: 99, player: burstPlayer });
  expect(result.finalState.bossMechanic?.trackingCounterCount).toBe(1);
  expect(result.finalState.bossMechanic?.trackingThreat).toBeLessThanOrEqual(99);
});

it("행동으로 보스를 처치하면 추적 섬멸을 사용하지 않는다", () => {
  const result = resolveTrackingBattle({ initialThreat: 100, enemyHp: 1, player: dpsPlayer });
  expect(result.outcome).toBe("win");
  expect(result.finalState.bossMechanic?.trackingCounterCount).toBe(0);
  expect(result.finalState.bossMechanic?.trackingThreat).toBe(0);
});

it("추적 설정이 없으면 동일 시드의 기존 ATB 결과와 로그가 같다", () => {
  const left = withSeed(17, () => resolvePlainBattle());
  const right = withSeed(17, () => resolvePlainBattle());
  expect(right).toEqual(left);
});
```

방어 회귀는 같은 보스·시드에서 `def`, `damageTakenReductionPct`, `magicBarrierAbsorbPct`를 높인 플레이어가 더 적은 HP 피해를 받는지, HP가 낮은 픽스처에서는 첫 타 사망 뒤 두 번째 `추적 섬멸!` 로그가 없는지 검사한다. 직접 다단 스킬은 로그의 `directHits` 합계가 실제 `hitDamages.length`와 같은지도 검사한다.

- [ ] **Step 2: 실패를 확인**

Run: `npm test -- src/adventure/v2/combat/trackingWeaponAtb.test.ts`

Expected: FAIL because `ResolveContext.bossMechanic`, engine state and counter behavior do not exist.

- [ ] **Step 3: 정형 타격 수와 선택적 전투 상태 타입 추가**

```ts
export type BossMechanicContext = {
  kind: "tracking_weapon";
  initialThreat: number;
};

export type BossMechanicBattleState = {
  kind: "tracking_weapon";
  trackingThreat: number;
  trackingCounterCount: number;
  trackingCounterDamage: number;
};
```

`BattleLogEntry`의 일반 variant에 `directHits?: number`, `BattleState`에 `bossMechanic?: BossMechanicBattleState`, `ResolveContext`에 `bossMechanic?: BossMechanicContext`를 추가한다. 기본 공격의 `player_attack` 로그에는 `directHits: apHits`, 스킬의 각 실제 타격 로그에는 `directHits: 1`을 넣는다. 행동 묶음 집계에서는 `player_attack`의 `directHits`가 없으면 기존 로그 호환값 1을 사용한다. 적 행동 묶음은 로그 종류와 무관하게 직접 타격 가산을 적용하지 않으므로 반사·지속 피해가 타격 수를 올리지 않는다.

- [ ] **Step 4: 기존 물리 판정에서 강제타 헬퍼 추출**

`engine.enemyPhase.ts`의 기존 적 물리 공격 판정에서 다음 인터페이스를 추출한다. 일반 적 공격 호출은 기존 값으로 이 헬퍼를 사용해 바이트 수준의 동작을 유지한다.

```ts
export type ForcedEnemyPhysicalHitOptions = {
  attackName: string;
  multiplier: number;
  armorPierce: number;
  allowCritical: boolean;
  applyStatus: boolean;
  consumeEnemyAction: boolean;
};

export function resolveForcedEnemyPhysicalHit(
  state: BattleState,
  player: PlayerCombat,
  playerName: string,
  options: ForcedEnemyPhysicalHitOptions,
): { state: BattleState; damageToHp: number };
```

추적 섬멸 호출값은 `{ attackName: "추적 섬멸", multiplier: 1, armorPierce: 0, allowCritical: false, applyStatus: false, consumeEnemyAction: false }`다. 헬퍼는 기존 물리 피해 순서인 방어력 → PvE 회피 경감 → 일반·활성 피해 감소 → 보호막 → 마법 방벽 → 사망 방지를 적용하고, 플레이어 피격 반사·반격도 기존과 같이 처리한다. `consumeEnemyAction: false`이면 `enemyAttacksLeft`, `enemyPhasesCompleted`와 ATB 예약값을 바꾸지 않는다.

- [ ] **Step 5: ATB 행동 경계에 추적 정산과 2연타 삽입**

플레이어 분기 시작에서 `enemyHp`와 로그 길이를 기록한다. 스킬·기본 공격·같은 ATB 시점 후속타가 모두 끝난 다음 실제 HP 차감량과 새 로그의 `directHits` 합계를 Task 1 함수에 넘긴다. 보스가 살아 있고 `triggered`이면 다음 순서로 처리한다.

```ts
state = appendTrackingLog(state, `추적 +${gain} · 현재 ${displayThreat}/100`, nextTick);
state = appendTrackingLog(state, "추적 완료 — 추적 섬멸 발동", nextTick);

for (let hit = 0; hit < 2 && state.playerHp > 0 && state.enemyHp > 0; hit += 1) {
  const resolved = resolveForcedEnemyPhysicalHit(state, atbPlayer, playerName, {
    attackName: "추적 섬멸",
    multiplier: TRACKING_ELIMINATION_HIT_MULTIPLIER,
    armorPierce: 0,
    allowCritical: false,
    applyStatus: false,
    consumeEnemyAction: false,
  });
  state = resolved.state;
  counterDamage += resolved.damageToHp;
}
```

반격 전후 보스 HP 차이로 반사·플레이어 반격 피해량을 구해 피해 게이지만 잔여 값에 다시 누적한다. 이 피해로 보스가 죽으면 게이지를 0으로 바꾸고 남은 타격을 중단한다. 적 분기 전체의 보스 HP 차감은 `directHits: 0`으로 `accumulateTrackingThreat()`에 넣고 100에서 멈춘다. 모든 조기 `break` 경로도 적 행동 누적을 먼저 수행하도록 공통 종료 헬퍼로 모은다.

플레이어 묶음 직전 게이지가 70 미만이고 정산 뒤 70 이상이면 `추적 섬멸 임박`을 한 번 기록한다. 반격 루프 뒤에는 `추적 섬멸 총피해 N`, 잔여 값이 있으면 `잔여 추적 X/100`을 기록한다. 첫 타로 플레이어가 쓰러지면 루프 조건으로 두 번째 타격과 두 번째 공격 로그가 생성되지 않는다.

`hpBarEntry()`는 다음 자원 스냅샷을 기존 `enemySignatureResources`와 병합한다.

```ts
const trackingResource = state.bossMechanic?.kind === "tracking_weapon"
  ? { trackingThreat: `${state.bossMechanic.trackingThreat}/100` }
  : undefined;
```

- [ ] **Step 6: 엔진·기존 다단 로그 회귀 실행**

Run: `npm test -- src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/multiHitLog.test.ts src/adventure/v2/combat/combatAtb.test.ts src/adventure/v2/combat/engine.dotClock.test.ts src/adventure/v2/combat/magicBarrier.test.ts src/adventure/v2/combat/berserkerCombat.test.ts`

Expected: PASS, and a tracking context without a boss death leaves a `0~100` threat value.

- [ ] **Step 7: Task 2 커밋**

```bash
git add src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/trackingWeaponMechanic.ts
git commit -m "feat: add tracking elimination counterattack"
```

---

### Task 3: 개인 보스 API 저장과 응답

**Files:**
- Modify: `src/app/api/v2/coop/route.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/route.ts`
- Modify: `src/app/api/v2/coop/attack/route.ts`
- Modify: `src/app/api/v2/coop/route.test.ts`
- Modify: `src/app/api/v2/coop/[sessionId]/route.test.ts`
- Modify: `src/app/api/v2/coop/attack/route.test.ts`
- Modify: `src/lib/server/v2Coop.ts`
- Modify: `src/lib/server/v2Coop.test.ts`

**Interfaces:**
- Consumes: Task 1 세션 헬퍼와 Task 2 `ResolveContext.bossMechanic`·최종 전투 상태.
- Produces: 목록·상세 `trackingThreat`, `trackingThreatMax`, `trackingReady`.
- Produces: 공격 결과의 위 세 필드와 `trackingCounterCount`, `trackingCounterDamage`.

- [ ] **Step 1: 현재 Next.js route handler 지침 확인**

Run: `sed -n '1,260p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

Expected: route handler의 Web `Request`/`Response`, 동적 `params` Promise와 캐시 기본값을 확인한다. 새 API 파일이나 Server Action은 만들지 않는다.

- [ ] **Step 2: 목록·상세 응답 실패 테스트 작성**

기존 개인 세션 픽스처의 `mechanicState`를 `{ trackingThreat: 73 }`으로 바꾸고 소환자 조회 성공 케이스를 추가한다.

```ts
expect(body.sessions[0]).toMatchObject({
  kind: "tracking_weapon",
  trackingThreat: 73,
  trackingThreatMax: 100,
  trackingReady: false,
});

expect(body.session).toMatchObject({
  kind: "tracking_weapon",
  trackingThreat: 100,
  trackingThreatMax: 100,
  trackingReady: true,
});
```

독혈 군주 또는 일반 협동 보스 응답에는 `{ trackingThreat: 0, trackingThreatMax: 0, trackingReady: false }`가 들어가는 케이스도 고정한다.

- [ ] **Step 3: 공격 저장 실패 테스트 작성**

성공 경로용 트랜잭션 빌더에 `for`, `returning`, `insert`, `values`, `onConflictDoUpdate`, `update`, `set`을 추가하고 `resolveBattle`을 고정 결과로 모킹한다. 다음 세 경우를 각각 검증한다.

```ts
expect(mockedResolveBattle).toHaveBeenCalledWith(
  expect.any(Object),
  expect.any(Object),
  expect.any(String),
  expect.objectContaining({
    bossMechanic: { kind: "tracking_weapon", initialThreat: 73 },
  }),
);
expect(sessionUpdateSet).toMatchObject({
  mechanicState: expect.objectContaining({ trackingThreat: 31 }),
});
expect(body.result).toMatchObject({
  trackingThreat: 31,
  trackingThreatMax: 100,
  trackingReady: false,
  trackingCounterCount: 1,
  trackingCounterDamage: 240,
});
```

- 일반 종료·플레이어 사망: 최종 게이지 31을 저장한다.
- 보스 처치: 최종 전투 상태와 무관하게 0을 저장하고 응답도 0이다.
- 권한·쿨다운 거부: 기존 403/429를 반환하며 update가 호출되지 않는다.

`v2Coop.test.ts`에는 `createCoopBossSession()`으로 만든 추적 병기 세션의 `mechanicState`가 `{ bossMp: 0, trackingThreat: 0 }`인지 검사한다. `expireStaleCoopSessions()` 테스트는 update의 `set` 인수가 `{ defeatedAt: now, mechanicState: null }`인지 검사해 만료 시 저장 게이지가 남지 않게 한다.

- [ ] **Step 4: 실패를 확인**

Run: `npm test -- src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/app/api/v2/coop/attack/route.test.ts`

Expected: FAIL because tracking fields and engine context are absent.

- [ ] **Step 5: API 연결 구현**

목록·상세는 세션별로 다음 서버 권위 필드를 만든다.

```ts
const trackingThreatMax = coopBossTrackingThreatMax(def);
const trackingThreat = coopBossTrackingThreat(def, session.mechanicState);
const trackingReady = trackingThreatMax > 0 && trackingThreat >= trackingThreatMax;
```

공격 라우트는 `kindId === "tracking_weapon"`일 때만 `bossMechanic`을 전달한다. 잠금 뒤 기존 `mechanicState`에 MP와 추적 값을 차례로 병합한다. `projectedBossHp === 0`이면 0, 아니면 `battleResult.finalState.bossMechanic?.trackingThreat ?? currentTrackingThreat`을 저장한다. 응답의 반격 횟수·피해는 메커니즘 상태가 없으면 0이다.

`createCoopBossSession()`은 `withCoopBossTrackingThreat(kind, { bossMp: coopBossMaxMp(kind) }, 0)`으로 초기 상태를 만들고, 만료 sweep은 `defeatedAt`과 함께 `mechanicState: null`을 기록한다. 만료된 세션은 보상 대상이 아니며 기존 보스의 종료 후 MP를 소비하지 않으므로 전체 메커니즘 상태를 비우는 것으로 통일한다.

- [ ] **Step 6: API 집중 테스트와 타입 검사**

Run: `npm test -- src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/app/api/v2/coop/attack/route.test.ts src/lib/server/v2Coop.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 7: Task 3 커밋**

```bash
git add src/app/api/v2/coop/route.ts src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/app/api/v2/coop/attack/route.ts src/app/api/v2/coop/attack/route.test.ts src/lib/server/v2Coop.ts src/lib/server/v2Coop.test.ts
git commit -m "feat: persist tracking weapon threat"
```

---

### Task 4: 목록·상세·리플레이 게이지 표시

**Files:**
- Create: `src/adventure/v2/coop/TrackingThreatMeter.tsx`
- Create: `src/adventure/v2/coop/TrackingThreatMeter.test.tsx`
- Modify: `src/adventure/v2/coop/useCoopBossState.ts`
- Modify: `src/adventure/v2/coop/useCoopBossState.test.ts`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossListView.test.tsx`
- Modify: `src/adventure/v2/coop/V2CoopBossDetailView.tsx`
- Create: `src/adventure/v2/coop/V2CoopBossDetailView.test.tsx`
- Modify: `src/adventure/battle/BattleLogList.tsx`
- Modify: `src/adventure/battle/BattleLogList.test.tsx`

**Interfaces:**
- Consumes: Task 3 API 필드.
- Produces: `TrackingThreatMeter({ value, max, compact? })`.
- Produces: 리플레이 자원 키 `trackingThreat`의 한글 라벨 `추적`.

- [ ] **Step 1: 현재 Next.js client component 지침 확인**

Run: `sed -n '1,240p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`

Expected: 상호작용 훅이 있는 기존 `"use client"` 경계를 유지하고 새 미터는 직렬화 가능한 숫자·불리언 props만 받는다.

- [ ] **Step 2: 공용 미터 실패 테스트 작성**

```tsx
it("70 미만·임박·준비 상태를 서로 다른 문구로 표시한다", () => {
  const normal = renderToStaticMarkup(<TrackingThreatMeter value={69} max={100} />);
  const warning = renderToStaticMarkup(<TrackingThreatMeter value={70} max={100} />);
  const ready = renderToStaticMarkup(<TrackingThreatMeter value={100} max={100} />);
  expect(normal).toContain("추적 게이지");
  expect(normal).not.toContain("추적 섬멸 임박");
  expect(warning).toContain("추적 섬멸 임박");
  expect(ready).toContain("추적 완료");
  expect(ready).toContain("100 / 100");
});

it("max가 0이면 아무것도 렌더하지 않는다", () => {
  expect(renderToStaticMarkup(<TrackingThreatMeter value={0} max={0} />)).toBe("");
});
```

- [ ] **Step 3: 공용 미터 최소 구현**

`TrackingThreatMeter`는 값을 `0~max`로 보정하고 70%·100% 경계를 계산한다. 기본 상태는 violet, 임박은 amber, 준비는 rose 색을 사용한다. 새 카드 래퍼를 만들지 않고 부모의 불투명 `Card` 안에서 텍스트와 막대만 렌더한다. `compact`는 글자 크기와 막대 높이만 줄이며 컨테이너 전체 opacity를 바꾸지 않는다.

```tsx
export function TrackingThreatMeter({
  value,
  max,
  compact = false,
}: {
  value: number;
  max: number;
  compact?: boolean;
}) {
  if (max <= 0) return null;
  const current = Math.max(0, Math.min(max, Math.floor(value)));
  const pct = (current / max) * 100;
  const ready = current >= max;
  const warning = !ready && pct >= 70;
  const stateLabel = ready ? "추적 완료" : warning ? "추적 섬멸 임박" : null;
  const color = ready ? "bg-rose-500" : warning ? "bg-amber-500" : "bg-violet-500";
  return (
    <div className={compact ? "space-y-0.5" : "space-y-1"}>
      <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>추적 게이지</span>
        <span className="font-mono">{current} / {max}{stateLabel ? ` · ${stateLabel}` : ""}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full rounded transition-[width] ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 클라이언트 타입·화면 실패 테스트 추가**

`CoopSessionSummary`, `CoopSessionDetail.session`, `CoopAttackResult`에 Task 3 필드를 정확히 추가한다. 목록 개인 보스 픽스처에는 `trackingThreat: 73`, `trackingThreatMax: 100`, `trackingReady: false`를 넣고 `추적 섬멸 임박`이 출력되는지 검사한다. 일반 보스 픽스처는 `trackingThreatMax: 0`으로 두고 `추적 게이지`가 출력되지 않는지 검사한다.

`V2CoopBossDetailView.test.tsx`는 `useCoopSessionState`를 모킹해 추적 병기 상세에 `trackingThreat: 100`, `trackingThreatMax: 100`, `trackingReady: true`를 제공하고 `추적 게이지`, `100 / 100`, `추적 완료`가 출력되는지 검사한다. 같은 테스트의 독혈 군주 픽스처는 최댓값 0으로 두고 게이지가 출력되지 않는지 검사한다.

`useCoopSessionState`의 공격 응답 테스트는 다음 낙관적 갱신을 고정한다.

```ts
expect(result.current.detail?.session).toMatchObject({
  hp: 9_000_000,
  trackingThreat: 31,
  trackingThreatMax: 100,
  trackingReady: false,
});
```

`BattleLogList.test.tsx`에는 `enemySignatureResources: { trackingThreat: "73/100" }`를 주고 `추적 73/100`이 한 번 표시되는지 검사한다.

- [ ] **Step 5: 목록·상세·낙관적 상태·리플레이 구현**

- `useCoopBossState.ts`의 응답 타입과 `attack()` 낙관적 `session` 갱신에 게이지 세 필드를 넣는다.
- `V2CoopBossListView.tsx`의 HP/MP 영역 아래에 `<TrackingThreatMeter value={session.trackingThreat} max={session.trackingThreatMax} compact />`를 넣는다.
- `V2CoopBossDetailView.tsx`의 보스 HP/MP 영역 아래에 `<TrackingThreatMeter value={session.trackingThreat} max={session.trackingThreatMax} />`를 넣는다.
- `BattleLogList.tsx`의 `SIGNATURE_RESOURCE_LABELS`에 `trackingThreat: "추적"`을 추가한다.
- 전투 로그의 `추적 +N`, 임박, 발동, 각 타격, 총피해와 잔여 게이지 문구는 Task 2 엔진 로그를 그대로 표시하고 UI에서 재구성하지 않는다.

- [ ] **Step 6: UI 집중 테스트와 타입 검사**

Run: `npm test -- src/adventure/v2/coop/TrackingThreatMeter.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/V2CoopBossDetailView.test.tsx src/adventure/v2/coop/useCoopBossState.test.ts src/adventure/battle/BattleLogList.test.tsx`

Expected: PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 7: Task 4 커밋**

```bash
git add src/adventure/v2/coop/TrackingThreatMeter.tsx src/adventure/v2/coop/TrackingThreatMeter.test.tsx src/adventure/v2/coop/useCoopBossState.ts src/adventure/v2/coop/useCoopBossState.test.ts src/adventure/v2/coop/V2CoopBossListView.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/V2CoopBossDetailView.tsx src/adventure/v2/coop/V2CoopBossDetailView.test.tsx src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx
git commit -m "feat: show tracking weapon threat meter"
```

---

### Task 5: 결정론적 밸런스 시뮬레이션과 완료 검증

**Files:**
- Modify: `scripts/sim-v2-coop-boss.ts`
- Modify: `src/adventure/data/v2/coopBossBalance.test.ts`
- Modify: `docs/superpowers/specs/2026-08-30-unexplored-tracking-weapon-design.md`

**Interfaces:**
- Consumes: Task 2 최종 `trackingCounterCount`, `trackingCounterDamage`.
- Produces: `CoopBossTrialAudit.trackingCounterCount`, `trackingCounterDamageRatioPerTrigger`.
- Produces: CLI `--boss=tracking_weapon` 필터와 JSON 집계.

- [ ] **Step 1: 시뮬레이터 실패 테스트 작성**

```ts
it("추적 병기 보고서는 반격 횟수와 최대 HP 대비 반격 피해를 결정적으로 집계한다", () => {
  const first = buildCoopBossBalanceReport({
    trials: 2,
    seed: 20260830,
    bossIds: ["tracking_weapon"],
  });
  const second = buildCoopBossBalanceReport({
    trials: 2,
    seed: 20260830,
    bossIds: ["tracking_weapon"],
  });
  expect(second).toEqual(first);
  expect(first).toHaveLength(1);
  expect(first[0].builds.every((build) => build.medianTrackingCounterCount >= 0)).toBe(true);
  expect(first[0].builds.every((build) => build.medianTrackingCounterDamageRatioPerTrigger >= 0)).toBe(true);
});
```

- [ ] **Step 2: 실패를 확인**

Run: `npm test -- src/adventure/data/v2/coopBossBalance.test.ts`

Expected: FAIL because tracking metrics are not returned.

- [ ] **Step 3: 시뮬레이터 확장 구현**

`auditCoopBossForPlayer()`가 `tracking_weapon`에만 다음 컨텍스트를 넘기고, 최종 전투 상태에서 반격 값을 읽도록 한다.

```ts
const bossMechanic = bossId === "tracking_weapon"
  ? { kind: "tracking_weapon" as const, initialThreat: 0 }
  : undefined;

const trackingCounterCount = result.finalState.bossMechanic?.trackingCounterCount ?? 0;
const trackingCounterDamageRatioPerTrigger = trackingCounterCount > 0
  ? (result.finalState.bossMechanic?.trackingCounterDamage ?? 0) /
    trackingCounterCount /
    Math.max(1, args.player.maxHp)
  : 0;
```

빌드 집계에는 두 값의 중앙값을 추가한다. CLI 옵션 타입에 `bossIds?: CoopBossKindId[]`를 추가하고 `--boss=tracking_weapon`을 파싱해 `buildCoopBossBalanceReport()`로 넘긴다. 텍스트 출력에는 `반격 횟수`, `반격/HP` 열을 추가하고 JSON에도 같은 필드를 유지한다.

- [ ] **Step 4: 고정 시드 캘리브레이션 실행**

Run: `npm run sim:coop-boss -- --trials=50 --seed=20260830 --boss=tracking_weapon --json`

Expected:

- STR·DEX·INT·LUK 공격형의 실제 반격 1회 총피해/최대 HP가 주로 0.55~0.70에 위치한다.
- BAL은 0.35~0.50, VIT은 0.20~0.30에 위치한다.
- 일반적인 살아남는 빌드에서 반격 횟수가 항상 0이거나 플레이어 행동마다 1인 극단이 아니다.

범위를 벗어나면 `TRACKING_ELIMINATION_HIT_MULTIPLIER`만 먼저 조정한다. 반격 빈도가 극단이면 그다음 `TRACKING_DAMAGE_THREAT_SCALE`, 마지막으로 `TRACKING_DIRECT_HIT_THREAT`를 조정한다. 각 변경 후 동일 명령과 Task 1·2 테스트를 다시 실행한다.

- [ ] **Step 5: 확정 수치와 결과 기록**

명세의 `밸런스 검증 기준` 뒤에 `출시 캘리브레이션 기록 · 2026-08-30` 절을 추가하고 다음을 숫자로 기록한다.

- 명령: `npm run sim:coop-boss -- --trials=50 --seed=20260830 --boss=tracking_weapon --json`
- 최종 세 상수
- STR·DEX·INT·LUK, BAL, VIT의 중앙 반격 횟수와 중앙 반격/최대 HP 비율
- 표본은 로컬 결정론적 진행 픽스처이며 운영 DB를 읽거나 쓰지 않았다는 사실

- [ ] **Step 6: 전체 관련 테스트 실행**

Run: `npm test -- src/adventure/v2/combat/trackingWeaponMechanic.test.ts src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/data/v2/coopBosses.test.ts src/adventure/data/v2/coopBossBalance.test.ts src/app/api/v2/coop/route.test.ts src/app/api/v2/coop/[sessionId]/route.test.ts src/app/api/v2/coop/attack/route.test.ts src/lib/server/v2Coop.test.ts src/adventure/v2/coop/TrackingThreatMeter.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/v2/coop/V2CoopBossDetailView.test.tsx src/adventure/v2/coop/useCoopBossState.test.ts src/adventure/battle/BattleLogList.test.tsx`

Expected: PASS.

- [ ] **Step 7: 정적 검증과 전체 회귀 실행**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npx eslint src/adventure/v2/combat/trackingWeaponMechanic.ts src/adventure/v2/combat/trackingWeaponAtb.test.ts src/adventure/v2/combat/engineState.ts src/adventure/v2/combat/engine.playerPhase.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine.enemyPhase.ts src/adventure/v2/combat/engine.atb.ts src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/coopBosses.ts src/app/api/v2/coop/route.ts src/app/api/v2/coop/[sessionId]/route.ts src/app/api/v2/coop/attack/route.ts src/lib/server/v2Coop.ts src/adventure/v2/coop/TrackingThreatMeter.tsx src/adventure/v2/coop/useCoopBossState.ts src/adventure/v2/coop/V2CoopBossListView.tsx src/adventure/v2/coop/V2CoopBossDetailView.tsx src/adventure/battle/BattleLogList.tsx scripts/sim-v2-coop-boss.ts`

Expected: exit 0.

Run: `npm test`

Expected: all test files pass, with only the repository's pre-existing documented skips.

- [ ] **Step 8: 작업 트리 검토와 최종 커밋**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intended tracking weapon files are modified.

```bash
git add scripts/sim-v2-coop-boss.ts src/adventure/data/v2/coopBossBalance.test.ts docs/superpowers/specs/2026-08-30-unexplored-tracking-weapon-design.md
git commit -m "test: calibrate tracking weapon boss"
```

Run: `git status --short --branch`

Expected: clean worktree on `fix/maintenance-release-probe`, ahead of its remote; do not push or deploy.
