# 전투 패턴 AND 조건 발견성 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 복합 조건의 저장·전투 동작을 유지하면서 편집기와 설명서에서 AND/OR를 쉽게 찾고 혈전 조합을 구성할 수 있게 한다.

**Architecture:** `V2CombatPatternView`의 기존 `all`/`any` 선택지와 복합 조건 편집기에 용어·설명을 추가한다. 전투 모델과 파서는 건드리지 않고, 사용자 문구만 설명서와 일치시킨다.

**Tech Stack:** Next.js 16 Client Component, React 19, TypeScript, Vitest, React server rendering tests

## Global Constraints

- `node_modules/next/dist/docs/`의 Client Component와 접근성 지침을 따른다.
- 기존 `all`/`any` 저장 형식과 최대 4개 하위 조건 제한을 유지한다.
- 패널과 카드는 불투명 표면을 사용하며 새 반투명 표면을 만들지 않는다.
- 배포와 점검 모드 변경은 하지 않는다.
- 사용자의 다른 작업 트리 변경을 수정하거나 커밋하지 않는다.

---

### Task 1: 편집기 AND/OR 발견성

**Files:**
- Modify: `src/adventure/v2/V2CombatPatternView.test.tsx`
- Modify: `src/adventure/v2/V2CombatPatternView.tsx`

**Interfaces:**
- Consumes: 기존 `Extract<V2CombatCondition, { kind: "all" | "any" }>` 복합 조건
- Produces: 조건 선택기의 `AND (모두 만족)`/`OR (하나 만족)` 문구와 복합 조건 설명

- [ ] **Step 1: 실패하는 렌더링 테스트 작성**

```tsx
it("AND/OR 복합 조건의 의미와 혈전 조합 예시를 안내한다", () => {
  const page = renderToStaticMarkup(<V2CombatPatternView onBack={vi.fn()} />);
  const andEditor = renderToStaticMarkup(
    <ConditionParams
      condition={{
        kind: "all",
        conditions: [
          { kind: "self_hp", op: "above", pct: 50 },
          { kind: "self_buff_pct", target: "berserkerFinisher", active: false },
        ],
      }}
      onChange={vi.fn()}
    />,
  );

  expect(page).toContain("AND (모두 만족)");
  expect(page).toContain("내 HP 50% 이상");
  expect(page).toContain("혈전 준비 없음");
  expect(andEditor).toContain("모든 하위 조건");
});
```

- [ ] **Step 2: 테스트가 요구 문구 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/V2CombatPatternView.test.tsx`

Expected: 새 테스트가 `AND (모두 만족)` 또는 `모든 하위 조건`을 찾지 못해 FAIL

- [ ] **Step 3: 최소 UI 문구 구현**

```tsx
{ value: "all", label: "AND (모두 만족)", group: "복합 조건",
  detail: "모든 하위 조건을 만족할 때" },
{ value: "any", label: "OR (하나 만족)", group: "복합 조건",
  detail: "하위 조건을 하나 이상 만족할 때" },
```

편집기 상단에는 `내 HP 50% 이상 AND 혈전 준비 없음 → 혈전` 예시를 넣고,
`CompoundConditionParams`에는 현재 모드의 의미를 한 줄로 표시한다.

- [ ] **Step 4: 편집기 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/V2CombatPatternView.test.tsx`

Expected: PASS

### Task 2: 게임 설명서 복합 조건 예시

**Files:**
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: `src/app/manual/content/skills.tsx`

**Interfaces:**
- Consumes: 편집기에서 사용하는 AND/OR 명칭과 혈전 준비 상태 이름
- Produces: 플레이어가 그대로 따라 할 수 있는 두 블록 구성 안내

- [ ] **Step 1: 실패하는 설명서 테스트 작성**

```tsx
expect(html).toContain("AND (모두 만족)");
expect(html).toContain("내 HP 50% 이상");
expect(html).toContain("혈전 준비 없음");
expect(html).toContain("혈전 준비 있음");
```

- [ ] **Step 2: 설명서 테스트가 새 안내 부재로 실패하는지 확인**

Run: `npx vitest run src/app/manual/current-content.test.tsx`

Expected: 복합 조건 예시 문자열을 찾지 못해 FAIL

- [ ] **Step 3: 설명서에 복합 조건과 혈전 순서 추가**

```tsx
<li>
  여러 조건은 <Em>AND (모두 만족)</Em> 또는 <Em>OR (하나 만족)</Em>으로
  최대 4개까지 묶을 수 있습니다. 예를 들어 「내 HP 50% 이상 AND 혈전 준비 없음
  → 혈전」을 위에, 「혈전 준비 있음 → 필살기」를 아래에 둡니다.
</li>
```

- [ ] **Step 4: 설명서 테스트 통과 확인**

Run: `npx vitest run src/app/manual/current-content.test.tsx`

Expected: PASS

### Task 3: 회귀 검증과 커밋

**Files:**
- Verify: `src/adventure/v2/combat/combatPattern.test.ts`
- Verify: all modified files

**Interfaces:**
- Consumes: Task 1~2의 UI/문서 변경
- Produces: 기존 복합 조건 파싱·평가가 보존된 검증 결과와 로컬 커밋

- [ ] **Step 1: 관련 테스트 전체 실행**

Run: `npx vitest run src/adventure/v2/combat/combatPattern.test.ts src/adventure/v2/V2CombatPatternView.test.tsx src/app/manual/current-content.test.tsx`

Expected: 모든 테스트 PASS

- [ ] **Step 2: 타입 검사와 diff 검사**

Run: `npx tsc --noEmit`

Expected: exit code 0

Run: `git diff --check`

Expected: 출력 없이 exit code 0

- [ ] **Step 3: 프로덕션 빌드**

Run: `npm run build`

Expected: 이미지 검사와 Next.js 빌드가 exit code 0

- [ ] **Step 4: 이번 작업 파일만 커밋**

```bash
git add \
  src/adventure/v2/V2CombatPatternView.test.tsx \
  src/adventure/v2/V2CombatPatternView.tsx \
  src/app/manual/current-content.test.tsx \
  src/app/manual/content/skills.tsx \
  docs/superpowers/plans/2026-08-26-combat-pattern-and-discovery.md
git commit -m "feat: clarify AND conditions in combat patterns"
```
