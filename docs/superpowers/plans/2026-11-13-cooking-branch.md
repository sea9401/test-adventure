# 요리 특화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전문 분야 랭크 5 요리사가 분야 안의 특화 하나를 골라 숙련을 쌓고, 특화 계열 음식의 걸작 확률 보너스와 특화 전용 요리 3종을 얻게 한다.

**Architecture:** 특화 규칙(`cooking/branch.ts`)과 전용 요리 정의(`cooking/branchRecipes.ts`)는 서버 전용 모듈에 의존하지 않는 순수 모듈로 두어 화면이 직접 읽는다. 전용 요리는 연구 대상 목록(`COOKING_PUBLIC_RECIPES`)에는 넣지 않고 id 조회 맵 두 개에만 넣어, 음식 정의·효과·거래·납품이 기존 경로로 동작하게 한다. 상태는 `cooking.v2`의 선택 필드 하나다.

**Tech Stack:** Next.js App Router(이 저장소의 변경된 판, 기존 요리 라우트 형식을 따른다), TypeScript, vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-13-cooking-branch-design.md`

## Global Constraints

- 특화 14개, id와 조리법 구성은 설계 문서 1절 표 그대로.
- 선택 조건: 전문 숙련 1,500 이상(랭크 5)이고 특화의 분야가 자기 전문 분야와 같다.
- 변경 대기: 처음 고를 때 없음. 바꾼 시각부터 `14 × 86_400_000`ms 동안 다시 바꿀 수 없다.
- 랭크 누적 요구량 `[0, 1_000, 3_000, 7_000, 15_000]`. 특화를 고르지 않았으면 랭크 0.
- 특화 숙련: 지금 고른 특화에 속한 음식 1개당 `tier × 10`.
- 걸작 확률 보너스: `rank × 2`%p. 상한 75%와 성능 상한, 음식 id 형식은 건드리지 않는다.
- 전용 요리 42종: 요구 랭크 1·3·5 = 티어 3·4·5, `requiredLevel` 20, `discovery: "branch"`. 이름·효과·재료는 설계 문서 5절 표 그대로.
- `COOKING_PUBLIC_RECIPES`는 500종 그대로. 전용 요리는 `discoveredRecipeIds`에 넣지 않는다.
- 클라이언트 컴포넌트에서 `cooking/catalog`(server-only)나 `@/adventure/v2/lifeMajor`를 값으로 import하지 않는다.
- 화면 표면은 `SURFACE_CARD`·`SURFACE_INSET`, 버튼은 `Button`, 선택지는 `ChoiceButton`. 12px 미만 글씨 금지.
- 플레이어 노출 문구에 마크다운·대시·개발 용어("branch")를 쓰지 않는다. 화면 용어는 "특화"다.

## Review Focus

- `branch` 필드가 없는 기존 세이브로 제작하면 품질 확률과 결과가 이전과 같아야 한다 → Task 4.
- 전문 분야와 다른 분야의 특화가 세이브에 들어 있으면 고르지 않은 것으로 읽어야 한다 → Task 3.
- 특화를 바꾼 직후 이전 특화의 전용 요리는 숙련이 랭크 5여도 만들 수 없어야 한다 → Task 4.
- 전용 요리의 재료 조합을 연구에 넣어도 전용 요리가 발견되거나 `discoveredRecipeIds`에 들어가면 안 된다 → Task 4.
- 다른 사람이 만든 전용 요리 음식을 가진 사람이 그 음식을 쓰고, 납품하고, 조회할 때 오류가 없어야 한다(음식 정의 조회) → Task 2.

---

### Task 1: 특화 규칙

**Files:** Create `src/adventure/v2/cooking/branch.ts`, `src/adventure/v2/cooking/branch.test.ts`

**Interfaces — Produces:**
- `type CookingBranchId` (14개 리터럴), `type CookingBranch = { id; field: CookingField; name: string; methods: readonly CookingMethod[] }`
- `COOKING_BRANCHES: readonly CookingBranch[]`, `COOKING_BRANCH_BY_ID: Map`, `isCookingBranchId(value: unknown)`
- `COOKING_BRANCH_UNLOCK_SPECIALTY_XP = 1_500`, `COOKING_BRANCH_CHANGE_COOLDOWN_MS`, `COOKING_BRANCH_MAX_RANK = 5`, `COOKING_BRANCH_RANK_XP = [0, 1_000, 3_000, 7_000, 15_000]`, `COOKING_BRANCH_MASTERPIECE_PCT_PER_RANK = 2`, `COOKING_BRANCH_DISH_RANKS = [1, 3, 5]`
- `type CookingBranchState = { current: CookingBranchId | null; xp: Partial<Record<CookingBranchId, number>>; changedAt: number | null }`
- `emptyCookingBranchState()`, `parseCookingBranchState(raw: unknown, specialtyField: CookingField | null): CookingBranchState`
- `cookingBranchRankForXp(xp: number): 1 | 2 | 3 | 4 | 5`, `cookingBranchNextRankXp(xp: number): number | null`
- `cookingBranchRank(state: CookingBranchState): number` (없으면 0), `cookingBranchMasterpieceBonusPct(rank: number): number`
- `cookingBranchCovers(branch: CookingBranch, recipe: { field: CookingField; method: CookingMethod }): boolean`
- `cookingBranchesForField(field: CookingField): CookingBranch[]`
- `cookingBranchNextChangeAt(state: CookingBranchState): number | null`
- `type CookingBranchChooseError = "branch_locked" | "invalid_branch" | "branch_unchanged" | "branch_cooldown"`
- `chooseCookingBranch(args: { state: CookingBranchState; specialty: { field: CookingField; xp: number } | null; branchId: unknown; now: number }): CookingBranchState` — 오류는 `new Error(code)`.
- `addCookingBranchXp(state: CookingBranchState, amount: number): CookingBranchState`

- [ ] 테스트 작성: 14개와 분야별 구성(화덕 3, 냄비 2, 제과 3, 해산물 3, 약선 3), 조리법 구성 표 일치, 랭크 경계(0→1, 999→1, 1,000→2, 2,999→2, 3,000→3, 6,999→3, 7,000→4, 14,999→4, 15,000→5, 999,999→5), 다음 랭크 요구량, 속함 판정(제과+오븐은 `baking_pastry`만, 냄비+찌기는 `pot_steam`, 제과+찌기는 `baking_steamed`), 파서(필드 없음, 모르는 id, 다른 분야 `current` → null, 음수·소수 숙련 정리), 선택 오류 4종, 처음 선택은 `changedAt` null 유지, 변경은 `changedAt = now`, 대기 경계(`now - changedAt === 14일`이면 가능, 1ms 모자라면 `branch_cooldown`), 숙련은 특화별 유지.
- [ ] 실패 확인 → 구현 → 통과 확인: `npx vitest run src/adventure/v2/cooking/branch.test.ts`
- [ ] 커밋: `feat: 요리 특화 규칙`

### Task 2: 전용 요리 42종과 조회 맵

**Files:** Create `src/adventure/v2/cooking/branchRecipes.ts`, `src/adventure/v2/cooking/branchRecipes.test.ts`. Modify `src/adventure/v2/cooking/types.ts`, `src/adventure/v2/cooking/catalog.ts`, `src/lib/server/cooking/recipes.ts`. Test `src/lib/server/cooking/recipes.test.ts`.

**Interfaces — Produces:**
- `types.ts`: `CookingDiscoveryClass`에 `"branch"`, `CookingRecipePublic.requiredLevel`은 그대로(20 사용).
- `type CookingBranchRecipe = CookingRecipeSecret & { branchId: CookingBranchId; requiredRank: 1 | 3 | 5 }`
- `COOKING_BRANCH_RECIPES: readonly CookingBranchRecipe[]` (42), `COOKING_BRANCH_RECIPE_BY_ID: Map`, `cookingBranchRecipesFor(branchId): CookingBranchRecipe[]` (요구 랭크 오름차순)
- `catalog.ts`: `COOKING_PUBLIC_RECIPE_BY_ID`가 전용 요리 공개 필드도 돌려준다.
- `recipes.ts`: `COOKING_SECRET_RECIPE_BY_ID`가 전용 요리도 돌려준다. `COOKING_SECRET_RECIPES`, 연구 정답 표, `validateCookingRecipeCatalog`는 500종 그대로.

- [ ] 테스트 작성: 42종·특화마다 3종, 요구 랭크↔티어, `requiredLevel` 20, `discovery` "branch", id가 `branch_<branchId>_<1|2|3>`, id·이름이 500종과 겹치지 않음, 조리법이 특화에 속함, 재료 칸 수(4, 5, 5)와 수량 규칙(작물·목장 12/15/18, 주방 3/6/6, 어획물 3/3/6, 희귀 2는 랭크 5에만 1칸), 효과가 설계 표와 일치(특화별 주·보조 수치 전부), `effectTags` 비어 있지 않음, `craftXp = tier × 20`, `imageSrc` 경로 형식. `recipes.test.ts`에 조회 맵 두 개가 전용 요리를 돌려주고 `findSecretRecipe`가 전용 요리 조합으로 전용 요리를 돌려주지 않으며 `COOKING_PUBLIC_RECIPES.length === 500`인지. `food.ts`의 `cookingFoodDefinition("food2:branch_hearth_grill_3:masterpiece:o0:s5")`가 공격력 405를 돌려주는지.
- [ ] 실패 확인 → 구현 → 통과 확인: `npx vitest run src/adventure/v2/cooking src/lib/server/cooking`
- [ ] 커밋: `feat: 요리 특화 전용 요리 42종`

### Task 3: 상태와 서버 로직

**Files:** Modify `src/adventure/v2/cooking/state.ts`. Create `src/lib/server/cooking/branch.ts`, `src/lib/server/cooking/branch.test.ts`. Test `src/adventure/v2/cooking/state.test.ts`(없으면 기존 상태 테스트 파일에 추가).

**Interfaces — Produces:**
- `CookingStateV2.branch?: CookingBranchState` — `parseCookingState`가 `parseCookingBranchState(source.branch, specialty?.field ?? null)`로 읽고, 고른 적도 숙련도 없으면 필드를 넣지 않는다.
- `server/cooking/branch.ts`:
  - `cookingBranchCraftContext(cooking: CookingStateV2, recipe: CookingRecipeSecret): { allowed: boolean; covered: boolean; masterpieceBonusPct: number; branchXpPerDish: number }` — `allowed`는 전용 요리가 아니면 true, 전용 요리면 지금 고른 특화의 요리이고 랭크가 요구 랭크 이상일 때 true. `covered`는 지금 고른 특화에 속한 음식인지.
  - `applyCookingBranchCraft(cooking, recipe, quantity): CookingStateV2`
  - `applyCookingBranchChoice(cooking, branchId: unknown, now): CookingStateV2`
  - `cookingBranchView(cooking, now): CookingBranchView` (설계 9절 모양), `type CookingBranchView`는 `cooking/clientTypes.ts`에 둔다.

- [ ] 테스트 작성 → 실패 확인 → 구현 → 통과 확인
- [ ] 커밋: `feat: 요리 특화 상태와 서버 판정`

### Task 4: 라우트 연결

**Files:** Modify `src/app/api/v2/cooking/route.ts`, `src/adventure/v2/cooking/clientTypes.ts`. Test `src/app/api/v2/cooking/route.test.ts`.

- [ ] 테스트 작성: `choose_branch` 성공·오류 4종, 전용 요리 제작(성공 시 음식 지급·재료 3배 차감·특화 숙련 증가·전문 숙련도 증가, 다른 특화·랭크 부족·특화 없음은 `recipe_locked`), 속한 기존 음식 제작 시 특화 숙련 증가와 속하지 않는 음식은 불변, 걸작 보너스(`Math.random` 고정으로 보너스 유무에 따라 품질이 갈리는 값), `branch` 없는 세이브의 제작 결과 불변, 전용 요리 조합 연구가 전용 요리를 발견하지 않음, 조회 응답 `branch`와 `recipeTotal === 500`.
- [ ] 구현: 허용 동작 목록에 `choose_branch`, 제작 조건을 `cookingBranchCraftContext`로 분기, `masterpieceChancePct`에 보너스 합산, 제작 뒤 `applyCookingBranchCraft`, 전용 요리는 요리 도감 숙련 이벤트를 내지 않음, 제작 결과에 `recipeName`, 응답에 `branch`, 오류 코드 목록에 4종 추가.
- [ ] 통과 확인: `npx vitest run src/app/api/v2/cooking src/lib/server/cooking`
- [ ] 커밋: `feat: 요리 특화 선택과 전용 요리 제작 API`

### Task 5: 화면

**Files:** Create `src/adventure/v2/cooking/CookingBranchPanel.tsx`, `CookingBranchPanel.test.tsx`. Modify `src/adventure/v2/CookingPanel.tsx`(전문 분야 구역에 패널 추가, 결과·오류 문구).

- [ ] 테스트 작성: 조건 미달 문구, 고르기 전 선택지(자기 분야 특화만, 전용 요리 이름과 효과), 선택 확인 뒤 `mutate({ action: "choose_branch", branchId })`, 고른 뒤 랭크·숙련 진행·걸작 보너스 표시, 전용 요리 3줄(재료 보유/필요, 부족 시 붉은 글자와 버튼 비활성, 랭크 부족 시 요구 랭크 문구), 제작 시 `mutate({ action: "craft", recipeId, quantity })`, 변경 대기 날짜 표시.
- [ ] 구현 → 통과 확인: `npx vitest run src/adventure/v2/cooking src/adventure/v2/CookingPanel`
- [ ] 커밋: `feat: 요리 특화 화면`

### Task 6: 그림 42장

**Files:** Create `public/images/items/cooking/branch_*.webp` 42장, `docs/asset-provenance-cooking-branch-2026-11-13.md`. Modify 권리 대장(전투 준비물 아이콘 때 갱신한 파일). Test `src/adventure/v2/cooking/branchRecipes.test.ts`에 그림 파일 존재 검사 추가.

- [ ] 기존 요리 그림의 크기·화풍 확인, 같은 조건으로 42장 생성, `npm run optimize-images`, `npm run check-images`, `npm run check-asset-rights`
- [ ] 커밋: `feat: 요리 특화 전용 요리 그림 42종`

### Task 7: 매뉴얼, 기록, 전체 검증

**Files:** Modify `src/app/manual/content/pastimes.tsx`. Create `docs/content-modification-records/2026-11-13-cooking-branch.md`, `src/app/dev/cooking-branch/page.tsx`(미리보기), `src/app/dev/page.tsx`.

- [ ] 매뉴얼: 요리 항목에 특화 규칙과 전용 요리 표(상수에서 생성).
- [ ] 전체 검증: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`, 바뀐 파일 eslint, `npx vitest run --maxWorkers=4`, `npm run check-module-budgets`, 화면 규칙 스캔, dev 서버에서 390·1280 폭과 라이트·다크 확인.
- [ ] 커밋: `docs: 요리 특화 매뉴얼과 수정 기록`
