# Unexplored Toxic Blood Lord Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 독혈 군주의 행동 간격을 45틱으로 단축하고 물리·마법 방어력을 약 10% 높이되 기존 독혈 기믹은 그대로 유지한다.

**Architecture:** 공용 전투 공식은 변경하지 않고 `UNEXPLORED_BOSSES.toxic_blood_lord`의 정적 데이터만 조정한다. 카탈로그 테스트는 원시·표시 속도를, 협동 보스 변환 테스트는 깊이 120 스케일 이후 방어력을 고정한다.

**Tech Stack:** TypeScript, Vitest, Next.js 프로젝트 정적 데이터

## Global Constraints

- 원시 속도는 `52`, 화면 표시 속도는 `322`, 행동 간격은 `45틱`이어야 한다.
- 원시 물리 방어력은 `44`, 원시 마법 방어력은 `46`이어야 한다.
- 깊이 120 스케일 결과는 물리 방어력 `1,910`, 마법 방어력 `1,997`이어야 한다.
- 독혈 누적·폭발·회복 감소와 다른 보스 데이터는 변경하지 않는다.
- 배포는 이 계획의 범위가 아니다.

---

### Task 1: 독혈 군주 속도와 방어력 상향

**Files:**
- Modify: `src/adventure/data/v2/unexploredBosses.ts`
- Test: `src/adventure/data/v2/unexploredBosses.test.ts`
- Test: `src/adventure/data/v2/coopBosses.test.ts`

**Interfaces:**
- Consumes: `monsterActionSpd(monster)`, `actionInterval(spd)`, `coopBossForBattle(kind, currentHp)`
- Produces: `UNEXPLORED_BOSSES.toxic_blood_lord`의 확정된 속도·방어력과 안내 문구

- [ ] **Step 1: 카탈로그 회귀 테스트를 작성한다**

`src/adventure/data/v2/unexploredBosses.test.ts`에 다음 검증을 추가한다.

```ts
it("독혈 군주는 표시 속도 322로 45틱마다 행동한다", () => {
  const monster = UNEXPLORED_BOSSES.toxic_blood_lord.monster;
  const actionSpd = monsterActionSpd(monster);

  expect(monster).toMatchObject({ spd: 52, def: 44, magicDef: 46 });
  expect(actionSpd).toBe(322);
  expect(actionInterval(actionSpd)).toBe(45);
});
```

- [ ] **Step 2: 스케일 결과와 특성 안내 회귀 테스트를 작성한다**

`src/adventure/data/v2/coopBosses.test.ts`의 독혈 군주 테스트에 다음 검증을 포함한다.

```ts
expect(toxic.base).toMatchObject({
  spd: 52,
  def: 44,
  magicDef: 46,
  skill: {
    kind: "heavy_blow",
    name: "독혈 파열",
    everyPhases: 3,
    multiplier: 1.8,
  },
});
expect(
  coopBossForBattle(toxic, toxic.sharedMaxHp).monster,
).toMatchObject({ def: 1_910, magicDef: 1_997 });
expect(toxic.traits).toEqual([
  "45틱마다 빠른 행동",
  "피격 시 독혈 누적",
  "10중첩 독혈 폭발",
  "중독·폭발 후 회복 억제",
]);
```

- [ ] **Step 3: 새 테스트가 기존 값 때문에 실패하는지 확인한다**

Run:

```bash
npx vitest run src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts
```

Expected: 독혈 군주의 기존 `spd: 23`, `def: 40`, `magicDef: 42` 및 기존 특성 배열 때문에 FAIL.

- [ ] **Step 4: 최소 데이터 변경을 적용한다**

`src/adventure/data/v2/unexploredBosses.ts`의 독혈 군주 정의를 다음 값으로 변경한다.

```ts
def: 44,
magicDef: 46,
spd: 52,
```

특성 배열은 다음과 같이 변경한다.

```ts
traits: [
  "45틱마다 빠른 행동",
  "피격 시 독혈 누적",
  "10중첩 독혈 폭발",
  "중독·폭발 후 회복 억제",
],
```

- [ ] **Step 5: 관련 회귀 테스트를 실행한다**

Run:

```bash
npx vitest run src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts src/adventure/v2/combat/toxicBloodLordMechanic.test.ts src/adventure/v2/combat/toxicBloodLordAtb.test.ts src/adventure/v2/combat/unexploredBossOffenseBalance.test.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 6: 정적 검증을 실행한다**

Run:

```bash
npx tsc --noEmit
npx eslint src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts
git diff --check
```

Expected: 모든 명령 exit 0.

- [ ] **Step 7: 구현을 커밋한다**

```bash
git add src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/data/v2/coopBosses.test.ts
git commit -m "balance: strengthen toxic blood lord"
```
