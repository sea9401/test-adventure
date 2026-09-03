# Invincible Fortress Uncapped Barrier Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 불멸의 요새의 400틱 방벽 규칙은 유지하면서 목표치를 넘긴 실제 피해도 누적·로그·화면에 표시한다.

**Architecture:** 기존 `barrierDamage` 상태와 광폭 판정 함수를 유지하고, 피해 정산과 상태 정규화에서 목표치 상한만 제거한다. UI는 실제 수치와 100% 제한 진행값을 분리해 초과 피해와 올바른 진행 막대를 함께 제공한다.

**Tech Stack:** TypeScript, React, Vitest

## Global Constraints

- 방벽은 목표 달성과 관계없이 400틱 동안 본체 피해를 모두 차단해야 한다.
- 목표치와 광폭 단계 판정은 변경하지 않는다.
- 기존 저장 필드 및 전투 로그 형식은 유지한다.
- 누적 피해는 안전한 비음수 정수 범위로 제한한다.
- 배포는 이 계획의 범위가 아니다.

---

### Task 1: 목표 초과 방벽 피해를 전량 보존한다

**Files:**
- Modify: `src/adventure/v2/combat/invincibleFortressMechanic.ts`
- Test: `src/adventure/v2/combat/invincibleFortressMechanic.test.ts`

- [x] **Step 1: 목표 초과 피해의 순수 규칙 테스트를 먼저 작성한다**

활성 방벽에 `100,000` 피해가 들어오면 `barrierDamage`와 `barrierDamageApplied`가 모두 `100,000`이고 본체 HP는 그대로인지 검증한다. 체력 경계를 넘긴 공격은 경계까지의 본체 피해만 적용하고 초과분 전체를 방벽에 기록하는지도 검증한다. 목표 초과 누적값을 정규화해도 보존되는 테스트를 추가한다.

- [x] **Step 2: 새 테스트가 기존 목표치 상한 때문에 실패하는지 확인한다**

Run:

```bash
npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts
```

Expected: 실제 누적값 대신 `32,400`만 반환되어 FAIL.

- [x] **Step 3: 피해 누적과 상태 정규화의 목표치 상한을 제거한다**

활성 방벽은 기존 누적값과 새 피해를 안전한 정수로 합산한다. 체력 경계의 초과 피해도 같은 방식으로 저장한다. 정규화 상한은 `Number.MAX_SAFE_INTEGER`로 바꾸며, 광폭 판정과 400틱 진행 코드는 유지한다.

- [x] **Step 4: 순수 규칙 테스트를 통과시킨다**

Run:

```bash
npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts
```

Expected: PASS.

### Task 2: 전투 로그와 상태 화면에 실제 누적 피해를 노출한다

**Files:**
- Modify: `src/adventure/v2/coop/InvincibleFortressStatus.tsx`
- Test: `src/adventure/v2/combat/invincibleFortressAtb.test.ts`
- Test: `src/adventure/v2/coop/InvincibleFortressStatus.test.tsx`

- [x] **Step 1: 목표 초과 로그와 화면 테스트를 먼저 작성한다**

ATB 전투에서 400틱 동안 누적된 실제 피해가 종료 로그에 표시되는지 검증한다. 상태 화면은 `100,000 / 32,400`을 표시하되 진행 막대 `aria-valuenow`는 `32,400`인지 검증한다.

- [x] **Step 2: 새 테스트가 기존 상한 처리 때문에 실패하는지 확인한다**

Run:

```bash
npx vitest run src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/coop/InvincibleFortressStatus.test.tsx
```

Expected: 종료 로그와 화면 수치가 목표치로 잘려 FAIL.

- [x] **Step 3: 실제 표시값과 제한된 진행값을 분리한다**

`InvincibleFortressStatus.tsx`에서 실제 피해는 안전한 비음수 정수로 표시하고, 진행률과 접근성 현재값에만 목표치 상한을 적용한다. 전투 엔진 로그는 누적 상태를 이미 그대로 읽으므로 별도 형식 변경 없이 새 상태값을 사용한다.

- [x] **Step 4: 관련 회귀 테스트를 통과시킨다**

Run:

```bash
npx vitest run src/adventure/v2/combat/invincibleFortressMechanic.test.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/coop/InvincibleFortressStatus.test.tsx src/adventure/data/v2/coopBosses.test.ts
```

Expected: PASS.

### Task 3: 전체 검증과 커밋

- [x] **Step 1: 정적 검증과 전체 테스트를 실행한다**

Run:

```bash
env NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
npx eslint src/adventure/v2/combat/invincibleFortressMechanic.ts src/adventure/v2/combat/invincibleFortressMechanic.test.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/coop/InvincibleFortressStatus.tsx src/adventure/v2/coop/InvincibleFortressStatus.test.tsx
npm test
git diff --check
```

Expected: 모든 명령 exit 0.

- [x] **Step 2: 구현을 커밋한다**

```bash
git add docs/superpowers/specs/2026-09-03-invincible-fortress-uncapped-barrier-measurement-design.md docs/superpowers/plans/2026-09-03-invincible-fortress-uncapped-barrier-measurement.md src/adventure/v2/combat/invincibleFortressMechanic.ts src/adventure/v2/combat/invincibleFortressMechanic.test.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/coop/InvincibleFortressStatus.tsx src/adventure/v2/coop/InvincibleFortressStatus.test.tsx
git commit -m "fix: preserve fortress barrier damage measurement"
```
