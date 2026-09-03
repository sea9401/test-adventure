# Invincible Fortress Immediate Barrier Destruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 불멸의 요새의 네 방벽을 각각 300만 내구도로 만들고, 파괴 즉시 초과 피해와 후속 타격이 본체에 적용되게 한다.

**Architecture:** `invincibleFortressMechanic.ts`가 한 번의 피해를 방벽과 본체 체력 경계에 순서대로 분배하고, 발생 순서를 보존한 방벽 이벤트를 반환한다. `engine.atb.ts`는 이벤트를 로그로 변환하며 조기 파괴 시 보스 행동을 정상 간격으로 다시 예약한다. 기존 저장 필드와 협동 보스 응답 구조는 유지한다.

**Tech Stack:** TypeScript, React, Vitest, ATB combat engine

## Global Constraints

- 각 방벽 내구도는 고정 `3,000,000`이다.
- 방벽은 피해로 300만에 도달하면 즉시 종료되고 광폭 0단계를 적용한다.
- 파괴 타격의 초과 피해와 같은 행동의 남은 타격은 본체에 적용한다.
- 다음 체력 경계에 도달하면 다음 방벽을 반드시 순서대로 소비한다.
- 400틱 미파괴 시 기존 누적 비율 광폭 판정을 적용한다.
- 네 방벽의 발동 체력 경계와 기존 광폭 공격·속도 배율은 유지한다.
- 배포는 이 계획의 범위가 아니다.

---

### Task 1: 300만 방벽과 즉시 파괴 피해 정산

**Files:**
- Modify: `src/adventure/v2/combat/invincibleFortressMechanic.ts`
- Test: `src/adventure/v2/combat/invincibleFortressMechanic.test.ts`
- Test: `src/adventure/v2/combat/unexploredBossBalanceSim.test.ts`

**Interfaces:**
- Produces: `INVINCIBLE_FORTRESS_BARRIER_HP = 3_000_000`
- Produces: `InvincibleFortressDamageEvent`의 `barrier_started`, `barrier_damage`, `barrier_destroyed` 이벤트
- Produces: `settleInvincibleFortressDamage(...)`의 순차 피해 정산 결과와 `barrierEvents`

- [x] **Step 1: 고정 내구도와 즉시 파괴 회귀 테스트를 작성한다**

`invincibleFortressBarrierTarget(MAX_HP)`이 `3_000_000`인지, 활성 방벽에 250만 피해를 주면 본체 HP가 유지되는지, 350만 피해를 주면 방벽이 완료되고 본체 HP가 50만 감소하는지 리터럴 값으로 검증한다. 정확히 300만이면 본체 피해 0, `completedBarrierCount: 1`, `activeBarrierIndex: null`, `barrierResults: [0]`을 기대한다.

기존 계보별 고정 광폭 단계 시뮬레이션은 32,400 목표를 전제로 하므로, 300만 목표에서는 계보별 광폭 단계와 방벽 달성률이 각각 `0..4`, `0..1`의 유효 범위로 집계되는 안정성 검사로 갱신한다. 정확한 300만 파괴 동작은 순수 규칙과 ATB 테스트에서 검증한다.

- [x] **Step 2: 큰 피해가 경계와 다음 방벽을 순서대로 소비하는 테스트를 작성한다**

첫 방벽에서 700만 피해를 주면 첫 방벽 300만을 파괴하고 본체를 75% 경계까지 270만 깎은 뒤, 남은 130만을 두 번째 방벽에 누적하는지 검증한다. 이벤트 순서는 첫 방벽 피해·파괴, 두 번째 방벽 시작·피해여야 한다.

- [x] **Step 3: 새 테스트가 기존 400틱 고정 방벽 동작 때문에 실패하는지 확인한다**

Run:

```bash
npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts
```

Expected: 목표가 32,400이고 목표 달성 후에도 활성 방벽이 유지되어 FAIL.

- [x] **Step 4: 순차 피해 소비와 방벽 이벤트를 구현한다**

`settleInvincibleFortressDamage`에서 남은 피해가 없을 때까지 활성 방벽과 본체 구간을 반복 처리한다. 활성 방벽은 남은 내구도까지만 피해를 흡수하고, 300만 도달 시 상태를 완료 처리한 뒤 초과 피해를 본체 처리로 넘긴다. 본체는 다음 경계까지만 피해를 받고, 경계 도달 시 다음 방벽 시작 이벤트를 만든다. 모든 수치는 `Number.MAX_SAFE_INTEGER` 이하로 제한한다.

- [x] **Step 5: 시간 만료 광폭 및 정규화 호환을 유지한다**

`advanceInvincibleFortressBarrier`는 400틱 만료 시 기존 비율 판정을 그대로 수행한다. 활성 상태의 `barrierDamage` 정규화 범위는 `0..3_000_000`으로 바꾸고, 이미 목표에 도달한 복원 상태는 다음 양수 피해 정산에서 즉시 완료되게 한다.

- [x] **Step 6: 순수 규칙 테스트를 통과시킨다**

Run:

```bash
npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts
```

Expected: PASS.

### Task 2: ATB 로그, 후속 타격, 보스 행동 재개

**Files:**
- Modify: `src/adventure/v2/combat/engine.atb.ts`
- Test: `src/adventure/v2/combat/invincibleFortressAtb.test.ts`

**Interfaces:**
- Consumes: `SettleInvincibleFortressDamageResult.barrierEvents`
- Produces: 조기 파괴 로그 `방벽 파괴 — 누적 3,000,000`
- Produces: 조기 종료 시 `nextTick + actionInterval(...)`로 재예약된 보스 행동

- [x] **Step 1: 실제 전투 조기 파괴 테스트를 작성한다**

공격력 350만 단일 타격으로 시작 방벽을 파괴하면 같은 타격의 50만이 본체에 적용되고 파괴 로그와 광폭 0단계 로그가 같은 틱에 남는지 검증한다.

- [x] **Step 2: 다중 타격과 보스 행동 재개 테스트를 작성한다**

첫 타격으로 방벽을 정확히 파괴하는 2회 공격에서 두 번째 타격이 본체 HP를 줄이는지 검증한다. 시작 방벽을 0틱에 파괴한 뒤 보스 첫 공격이 정상 행동 간격에 발생하고 400틱까지 지연되지 않는지도 검증한다.

- [x] **Step 3: 새 테스트가 기존 로그·예약 동작 때문에 실패하는지 확인한다**

Run:

```bash
npx vitest run src/adventure/v2/combat/invincibleFortressAtb.test.ts
```

Expected: 방벽이 계속 활성 상태이고 보스 행동이 400틱까지 예약되어 FAIL.

- [x] **Step 4: 방벽 이벤트 로그와 행동 재예약을 구현한다**

두 피해 정산 호출 경로가 `barrierEvents`를 순서대로 로그에 추가하게 한다. `barrier_damage`는 흡수 피해와 누적값, `barrier_destroyed`는 파괴 및 광폭 0단계를 기록한다. 플레이어 행동 시작 전보다 완료 방벽 수가 늘고 최종 방벽이 비활성이면 보스 행동을 현재 틱부터 정상 간격으로 다시 예약한다.

- [x] **Step 5: ATB 테스트를 통과시킨다**

Run:

```bash
npx vitest run src/adventure/v2/combat/invincibleFortressAtb.test.ts
```

Expected: PASS.

### Task 3: 300만 상태 표시와 회귀 검증

**Files:**
- Modify: `src/adventure/data/v2/unexploredBosses.ts`
- Modify: `src/adventure/v2/coop/InvincibleFortressStatus.tsx`
- Test: `src/adventure/v2/coop/InvincibleFortressStatus.test.tsx`
- Test: `src/adventure/v2/coop/V2CoopBossDetailView.test.tsx`
- Test: `src/adventure/v2/coop/V2CoopBossListView.test.tsx`
- Test: `src/adventure/data/v2/coopBosses.test.ts`
- Test: `src/app/api/v2/coop/route.test.ts`
- Test: `src/app/api/v2/coop/[sessionId]/route.test.ts`

**Interfaces:**
- Consumes: `fortressBarrierDamage`, `fortressBarrierTarget`
- Produces: `누적 피해 N / 3,000,000` 상태 표시와 최대 100% 진행 막대

- [x] **Step 1: 300만 목표 표시 테스트를 작성하고 실패를 확인한다**

상태 화면, 보스 목록·상세 화면, API 응답과 리플레이 자원 스냅샷이 300만 목표 및 현재 누적 피해를 표시하는지 검증한다.

Run:

```bash
npx vitest run src/adventure/v2/coop/InvincibleFortressStatus.test.tsx src/adventure/v2/coop/V2CoopBossDetailView.test.tsx src/adventure/v2/coop/V2CoopBossListView.test.tsx src/adventure/data/v2/coopBosses.test.ts src/app/api/v2/coop/route.test.ts 'src/app/api/v2/coop/[sessionId]/route.test.ts'
```

Expected: 기존 32,400 기대값 때문에 FAIL.

- [x] **Step 2: 고정 목표를 소비하는 표시 경로를 정리한다**

UI는 서버가 전달한 실제 누적값을 표시하고 진행 막대만 목표에서 제한한다. 협동 보스 화면과 API 테스트의 하드코딩된 32,400 픽스처 및 기대값을 3,000,000으로 갱신한다. 보스 특성 안내는 `네 구간에서 300만 방벽 시험`, `400틱 내 파괴 시 즉시 방벽 해제`, `미파괴 시 달성률에 따라 다음 광폭 약화`로 바꾼다.

- [x] **Step 3: 관련 회귀 테스트를 통과시킨다**

Run:

```bash
npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/coop/InvincibleFortressStatus.test.tsx src/adventure/data/v2/coopBosses.test.ts
```

Expected: PASS.

### Task 4: 전체 검증과 커밋

- [x] **Step 1: 정적 검증과 전체 테스트를 실행한다**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint src/adventure/v2/combat/invincibleFortressMechanic.ts src/adventure/v2/combat/invincibleFortressMechanic.test.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/coop/InvincibleFortressStatus.tsx src/adventure/v2/coop/InvincibleFortressStatus.test.tsx
npm test
git diff --check
```

Expected: 모든 명령 exit 0.

- [x] **Step 2: 구현을 커밋한다**

```bash
git add docs/superpowers/plans/2026-09-03-invincible-fortress-uncapped-barrier-measurement.md src/adventure/v2/combat/invincibleFortressMechanic.ts src/adventure/v2/combat/invincibleFortressMechanic.test.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/combat/engine.atb.ts src/adventure/v2/coop/InvincibleFortressStatus.tsx src/adventure/v2/coop/InvincibleFortressStatus.test.tsx
git commit -m "balance: destroy fortress barriers at three million"
```
