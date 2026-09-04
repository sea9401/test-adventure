# Immortal Berserker Skill Pressure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 불멸의 광전왕이 포효 다음 행동부터 방어력으로 경감할 수 있는 분쇄 일격을 섞어 사용하도록 한다.

**Architecture:** 전투 엔진이나 공용 스킬 정의는 바꾸지 않고, 미개척지 보스 카탈로그의 장착 스킬 우선순위만 확장한다. 카탈로그 계약 테스트와 실제 ATB 전투 테스트로 데이터가 엔진까지 연결되고 방어 투자가 피해를 줄이는지 고정한다.

**Tech Stack:** TypeScript, Vitest, existing V2 ATB combat engine

## Global Constraints

- 공유 HP, 세 생명 배분, 부활, 재생, 광폭, 광란 참격 수치는 변경하지 않는다.
- `mob_savage_roar`, `mob_crushing_blow`의 공용 정의와 보스 MP 75는 변경하지 않는다.
- 다른 미개척지 보스 데이터는 변경하지 않는다.
- 배포하지 않는다.

---

### Task 1: Lock the intended catalog and ATB behavior with failing tests

**Files:**
- Modify: `src/adventure/data/v2/unexploredBosses.test.ts`
- Modify: `src/adventure/v2/combat/immortalBerserkerAtb.test.ts`

- [ ] **Step 1: Update the catalog contract**

Change the immortal berserker expectation to require both skills in priority order and add a trait assertion:

```ts
expect(UNEXPLORED_BOSSES.immortal_berserker.monster).toMatchObject({
  v2Skills: {
    learned: ["mob_savage_roar", "mob_crushing_blow"],
    equipped: ["mob_savage_roar", "mob_crushing_blow"],
  },
  v2MaxMp: 75,
});
expect(UNEXPLORED_BOSSES.immortal_berserker.traits).toContain(
  "포효·분쇄 일격과 광란 참격",
);
```

- [ ] **Step 2: Add an integrated ATB rotation test**

Import `UNEXPLORED_BOSSES`, build the test boss from its real `v2Skills`/`v2MaxMp`, and run a deterministic long-lived battle. Assert that the enemy action log contains `포효` before `분쇄 일격`, and that neither skill action also emits a same-tick basic `공격!` entry.

- [ ] **Step 3: Add a defense-pressure assertion**

Run the same deterministic setup with low and high player defense, select the first `분쇄 일격!` `enemy_attack` entry, and assert the high-defense player receives less `enemyHpDamage`.

- [ ] **Step 4: Run the focused tests and confirm RED**

Run:

```bash
npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts
```

Expected: the catalog and ATB expectations fail because the boss currently equips only `mob_savage_roar`.

### Task 2: Wire crushing blow into the boss catalog

**Files:**
- Modify: `src/adventure/data/v2/unexploredBosses.ts`

- [ ] **Step 1: Add the existing physical skill after roar**

```ts
v2Skills: {
  learned: ["mob_savage_roar", "mob_crushing_blow"],
  equipped: ["mob_savage_roar", "mob_crushing_blow"],
},
```

- [ ] **Step 2: Expose the attack pattern in the boss traits**

Append this trait without changing existing mechanic descriptions:

```ts
"포효·분쇄 일격과 광란 참격",
```

- [ ] **Step 3: Run the focused tests and confirm GREEN**

Run:

```bash
npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts
```

Expected: both files pass, including the real ATB rotation and defense comparison.

### Task 3: Verify unchanged boss mechanics and repository quality gates

**Files:**
- Verify: `src/adventure/v2/combat/immortalBerserkerMechanic.test.ts`
- Verify: `src/adventure/v2/combat/unexploredBossBalanceSim.test.ts`
- Verify: `src/adventure/v2/combat/unexploredBossOffenseBalance.test.ts`

- [ ] **Step 1: Run the complete focused regression set**

```bash
npm test -- src/adventure/data/v2/unexploredBosses.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts src/adventure/v2/combat/immortalBerserkerMechanic.test.ts src/adventure/v2/combat/unexploredBossBalanceSim.test.ts src/adventure/v2/combat/unexploredBossOffenseBalance.test.ts
```

- [ ] **Step 2: Run type and lint checks**

```bash
npx tsc --noEmit
npx eslint src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts
git diff --check
```

- [ ] **Step 3: Review and commit the implementation**

Confirm only intended files changed, then commit:

```bash
git add src/adventure/data/v2/unexploredBosses.ts src/adventure/data/v2/unexploredBosses.test.ts src/adventure/v2/combat/immortalBerserkerAtb.test.ts
git commit -m "balance: strengthen immortal berserker skill pressure"
```
