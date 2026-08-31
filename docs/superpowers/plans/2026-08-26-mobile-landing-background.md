# Mobile Landing Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 로그인 대문에서 가로형 지역 이미지의 전체 구도를 보존하면서 배경 영역을 빈틈없이 채운다.

**Architecture:** 각 슬라이드의 전환 투명도는 래퍼가 담당한다. 모바일에서는 어두운 `cover` 배경과 선명한 `contain` 장면을 겹치고, `sm` 이상에서는 장면 레이어만 기존 `cover` 방식으로 표시한다.

**Tech Stack:** Next.js App Router, React, `next/image`, Tailwind CSS, Vitest

## Global Constraints

- 배포하지 않는다.
- 새 이미지 자산과 의존성을 추가하지 않는다.
- 슬라이드 순서, 전환, 오류 처리, 캡션 동작을 유지한다.

---

### Task 1: 모바일 배경 구도 보존

**Files:**
- Modify: `src/app/sign-in/LandingBackgroundSlideshow.tsx`
- Test: `src/app/sign-in/LandingBackgroundSlideshow.test.tsx`

**Interfaces:**
- Consumes: 기존 `LANDING_SLIDES` 데이터와 `next/image`의 `fill` 렌더링
- Produces: 모바일 `mobile-backdrop` 레이어와 반응형 `scene` 레이어를 포함하는 `LandingBackgroundSlideshow()`

- [ ] **Step 1: 실패하는 회귀 테스트 작성**

  정적 마크업에서 `data-landing-image-layer="mobile-backdrop"` 레이어가 모바일 전용 `object-cover`이고, `data-landing-image-layer="scene"` 레이어가 `object-contain sm:object-cover`인지 검증한다.

- [ ] **Step 2: 테스트 실패 확인**

  Run: `npm test -- src/app/sign-in/LandingBackgroundSlideshow.test.tsx`

  Expected: `mobile-backdrop` 또는 `object-contain` 레이어가 없어 FAIL.

- [ ] **Step 3: 최소 구현**

  각 슬라이드를 전환 래퍼로 감싸고 그 안에 모바일 전용 어두운 `cover` 이미지와 반응형 `contain`/`cover` 장면 이미지를 렌더링한다. 이미지 실패 처리는 장면 레이어에만 유지한다.

- [ ] **Step 4: 관련 검증 실행**

  Run: `npm test -- src/app/sign-in/LandingBackgroundSlideshow.test.tsx src/app/sign-in/LandingContent.test.tsx`

  Expected: 두 테스트 파일 모두 PASS.

  Run: `npx eslint src/app/sign-in/LandingBackgroundSlideshow.tsx src/app/sign-in/LandingBackgroundSlideshow.test.tsx`

  Expected: 오류 없이 종료.

  Run: `npx tsc --noEmit`

  Expected: 오류 없이 종료.

- [ ] **Step 5: 커밋**

  ```bash
  git add src/app/sign-in/LandingBackgroundSlideshow.tsx src/app/sign-in/LandingBackgroundSlideshow.test.tsx
  git commit -m "fix: preserve landing art on mobile"
  ```
