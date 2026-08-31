# Combat Pattern Shield Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전투 패턴의 내 보호막 조건에 현재 보호막 포인트 기준의 이하·이상 비교를 추가한다.

**Architecture:** 기존 `self_shield` 있음/없음 저장 형태는 보존하고 수치 비교 형태를 같은 조건 kind의 판별 유니언으로 확장한다. 전투 엔진은 현재 보호막 포인트를 공용 캐스트 입력과 패턴 컨텍스트에 전달하고, 편집기는 네 비교 모드를 상호 변환한다.

**Tech Stack:** TypeScript, React 19 Client Components, Next.js 16.2.11 App Router, Vitest 4

## Global Constraints

- 비교값은 현재 보호막 포인트이며 최대 HP 비율이 아니다.
- 이하·이상은 경계를 포함하고 입력은 0 이상의 정수로 정규화한다.
- 기존 `{ kind: "self_shield", active: boolean }` 저장값과 동작을 보존한다.
- PvE·PvP에 모두 적용하고 격자 던전의 보호막 값은 0이다.
- 기존 작업 트리 변경을 보존하며 배포하지 않는다.

---

### Task 1: 조건 모델과 런타임 전달

**Files:**
- Modify: `src/adventure/v2/combat/combatPattern.ts`
- Modify: `src/adventure/v2/combat/combatShared.ts`
- Modify: `src/adventure/v2/combat/engine.ts`
- Modify: `src/adventure/v2/combat/engine-pvp.ts`
- Modify: `src/adventure/data/v2/gridDungeonCombat.ts`
- Test: `src/adventure/v2/combat/combatPattern.test.ts`
- Test: `src/adventure/v2/combat/combatPatternCast.test.ts`

**Interfaces:**
- Consumes: `stacks.playerShield`의 현재 정수 보호막 값
- Produces: `V2PatternCtx.selfShield: number`와 수치형 `self_shield` 조건 평가·파싱

- [ ] **Step 1: 조건 평가와 파서의 실패 테스트 작성**

```ts
expect(conditionPasses(
  { kind: "self_shield", op: "atMost", value: 120 },
  ctx({ selfShield: 120 }),
)).toBe(true);
expect(conditionPasses(
  { kind: "self_shield", op: "atLeast", value: 121 },
  ctx({ selfShield: 120 }),
)).toBe(false);
expect(parseCombatPattern({ blocks: [{
  condition: { kind: "self_shield", op: "atLeast", value: 12.9 },
  action: { kind: "skill", skillId: "shield" },
}] }).blocks[0].condition).toEqual({
  kind: "self_shield", op: "atLeast", value: 12,
});
```

- [ ] **Step 2: 테스트가 기능 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/combat/combatPattern.test.ts`

Expected: `self_shield` 수치 형태 또는 `selfShield` 컨텍스트가 아직 없어 타입 검사나 기대값에서 실패한다.

- [ ] **Step 3: 모델·평가·파서와 실제 보호막 전달 구현**

```ts
type ShieldCondition =
  | { kind: "self_shield"; active: boolean }
  | { kind: "self_shield"; op: "atMost" | "atLeast"; value: number };

case "self_shield":
  return "active" in cond
    ? ctx.selfShieldActive === cond.active
    : cond.op === "atMost"
      ? ctx.selfShield <= cond.value
      : ctx.selfShield >= cond.value;
```

`combatShared`의 공격자 입력에는 `selfShield?: number`를 추가하고, PvE·PvP 엔진은 `stacks.playerShield`를 전달한다. 격자 던전은 0을 전달한다.

- [ ] **Step 4: 실제 캐스트 경로 테스트를 추가하고 관련 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatPatternCast.test.ts`

Expected: 두 파일 모두 PASS.

### Task 2: 전투 패턴 편집기

**Files:**
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`
- Modify: `src/adventure/data/v2/arenaLoadout.ts`
- Test: `src/adventure/v2/V2CombatPatternView.test.tsx`
- Test: `src/adventure/data/v2/arenaLoadout.test.ts`

**Interfaces:**
- Consumes: Task 1의 판별 유니언 `self_shield` 조건
- Produces: 있음·없음·이하·이상 선택 및 수치 입력 UI와 아레나 요약 문구

- [ ] **Step 1: 편집기 정적 렌더 실패 테스트 작성**

```tsx
const html = renderToStaticMarkup(
  <ConditionParams
    condition={{ kind: "self_shield", op: "atMost", value: 100 }}
    onChange={vi.fn()}
  />,
);
expect(html).toContain("없을 때");
expect(html).toContain("있을 때");
expect(html).toContain("이하");
expect(html).toContain("이상");
expect(html).toContain('value="100"');
```

- [ ] **Step 2: 테스트가 새 선택지 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/V2CombatPatternView.test.tsx`

Expected: 수치형 보호막 조건 렌더링이 없어 실패한다.

- [ ] **Step 3: 비교 모드 변환과 입력 구현**

```ts
type ShieldMode = "inactive" | "active" | "atMost" | "atLeast";
```

현재 조건의 판별 필드로 모드를 계산하고, 모드 변경 시 `active` 또는 `op/value` 형태로 변환한다. 수치형 모드에서만 `PatternNumberInput`을 렌더한다.

- [ ] **Step 4: 아레나 수치 조건 요약 실패 테스트 작성**

```ts
expect(arenaPatternActionSummary(loadout)[0]?.condition).toBe(
  "내 보호막 100 이하",
);
```

- [ ] **Step 5: 아레나 요약에서 두 보호막 조건 형태를 판별**

```ts
return "active" in condition
  ? `내 보호막 ${condition.active ? "있음" : "없음"}`
  : `내 보호막 ${condition.value} ${condition.op === "atMost" ? "이하" : "이상"}`;
```

- [ ] **Step 6: 관련 UI·요약 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/data/v2/arenaLoadout.test.ts`

Expected: PASS.

### Task 3: 회귀 검증과 커밋

**Files:**
- Modify: 위 작업 파일만

**Interfaces:**
- Consumes: Task 1·2의 완료된 변경
- Produces: 타입·린트·테스트 검증을 마친 커밋

- [ ] **Step 1: 관련 테스트와 정적 검사 실행**

Run: `npx vitest run src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/data/v2/arenaLoadout.test.ts`

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/combat/combatPattern.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/data/v2/gridDungeonCombat.ts src/adventure/v2/V2CombatPatternView.tsx src/adventure/data/v2/arenaLoadout.ts src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/data/v2/arenaLoadout.test.ts`

Expected: 모든 명령이 exit code 0.

- [ ] **Step 2: 사용자 변경과 섞이지 않았는지 diff 검토**

Run: `git diff --check && git diff --stat && git status --short`

Expected: 공백 오류가 없고 `NUL`, `_workspace/`, 기존 전투 로그 문구 변경은 이번 커밋 대상에서 제외된다.

- [ ] **Step 3: 이번 작업 파일만 커밋**

```bash
git add docs/superpowers/specs/2026-08-14-combat-pattern-shield-threshold-design.md docs/superpowers/plans/2026-08-14-combat-pattern-shield-threshold.md src/adventure/v2/combat/combatPattern.ts src/adventure/v2/combat/combatShared.ts src/adventure/v2/combat/engine.ts src/adventure/v2/combat/engine-pvp.ts src/adventure/data/v2/gridDungeonCombat.ts src/adventure/v2/V2CombatPatternView.tsx src/adventure/data/v2/arenaLoadout.ts src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/combat/combatPatternCast.test.ts src/adventure/v2/V2CombatPatternView.test.tsx src/adventure/data/v2/arenaLoadout.test.ts
git commit -m "feat: add shield thresholds to combat patterns"
```

기능 커밋은 `/tmp`의 격리 worktree에서 만든 뒤 현재 브랜치에 적용해, `engine.ts`와 `engine-pvp.ts`의 기존 전투 로그 문구 변경 hunk를 커밋에 포함하지 않는다.
