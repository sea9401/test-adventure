# Cooking Recipe XP Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개인 주방 요리 카드마다 현재 캐릭터가 요리 1개 제작 시 받을 수 있는 요리 경험치를 안내한다.

**Architecture:** 서버의 `cookingXpReward`를 두 개의 고정 RNG 경계로 호출하는 순수 미리보기 함수를 추가해 실제 가능한 최솟값·최댓값을 계산한다. 요리 카드는 기존 `adjustedCookingXp`로 현재 레벨 감쇠를 적용하고 GET 응답의 직업·스킬 보너스를 합산해 이 범위를 렌더링한다.

**Tech Stack:** TypeScript, React 19 Client Components, Next.js 16.2.11 App Router, Vitest 4

## Global Constraints

- 표시는 현재 레벨 기준 1개 제작 경험치다.
- 레시피 경험치 감쇠, 요리 직업 2차 이상 +10%, 장착 스킬 경험치 보너스를 반영한다.
- 가능한 값이 하나면 `+N`, 확률 반올림으로 둘이면 `+N~M`으로 표시한다.
- 여러 개 조리의 총 경험치를 1개 경험치의 단순 곱으로 표시하지 않는다.
- 주문 납품과 실제 서버 지급 로직, API 응답 구조는 변경하지 않는다.
- 기존 불투명 요리 카드 표면과 라이트·다크 모드 색상을 유지한다.
- 기존 작업 트리 변경을 보존하며 배포하지 않는다.

---

### Task 1: 실제 지급 범위 계산

**Files:**
- Modify: `src/adventure/v2/cooking.ts`
- Test: `src/adventure/v2/cooking.test.ts`

**Interfaces:**
- Consumes: `cookingXpReward({ baseXp, bonusPct, rng })`
- Produces: `cookingXpRewardRange({ baseXp, bonusPct }): { min: number; max: number }`

- [ ] **Step 1: 가능한 경험치 범위의 실패 테스트 작성**

```ts
expect(cookingXpRewardRange({ baseXp: 12 })).toEqual({ min: 12, max: 12 });
expect(cookingXpRewardRange({ baseXp: 12, bonusPct: 25 })).toEqual({ min: 15, max: 15 });
expect(cookingXpRewardRange({ baseXp: 12, bonusPct: 15 })).toEqual({ min: 13, max: 14 });
expect(cookingXpRewardRange({ baseXp: -3, bonusPct: -10 })).toEqual({ min: 1, max: 1 });
```

- [ ] **Step 2: 테스트가 함수 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/cooking.test.ts`

Expected: `cookingXpRewardRange`가 없어 FAIL.

- [ ] **Step 3: 서버 지급 함수를 재사용하는 최소 구현**

```ts
export function cookingXpRewardRange(args: {
  baseXp: number;
  bonusPct?: number;
}): { min: number; max: number } {
  return {
    min: cookingXpReward({ ...args, rng: () => 1 }),
    max: cookingXpReward({ ...args, rng: () => 0 }),
  };
}
```

- [ ] **Step 4: 순수 계산 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/cooking.test.ts`

Expected: PASS.

### Task 2: 요리 카드 안내

**Files:**
- Modify: `src/adventure/v2/CookingPanel.tsx`
- Test: `src/adventure/v2/CookingPanel.test.tsx`

**Interfaces:**
- Consumes: `CookingRecipe`, 현재 요리 레벨, 직업·스킬 합산 경험치 보너스, `cookingXpRewardRange`
- Produces: `CookingRecipeXpPreview` 컴포넌트와 요리 카드의 `제작 XP · 1개당 +N[~M]` 문구

- [ ] **Step 1: 감쇠와 보너스를 반영한 실패 테스트 작성**

```tsx
const html = renderToStaticMarkup(
  <CookingRecipeXpPreview
    recipe={COOKING_RECIPE_BY_ID.get("rustic_bread")!}
    currentLevel={11}
    bonusPct={15}
  />,
);
expect(html).toContain("제작 XP · 1개당 +3~4");
```

- [ ] **Step 2: 테스트가 컴포넌트 부재로 실패하는지 확인**

Run: `npx vitest run src/adventure/v2/CookingPanel.test.tsx`

Expected: `CookingRecipeXpPreview`가 없어 FAIL.

- [ ] **Step 3: 안내 컴포넌트와 카드 배치 구현**

```tsx
export function CookingRecipeXpPreview({ recipe, currentLevel, bonusPct }: {
  recipe: CookingRecipe;
  currentLevel: number;
  bonusPct: number;
}) {
  const range = cookingXpRewardRange({
    baseXp: adjustedCookingXp(recipe.requiredLevel, currentLevel, recipe.xp),
    bonusPct,
  });
  const amount = range.min === range.max
    ? `+${range.min}`
    : `+${range.min}~${range.max}`;
  return <div>제작 XP · 1개당 {amount}</div>;
}
```

요리 카드의 재료 문구 다음, 음식 효과 문구 전에 렌더링하고 `bonusPct`에는 `(data.cookingJobTier >= 2 ? 10 : 0) + data.cookingSkillBonuses.xpBonusPct`를 전달한다.

- [ ] **Step 4: 카드 안내 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/CookingPanel.test.tsx`

Expected: PASS.

### Task 3: 검증과 커밋

**Files:**
- Modify: 위 네 코드·테스트 파일과 설계·계획 문서만

**Interfaces:**
- Consumes: Task 1·2의 완료된 변경
- Produces: 전체 검증을 마친 현재 브랜치 기능 커밋

- [ ] **Step 1: 관련 테스트와 정적 검사 실행**

Run: `npx vitest run src/adventure/v2/cooking.test.ts src/adventure/v2/CookingPanel.test.tsx`

Run: `npx tsc --noEmit`

Run: `npx eslint src/adventure/v2/cooking.ts src/adventure/v2/cooking.test.ts src/adventure/v2/CookingPanel.tsx src/adventure/v2/CookingPanel.test.tsx`

Expected: 모든 명령이 exit code 0.

- [ ] **Step 2: 전체 테스트와 변경 범위 확인**

Run: `npm test`

Run: `git diff --check && git diff --stat && git status --short`

Expected: 전체 테스트가 PASS하고 기존 전투 로그 변경 및 `NUL`, `_workspace/`는 이번 커밋 대상에서 제외된다.

- [ ] **Step 3: 격리 worktree에서 기능 커밋 생성**

```bash
git add docs/superpowers/specs/2026-08-14-cooking-recipe-xp-preview-design.md docs/superpowers/plans/2026-08-14-cooking-recipe-xp-preview.md src/adventure/v2/cooking.ts src/adventure/v2/cooking.test.ts src/adventure/v2/CookingPanel.tsx src/adventure/v2/CookingPanel.test.tsx
git commit -m "feat: show cooking xp on recipe cards"
```

기능 커밋을 현재 브랜치에 적용한 뒤 기존 사용자 변경이 unstaged 상태로 보존됐는지 확인한다.
