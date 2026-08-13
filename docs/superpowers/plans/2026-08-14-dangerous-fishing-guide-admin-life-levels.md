# Dangerous Fishing Guide and Admin Life Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위험 해역 이용법을 게임 안과 매뉴얼에 안내하고, 심의용 OP 세팅이 생활 콘텐츠 5종을 Lv.50으로 보정하게 한다.

**Architecture:** 정적 안내는 기존 위험 해역 Client Component와 매뉴얼 Server Component에 추가한다. 생활 레벨 보정은 순수 프리셋 빌더에서 각 저장값을 정규화·상향하고, 기존 최고 관리자 전용 API 트랜잭션이 다섯 키를 함께 잠그고 저장한다.

**Tech Stack:** Next.js App Router, React, TypeScript, Drizzle ORM, Vitest, `react-dom/server`

## Global Constraints

- 운영 배포와 점검 모드 변경은 하지 않는다.
- 기존 생활 기록·보유품·진행 상태와 Lv.50보다 높은 경험치는 보존한다.
- 위험 해역 안내 표면은 `SURFACE_CARD` 또는 `SURFACE_INSET`을 사용한다.
- 서브에이전트 없이 현재 세션에서 순서대로 실행한다.

---

### Task 1: 위험 해역 초보 안내

**Files:**
- Modify: `src/adventure/v2/DangerousFishingView.test.tsx`
- Modify: `src/adventure/v2/DangerousFishingView.tsx`
- Modify: `src/app/manual/current-content.test.tsx`
- Modify: `src/app/manual/content/pastimes.tsx`

**Interfaces:**
- Consumes: 기존 `DangerousFishingView`, 매뉴얼 primitive와 위험 해역 데이터 카탈로그
- Produces: 화면의 접이식 초보 가이드와 매뉴얼의 `위험 해역 낚시` 절

- [ ] **Step 1: Write the failing tests**

  화면 테스트는 행동 대응표, 두 게이지 0 조건, 안전 귀환 문구를 요구한다. 매뉴얼 테스트는 Lv.15, 전용 장비, 위험도 3~5 사고 확률과 화물 확정을 요구한다.

- [ ] **Step 2: Run tests to verify RED**

  Run: `npm test -- src/adventure/v2/DangerousFishingView.test.tsx src/app/manual/current-content.test.tsx`

- [ ] **Step 3: Add the guide and manual section**

  `DangerousFishingView`에 기본 닫힘 `details` 가이드를 추가하고, `PastimesContent`에 행동 대응표·게이지·귀환·전용 장비·거대어 규칙을 추가한다.

- [ ] **Step 4: Run tests to verify GREEN**

  Run: `npm test -- src/adventure/v2/DangerousFishingView.test.tsx src/app/manual/current-content.test.tsx`

### Task 2: 심의용 OP 생활 만렙

**Files:**
- Modify: `src/lib/server/reviewAdminOpPreset.test.ts`
- Modify: `src/lib/server/reviewAdminOpPreset.ts`
- Modify: `src/app/api/admin/users/review-op-preset/route.test.ts`
- Modify: `src/app/api/admin/users/review-op-preset/route.ts`
- Modify: `src/admin/tabs/users/ReviewOpPresetSection.test.tsx`
- Modify: `src/admin/tabs/users/ReviewOpPresetSection.tsx`
- Modify: `src/admin/tabs/UsersTab.tsx`

**Interfaces:**
- Produces: `buildReviewAdminLifePreset(raw, nowMs)`와 응답 `lifeLevels`
- Consumes: 5종 생활 파서·레벨 상한·경험치 임계값 함수

- [ ] **Step 1: Write the failing builder and route tests**

  낮은 경험치는 Lv.50 임계값으로 오르고, 높은 경험치·기존 기록은 보존되며, API가 다섯 생활 키를 잠그고 저장하는지 검증한다.

- [ ] **Step 2: Run tests to verify RED**

  Run: `npm test -- src/lib/server/reviewAdminOpPreset.test.ts src/app/api/admin/users/review-op-preset/route.test.ts src/admin/tabs/users/ReviewOpPresetSection.test.tsx`

- [ ] **Step 3: Implement the life preset and transaction writes**

  다섯 저장값을 정규화해 경험치만 상향하고, 기존 OP 프리셋 트랜잭션에서 함께 잠금·업서트한다. UI 설명과 완료 토스트에 생활 Lv.50을 표시한다.

- [ ] **Step 4: Run tests to verify GREEN**

  Run: `npm test -- src/lib/server/reviewAdminOpPreset.test.ts src/app/api/admin/users/review-op-preset/route.test.ts src/admin/tabs/users/ReviewOpPresetSection.test.tsx`

### Task 3: 전체 검증과 커밋

**Files:**
- Verify all modified files

- [ ] **Step 1: Run focused tests**

  Run: `npm test -- src/adventure/v2/DangerousFishingView.test.tsx src/app/manual/current-content.test.tsx src/lib/server/reviewAdminOpPreset.test.ts src/app/api/admin/users/review-op-preset/route.test.ts src/admin/tabs/users/ReviewOpPresetSection.test.tsx`

- [ ] **Step 2: Run static and build verification**

  Run: `npx tsc --noEmit`

  Run: `npm run build`

- [ ] **Step 3: Review and commit**

  변경 파일만 스테이징해 `feat: guide dangerous fishing and max admin life levels`로 커밋한다.

