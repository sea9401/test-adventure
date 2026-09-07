# Batch Cooking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 요리 도감에서 1~20개를 한 요청으로 조리하고 각 완성 음식의 품질을 독립적으로 판정한다.

**Architecture:** 기존 `POST /api/v2/cooking`의 `craft` 트랜잭션과 수량 제한을 재사용한다. 서버는 수량만큼 품질을 판정해 품질별 재고와 통계를 갱신하고, 클라이언트는 레시피별 수량 입력과 품질별 완료 요약을 제공한다.

**Tech Stack:** Next.js 16 Route Handlers, React 19, TypeScript, Vitest, Testing Library, Tailwind CSS

## Global Constraints

- 조리 수량은 정수 1~20이다.
- 일괄 조리는 단일 API 요청과 단일 DB 트랜잭션으로 처리한다.
- 각 음식의 품질은 독립적으로 판정한다.
- `SURFACE_CARD`와 `SURFACE_INSET` 기반 불투명 표면 및 라이트·다크 입력 배경을 유지한다.
- 배포와 점검 모드 변경은 수행하지 않는다.
- 현재 브랜치에서 서브에이전트 없이 구현하고 검증한 뒤 커밋한다.

---

### Task 1: 서버의 품질별 일괄 조리

**Files:**
- Modify: `src/app/api/v2/cooking/route.test.ts`
- Modify: `src/app/api/v2/cooking/route.ts`

**Interfaces:**
- Consumes: 기존 `{ action: "craft", recipeId: string, quantity: number, usePrepSet?: boolean }` POST 본문
- Produces: `result.qualityCounts: Record<CookingQuality, number>`; 단일 조리는 기존 `result.quality`와 `result.foodId`도 유지

- [x] **Step 1: 독립 품질 판정 회귀 테스트 작성**

캐릭터를 `class: "survivor", specChoice: "masterchef"`로 설정하고 `v2c_masterchef_heatcontrol`을 장착해 걸작 5%, 직업 등급으로 정성작 15% 확률을 만든다. `Math.random()`이 `0.01`, `0.1`, `0.99`를 차례로 반환하도록 하고 `rustic_bread` 3개를 조리한다. 응답의 `qualityCounts`가 `{ masterpiece: 1, careful: 1, normal: 1 }`이고 각 품질 `CookingFoodId` 재고가 1개씩이며, `dishesCooked`는 3, `masterpiecesCooked`는 1인지 검증한다.

- [x] **Step 2: 새 테스트가 현재의 단일 품질 일괄 처리 때문에 실패하는지 확인**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts`

Expected: 품질별 재고 또는 `qualityCounts` assertion이 실패한다.

- [x] **Step 3: 수량별 품질 판정과 품질별 재고 합산 구현**

`route.ts`의 `craft` 분기에서 다음 형태로 품질 횟수와 결과 ID를 만든다.

```ts
const qualityCounts: Record<CookingQuality, number> = {
  normal: 0,
  careful: 0,
  masterpiece: 0,
};
let nextCookingFoods = inventory.cookingFoods;
let singleFoodId: CookingFoodId | null = null;
let singleQuality: CookingQuality | null = null;
for (let index = 0; index < quantity; index += 1) {
  const quality = rollCookingQuality(qualityArgs);
  const foodId = cookingFoodId({ recipeId: recipe.id, quality, originator, specialtyBonusPct });
  qualityCounts[quality] += 1;
  nextCookingFoods = addCookingFood(nextCookingFoods, foodId, 1);
  singleQuality = quality;
  singleFoodId = foodId;
}
```

재고를 `nextCookingFoods`로 저장하고 `masterpiecesCooked`에는 `qualityCounts.masterpiece`를 더한다. 결과에는 `qualityCounts`를 항상 넣고, `quantity === 1`일 때만 `quality`와 `foodId` 호환 필드를 spread로 넣는다.

- [x] **Step 4: API 테스트 통과 확인**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts`

Expected: PASS

- [x] **Step 5: 서버 변경 커밋**

```bash
git add src/app/api/v2/cooking/route.test.ts src/app/api/v2/cooking/route.ts
git commit -m "feat: roll batch cooking quality per dish"
```

### Task 2: 레시피별 수량 선택과 완료 요약

**Files:**
- Modify: `src/adventure/v2/cooking/CookingCodexPanel.test.tsx`
- Modify: `src/adventure/v2/cooking/CookingCodexPanel.tsx`
- Modify: `src/adventure/v2/CookingPanel.test.tsx`
- Modify: `src/adventure/v2/CookingPanel.tsx`

**Interfaces:**
- Consumes: `CookingMutation`과 서버 `result.qualityCounts`
- Produces: 레시피별 `조리 수량` 입력, `N개 조리` 버튼, `일반 N개 · 정성작 N개 · 걸작 N개` 완료 알림

- [x] **Step 1: 수량 입력 UI 회귀 테스트 작성**

첫 레시피의 `조리 수량` 입력을 3으로 변경하고 버튼 문구가 `3개 조리`가 되며 클릭 시 mutation이 정확히 한 번 아래 본문으로 호출되는지 검증한다.

```ts
expect(mutate).toHaveBeenCalledWith({
  action: "craft",
  recipeId: data.knownRecipes[0].id,
  quantity: 3,
  usePrepSet: false,
});
```

입력값 21은 20으로, 0은 1로 제한되는 사례도 같은 컴포넌트 테스트에서 검증한다.

- [x] **Step 2: 수량 UI 테스트 실패 확인**

Run: `npm test -- src/adventure/v2/cooking/CookingCodexPanel.test.tsx`

Expected: `조리 수량` 입력을 찾지 못해 FAIL

- [x] **Step 3: 레시피별 수량 상태와 입력 구현**

`CookingCodexPanel`에 `Record<string, number>` 상태와 다음 정규화 함수를 추가한다.

```ts
function clampCookingQuantity(raw: unknown): number {
  return Math.min(20, Math.max(1, Math.floor(Number(raw) || 1)));
}
```

각 발견 레시피 카드에서 `quantityByRecipe[recipe.id] ?? 1`을 사용한다. `조리 수량` number input에 `min={1}`, `max={20}`, 불투명 입력 배경을 적용하고 버튼 문구와 mutation의 `quantity`를 선택값으로 바꾼다. 접근 가능한 이름은 `${recipe.name} 조리 수량`으로 레시피마다 구분한다.

- [x] **Step 4: 품질별 완료 알림 테스트 작성 및 실패 확인**

`resultMessage`를 `cookingResultMessage`로 이름을 바꿔 export하고 `CookingPanel.test.tsx`에서 직접 검증한다. `{ normal: 2, careful: 1, masterpiece: 1 }`가 `4개 완성 · 일반 2개 · 정성작 1개 · 걸작 1개`를 포함하는지 확인한다. 기존 단일 품질 result는 기존 품질명을 표시하는 호환 사례로 보호한다.

Run: `npm test -- src/adventure/v2/CookingPanel.test.tsx`

Expected: 영어 품질 하나만 표시해 FAIL

- [x] **Step 5: 품질별 한국어 완료 요약 구현**

`CookingPanel.tsx`에서 `cookingQualityName`을 사용해 `qualityCounts`의 양수 정수 항목만 `normal`, `careful`, `masterpiece` 순으로 조합한다. `qualityCounts`가 없는 예전 단일 결과에는 유효한 `quality`를 한국어 품질명으로 표시하고, 잘못된 값은 `일반`로 대체한다.

- [x] **Step 6: 컴포넌트 테스트 통과 확인**

Run: `npm test -- src/adventure/v2/cooking/CookingCodexPanel.test.tsx src/adventure/v2/CookingPanel.test.tsx`

Expected: PASS

- [x] **Step 7: UI 변경 커밋**

```bash
git add src/adventure/v2/cooking/CookingCodexPanel.test.tsx src/adventure/v2/cooking/CookingCodexPanel.tsx src/adventure/v2/CookingPanel.test.tsx src/adventure/v2/CookingPanel.tsx
git commit -m "feat: add batch quantity to cooking codex"
```

### Task 3: 전체 검증

**Files:**
- Verify only

**Interfaces:**
- Consumes: Task 1~2의 서버 및 UI 변경
- Produces: 관련 테스트, 정적 검사, 이미지 참조 검사, diff 검사 결과

- [x] **Step 1: 관련 요리 테스트 실행**

Run: `npm test -- src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking/CookingCodexPanel.test.tsx src/adventure/v2/CookingPanel.test.tsx`

Expected: PASS

- [x] **Step 2: TypeScript와 변경 파일 ESLint 실행**

Run: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit`

Run: `npx eslint src/app/api/v2/cooking/route.ts src/app/api/v2/cooking/route.test.ts src/adventure/v2/cooking/CookingCodexPanel.tsx src/adventure/v2/cooking/CookingCodexPanel.test.tsx src/adventure/v2/CookingPanel.tsx src/adventure/v2/CookingPanel.test.tsx`

Expected: 두 명령 모두 exit 0

- [x] **Step 3: 이미지 참조와 diff 무결성 확인**

Run: `npm run check-images`

Run: `git diff --check HEAD~2..HEAD`

Expected: 이미지 참조 오류와 whitespace 오류 없음

- [x] **Step 4: 최종 상태와 커밋 기록 확인**

Run: `git status --short && git log -4 --oneline`

Expected: 작업 트리가 깨끗하고 설계·서버·UI 커밋이 존재한다.

## Verification Results

- 관련 요리 테스트: 3 files, 51 tests passed.
- TypeScript: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit` passed.
- 변경 파일 ESLint: passed.
- 이미지 참조: literal 429장과 template 8패턴 모두 일관됨.
- 모듈 예산: 12 files passed.
- 커밋 범위 whitespace 검사: passed.
