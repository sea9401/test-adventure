# Status Damage Action Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 중독·출혈·연소처럼 행동 시작에 발생하는 상태 피해를 직전 공격이 아니라 피해를 받은 캐릭터의 행동 카드에 표시한다.

**Architecture:** 전투 엔진의 피해 계산과 원본 로그 순서는 바꾸지 않는다. `groupBattleLogActions`가 `status_damage` 로그를 행동 시작 효과로 대기시켰다가 같은 진영의 다음 직접 행동에 연결하고, 같은 진영의 행동이 오지 않으면 독립 로그로 남긴다.

**Tech Stack:** TypeScript, React 19, Vitest

## Global Constraints

- 전투 계산과 저장된 전투 로그 데이터는 변경하지 않는다.
- 상태 피해로 행동 전에 사망한 경우 상태 피해와 사망 로그를 독립 항목으로 표시한다.
- 배포하지 않는다.

---

### Task 1: 상태 피해 행동 카드 귀속

**Files:**
- Modify: `src/adventure/battle/BattleLogList.tsx:136-208`
- Test: `src/adventure/battle/BattleLogList.test.tsx:119-236`

**Interfaces:**
- Consumes: `BattleLogEntry.effect === "status_damage"`, `BattleLogEntry.turn`, `groupBattleLogActions(entries)`
- Produces: 피해자와 같은 진영의 다음 행동 카드에 상태 피해가 포함된 `BattleLogDisplayItem[]`

- [x] **Step 1: 피해자의 다음 행동에 귀속되는 회귀 테스트 작성**

```ts
const items = groupBattleLogActions([
  { kind: "player_attack", text: "공격! 120 피해를 입혔다.", turn: "player" },
  { kind: "info", effect: "status_damage", text: "적이 중독으로 2145 피해를 입었다.", turn: "enemy" },
  { kind: "enemy_attack", text: "공격! 50 피해를 입혔다.", turn: "enemy" },
]);
expect(items[0]).toMatchObject({ kind: "action", effects: [] });
expect(items[1]).toMatchObject({ kind: "action", effects: [{ effect: "status_damage" }] });
```

- [x] **Step 2: 상태 피해 사망 시 독립 로그로 남는 회귀 테스트 작성**

```ts
const items = groupBattleLogActions([
  { kind: "player_attack", text: "공격! 120 피해를 입혔다.", turn: "player" },
  { kind: "info", effect: "status_damage", text: "적이 중독으로 2145 피해를 입었다.", turn: "enemy" },
  { kind: "info", text: "적을 쓰러뜨렸다!", turn: "enemy" },
]);
expect(items).toMatchObject([
  { kind: "action", effects: [] },
  { kind: "entry", entry: { effect: "status_damage" } },
  { kind: "entry", entry: { text: "적을 쓰러뜨렸다!" } },
]);
```

- [x] **Step 3: 테스트가 현재 구현에서 올바른 이유로 실패하는지 확인**

Run: `npm test -- src/adventure/battle/BattleLogList.test.tsx`
Expected: 상태 피해가 직전 플레이어 행동의 `effects`에 포함되어 두 테스트가 실패한다.

- [x] **Step 4: 상태 피해를 다음 동일 진영 행동의 시작 효과로 분류**

```ts
if (isActionStartStatusDamage(entry)) {
  flushCurrent();
  pendingEffects.push(entry);
  continue;
}
```

직접 행동을 만났을 때 행동 진영과 다른 `status_damage` 대기 항목은 독립 항목으로 먼저 방출하고, 같은 진영 항목만 행동 카드의 `effects`로 전달한다.

- [x] **Step 5: 집중 테스트와 전체 검증 실행**

Run: `npm test -- src/adventure/battle/BattleLogList.test.tsx`
Expected: PASS

Run: `npm test`
Expected: 전체 테스트 PASS

Run: `npx tsc --noEmit`
Expected: exit 0

Run: `npx eslint src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx`
Expected: exit 0

- [x] **Step 6: 변경 커밋**

```bash
git add docs/superpowers/plans/2026-08-10-status-damage-action-log.md src/adventure/battle/BattleLogList.tsx src/adventure/battle/BattleLogList.test.tsx
git commit -m "fix: attach status damage to recipient actions"
```
