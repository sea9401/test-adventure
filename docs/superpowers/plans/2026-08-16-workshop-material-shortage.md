# Workshop Material Shortage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 길드 제작소의 일반·명장 제작 재료 중 부족한 항목을 필요량과 보유량으로 즉시 식별할 수 있게 한다.

**Architecture:** 기존 서버 응답의 모드별 `materialCost`와 워크숍 `materials`를 표시 시점에 비교하는 작은 렌더링 컴포넌트를 `WorkshopCraftPanel`에 추가한다. 제작 가능 판정과 서버 요청 계약은 그대로 유지하고, 과거 응답에는 기존 `costText`로 폴백한다.

**Tech Stack:** Next.js 16.2 Client Components, React 19, Tailwind CSS 4, Vitest

## Global Constraints

- 어떤 환경에도 배포하지 않는다.
- 일반 제작과 명장 제작 모두에 같은 표시 규칙을 적용한다.
- 부족 상태를 색상만으로 표현하지 않고 `필요`, `보유`, `부족` 문구를 함께 표시한다.
- 제작 비용, 가능 여부, 상위 재료 대체, API 및 저장 데이터는 변경하지 않는다.

---

### Task 1: 모드별 부족 재료 표시

**Files:**
- Modify: `src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`
- Modify: `src/adventure/v2/guild/WorkshopCraftPanel.tsx`

**Interfaces:**
- Consumes: `WorkshopRecipeView.materialCost`, `WorkshopRecipeView.masterwork.materialCost`, `WorkshopState.materials`, `guildWorkshopMaterialName(id)`.
- Produces: `WorkshopMaterialCostText({ materialCost, materials, fallbackText })` 렌더링 컴포넌트.

- [ ] **Step 1: 실패하는 회귀 테스트 작성**

  `crafted_toxic_mist_gloves` 레시피를 충분한 숙련도와 제작소 레벨로 뷰로 만든다.
  미스릴 조각은 필요량보다 적게, 태양석은 충분히 보유한 상태로 정적 렌더링해 일반
  제작의 `미스릴 조각 2 (필요 2 · 보유 1 · 부족)`은 장미색 강조를 갖고
  `태양석 1`은 부족 문구가 없는지 검증한다. 같은 보유량에서 명장 제작은 두 배가 된
  `태양석 2 (필요 2 · 보유 1 · 부족)`을 표시하는지도 검증한다.

- [ ] **Step 2: 테스트 실패 확인**

  Run: `npm test -- src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

  Expected: 기존 문자열 표시에는 필요량·보유량·부족 문구가 없어 새 테스트가 실패한다.

- [ ] **Step 3: 최소 구현**

  `WorkshopCraftPanel.tsx`에서 `guildWorkshopMaterialName`을 가져온다.
  `WorkshopMaterialCostText`는 `materialCost`의 각 항목을 순회하고, 정수로 정규화한
  필요량과 보유량을 비교한다. 부족 항목에는
  `font-semibold text-rose-700 dark:text-rose-300`을 적용하고
  `재료명 필요량 (필요 N · 보유 M · 부족)`을 렌더링한다. 충분한 항목은 기존
  `재료명 필요량` 형태로 두며 항목 사이에는 ` · `를 둔다. 비용 맵이 비어 있으면
  `fallbackText`를 반환한다. 일반·명장 재료 줄에서 각각의 비용 맵을 넘긴다.

- [ ] **Step 4: 관련 검증 실행**

  Run: `npm test -- src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

  Expected: 12개 이상의 테스트가 모두 통과한다.

  Run: `npx eslint src/adventure/v2/guild/WorkshopCraftPanel.tsx src/adventure/v2/guild/WorkshopCraftPanel.test.tsx`

  Expected: 오류와 경고 없이 종료한다.

  Run: `npx tsc --noEmit`

  Expected: 타입 오류 없이 종료한다.

- [ ] **Step 5: 커밋**

  ```bash
  git add docs/superpowers/specs/2026-08-16-workshop-material-shortage-design.md docs/superpowers/plans/2026-08-16-workshop-material-shortage.md src/adventure/v2/guild/WorkshopCraftPanel.tsx src/adventure/v2/guild/WorkshopCraftPanel.test.tsx
  git commit -m "feat: show workshop material shortages"
  ```
