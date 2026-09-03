# 불괴의 성채 방벽 잔량 전투 로그 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 불괴의 성채 방벽에 플레이어 피해가 적용될 때마다 피해 적용 직후의 남은 방벽 수치를 기존 전투 로그 한 줄에서 보여준다.

**Architecture:** 기존 `InvincibleFortressDamageEvent`의 `damage`와 `totalDamage`를 그대로 사용한다. 전투 엔진의 방벽 이벤트 로그 변환 지점에서 고정 내구도 상수와 누적 피해의 차이를 계산해 문구만 교체하며, 피해 정산 및 저장 상태는 변경하지 않는다.

**Tech Stack:** TypeScript, Vitest, 기존 ATB 전투 엔진과 `BattleLogEntry`

## Global Constraints

- 로그 형식은 `방벽 피해 +{적용 피해} · 남은 {잔량} / 3,000,000`이다.
- 잔량은 피해 적용 직후 수치이며 0 미만으로 내려가지 않는다.
- 방벽 파괴·광폭 로그와 본체 초과 피해 처리는 유지한다.
- API, 저장 데이터, 협동 보스 상태 화면은 변경하지 않는다.
- 명시적 요청 전에는 어느 환경에도 배포하지 않는다.

---

### Task 1: 방벽 피해 로그에 적용 후 잔량 표시

**Files:**
- Modify: `src/adventure/v2/combat/engine.atb.ts:88-99,293-330`
- Test: `src/adventure/v2/combat/invincibleFortressAtb.test.ts:78-123`

**Interfaces:**
- Consumes: `InvincibleFortressDamageEvent`의 `barrier_damage.damage`, `barrier_damage.totalDamage`와 `INVINCIBLE_FORTRESS_BARRIER_HP` 상수
- Produces: 피해 적용 후 잔량을 포함하는 기존 `BattleLogEntry[]`

- [ ] **Step 1: 부분 피해와 파괴 피해의 잔량 로그 회귀 테스트 작성**

부분 피해 테스트는 실제 전투 결과에서 다음 로그를 찾는다.

```typescript
expect(result.finalState.log).toContainEqual(
  expect.objectContaining({
    text: "방벽 피해 +100,000 · 남은 2,900,000 / 3,000,000",
    turn: "player",
  }),
);
```

파괴 테스트는 파괴 타격이 0 잔량을 남기고 기존 파괴 로그가 뒤따르는지 검증한다.

```typescript
const damageIndex = result.finalState.log.findIndex(
  (entry) =>
    entry.text === "방벽 피해 +3,000,000 · 남은 0 / 3,000,000",
);
const destroyedIndex = result.finalState.log.findIndex(
  (entry) => entry.text === "방벽 파괴 — 누적 3,000,000",
);
expect(damageIndex).toBeGreaterThanOrEqual(0);
expect(destroyedIndex).toBeGreaterThan(damageIndex);
```

- [ ] **Step 2: 테스트가 기존 누적 피해 문구 때문에 실패하는지 확인**

Run: `npm test -- src/adventure/v2/combat/invincibleFortressAtb.test.ts`

Expected: 새 `방벽 피해 ... 남은 ...` 로그를 찾지 못해 FAIL하고, 기존 전투 상태·피해 검증은 통과한다.

- [ ] **Step 3: 방벽 고정 내구도를 사용해 잔량 문구 구현**

`engine.atb.ts`에서 상수를 가져온다.

```typescript
import {
  INVINCIBLE_FORTRESS_BARRIER_HP,
  // 기존 imports
} from "./invincibleFortressMechanic";
```

`barrier_damage` 이벤트의 기존 문구를 다음 계산과 문구로 교체한다.

```typescript
const remainingBarrier = Math.max(
  0,
  INVINCIBLE_FORTRESS_BARRIER_HP - event.totalDamage,
);
text: `방벽 피해 +${event.damage.toLocaleString("ko-KR")} · 남은 ${remainingBarrier.toLocaleString("ko-KR")} / ${INVINCIBLE_FORTRESS_BARRIER_HP.toLocaleString("ko-KR")}`,
```

- [ ] **Step 4: 관련 테스트와 정적 검증 실행**

Run: `npm test -- src/adventure/v2/combat/invincibleFortressAtb.test.ts src/adventure/v2/combat/invincibleFortressMechanic.test.ts`

Expected: 34개 이상의 관련 테스트 PASS.

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npx eslint src/adventure/v2/combat/engine.atb.ts src/adventure/v2/combat/invincibleFortressAtb.test.ts`

Expected: exit code 0.

- [ ] **Step 5: 구현 커밋 생성**

```bash
git add src/adventure/v2/combat/engine.atb.ts \
  src/adventure/v2/combat/invincibleFortressAtb.test.ts \
  docs/superpowers/plans/2026-09-03-invincible-fortress-remaining-barrier-log.md
git commit -m "feat: show fortress barrier remaining durability"
```
