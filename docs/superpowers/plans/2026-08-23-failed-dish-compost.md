# 실패 음식 퇴비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실패 음식 3개를 기존 유기질 거름 1개로 바꾸는 생활 제작식을 추가한다.

**Architecture:** 제작식 카탈로그에는 선택적 실패 음식 비용을 선언하고, 생활 작업장 API가 `inventory.v2`의 실패 음식과 `life-workshop.v1`의 제작 결과를 한 트랜잭션에서 갱신한다. 기존 생활 제작 카드와 수량 컨트롤을 재사용하되 조회 응답에 실패 음식 보유량을 포함해 제작 가능량과 비용을 정확히 표시한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest

## Global Constraints

- 배포하지 않는다.
- 새 이미지 자산을 추가하지 않고 기존 `organic_fertilizer.webp`를 재사용한다.
- 콘텐츠 패널과 카드는 기존 불투명 `Card` 및 `SURFACE_INSET` 표면을 유지한다.
- 사용자나 다른 작업의 미커밋 변경을 커밋에 포함하지 않는다.

---

### Task 1: 제작식 계약과 서버 동작

**Files:**
- Modify: `src/adventure/v2/lifeCrafting.ts`
- Modify: `src/adventure/v2/lifeCrafting.test.ts`
- Modify: `src/app/api/v2/life-workshop/route.ts`
- Modify: `src/lib/server/lifeWorkshopRoute.test.ts`

**Interfaces:**
- Consumes: `inventory.v2.failedCookingDishes`, `LifeCraftingState`
- Produces: `LifeCraftingRecipe.failedDishCost?: number`, `WorkshopPayload.failedCookingDishes`, `organic_fertilizer`

- [ ] **Step 1: 실패하는 API 테스트 작성**

  `failed_dish_compost` 1회 제작이 실패 음식 3개를 차감하고 유기질 거름 1개를 지급하는지, 실패 음식 2개로는 409와 `not_enough_failed_dishes`를 반환하는지 테스트한다.

- [ ] **Step 2: RED 확인**

  Run: `npm test -- src/lib/server/lifeWorkshopRoute.test.ts`

  Expected: `failed_dish_compost` 제작식이 없어 `bad_craft_recipe` 또는 기대 결과 불일치로 실패한다.

- [ ] **Step 3: 최소 서버 구현**

  `LifeCraftingRecipe`에 `failedDishCost?: number`를 추가하고 다음 제작식을 카탈로그에 등록한다.

  ```ts
  {
    id: "failed_dish_compost",
    name: "실패 음식 퇴비",
    description: "실패한 요리를 발효해 유기질 거름으로 되살립니다.",
    image: "/images/items/life-aids/organic_fertilizer.webp",
    kind: "aid",
    outputId: "organic_fertilizer",
    outputAmount: 1,
    costs: {},
    failedDishCost: 3,
    requiredLevel: 1,
  }
  ```

  생활 작업장 조회와 제작 분기에 실패 음식 정규화, 최대 제작량 계산, 트랜잭션 차감과 저장을 추가한다. 일반 재료 비용이 빈 제작식도 무한대 대신 다른 비용 제한을 정상 적용하도록 계산한다.

- [ ] **Step 4: GREEN 확인**

  Run: `npm test -- src/adventure/v2/lifeCrafting.test.ts src/lib/server/lifeWorkshopRoute.test.ts`

  Expected: PASS

---

### Task 2: 생활 제작 화면 표시

**Files:**
- Modify: `src/adventure/v2/LifeWorkshopView.tsx`
- Modify: `src/adventure/v2/LifeWorkshopView.test.tsx`

**Interfaces:**
- Consumes: `WorkshopPayload.failedCookingDishes`, `LifeCraftingRecipe.failedDishCost`
- Produces: 실패 음식 비용·보유량 문구와 부족 오류 안내

- [ ] **Step 1: 실패하는 UI 테스트 작성**

  생활 제작 응답에 실패 음식 퇴비와 보유 실패 음식이 있을 때 비용 문구가 표시되고, `not_enough_failed_dishes`가 사용자 문구로 변환되는지 검증한다.

- [ ] **Step 2: RED 확인**

  Run: `npm test -- src/adventure/v2/LifeWorkshopView.test.tsx`

  Expected: 실패 음식 비용 또는 오류 문구가 없어 FAIL

- [ ] **Step 3: 최소 UI 구현**

  `WorkshopPayload`에 실패 음식 보유량을 추가하고 비용 표시 함수가 일반 재료 비용과 `실패 음식 N개 (보유 M개)`를 함께 렌더링하게 한다. 오류 코드에는 `실패 음식이 부족합니다.`를 연결한다.

- [ ] **Step 4: GREEN 확인**

  Run: `npm test -- src/adventure/v2/LifeWorkshopView.test.tsx`

  Expected: PASS

---

### Task 3: 회귀 검증과 커밋

**Files:**
- Verify only: all changed files

- [ ] **Step 1: 관련 테스트 실행**

  Run: `npm test -- src/adventure/v2/lifeCrafting.test.ts src/lib/server/lifeWorkshopRoute.test.ts src/adventure/v2/LifeWorkshopView.test.tsx src/app/api/v2/cooking/route.test.ts`

- [ ] **Step 2: 정적 검사 실행**

  Run: `npx eslint src/adventure/v2/lifeCrafting.ts src/adventure/v2/lifeCrafting.test.ts src/app/api/v2/life-workshop/route.ts src/lib/server/lifeWorkshopRoute.test.ts src/adventure/v2/LifeWorkshopView.tsx src/adventure/v2/LifeWorkshopView.test.tsx`

  Run: `npx tsc --noEmit`

  Run: `npm run check-images`

- [ ] **Step 3: 전체 테스트 실행**

  Run: `npm test`

- [ ] **Step 4: 변경 범위 검토 및 커밋**

  실패 음식 퇴비 관련 파일과 문서만 스테이징하고 다른 미커밋 변경을 제외한다.

  ```bash
  git commit -m "feat: recycle failed dishes into fertilizer"
  ```
