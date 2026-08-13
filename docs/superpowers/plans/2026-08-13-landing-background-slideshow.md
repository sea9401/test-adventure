# Landing Background Slideshow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 대문 첫 화면에 현재 게임이 사용하는 다섯 이미지를 자동 순환하는 배경 슬라이드로 표시해 서비스의 게임 정체성을 즉시 전달한다.

**Architecture:** `LandingContent`는 서버 컴포넌트로 유지하고, 상태·타이머·브라우저 API가 필요한 배경만 `LandingBackgroundSlideshow` 클라이언트 컴포넌트로 분리한다. 공개 이미지 경로와 표시 이름은 슬라이드 컴포넌트가 소유하며, 랜딩 본문은 불투명 표면 토큰을 사용해 이미지 로딩 및 대비와 독립적으로 동작한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, React server rendering tests, Playwright E2E

## Global Constraints

- 신규 이미지 생성이나 외부 이미지 도입 없이 `/images/ui/village.webp`, `battle.webp`, `fishing.webp`, `guild.webp`, `hunt.webp`만 재사용한다.
- 첫 이미지는 시작 마을이며 전환 주기는 6,000ms다.
- 실제 플레이 스크린샷으로 오해시키는 문구를 사용하지 않는다.
- 로그인·인증·추천 링크·약관 동의 동작은 변경하지 않는다.
- 이미지 위의 본문과 로그인 컨트롤은 `SURFACE_CARD` 기반 불투명 패널에 둔다.
- `prefers-reduced-motion: reduce`와 숨겨진 브라우저 탭에서는 자동 전환하지 않는다.
- 배포하지 않는다.

---

### Task 1: 배경 슬라이드 컴포넌트

**Files:**
- Create: `src/app/sign-in/LandingBackgroundSlideshow.tsx`
- Create: `src/app/sign-in/LandingBackgroundSlideshow.test.tsx`

**Interfaces:**
- Produces: `LANDING_SLIDES` 읽기 전용 배열
- Produces: `nextAvailableSlideIndex(currentIndex: number, failedIndexes: ReadonlySet<number>): number`
- Produces: `LandingBackgroundSlideshow(): JSX.Element`

- [ ] **Step 1: 정적 계약과 순환 규칙의 실패 테스트 작성**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LandingBackgroundSlideshow,
  nextAvailableSlideIndex,
} from "./LandingBackgroundSlideshow";

describe("대문 게임 이미지 슬라이드", () => {
  it("게임에서 사용하는 다섯 이미지를 시작 마을부터 제공한다", () => {
    const html = renderToStaticMarkup(<LandingBackgroundSlideshow />);
    expect(html).toContain('/images/ui/village.webp');
    expect(html).toContain('/images/ui/battle.webp');
    expect(html).toContain('/images/ui/fishing.webp');
    expect(html).toContain('/images/ui/guild.webp');
    expect(html).toContain('/images/ui/hunt.webp');
    expect(html).toContain('aria-label="시작 마을 이미지 보기"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("게임에서 사용하는 지역 이미지");
    expect(html).not.toContain("실제 게임 화면");
  });

  it("실패한 이미지를 건너뛰고 끝에서 처음으로 순환한다", () => {
    expect(nextAvailableSlideIndex(0, new Set([1, 2]))).toBe(3);
    expect(nextAvailableSlideIndex(4, new Set())).toBe(0);
    expect(nextAvailableSlideIndex(2, new Set([0, 1, 2, 3, 4]))).toBe(2);
  });
});
```

- [ ] **Step 2: 테스트가 컴포넌트 부재로 실패하는지 확인**

Run: `npm test -- src/app/sign-in/LandingBackgroundSlideshow.test.tsx`

Expected: FAIL because `LandingBackgroundSlideshow` does not exist.

- [ ] **Step 3: 최소 슬라이드 구현 작성**

`LandingBackgroundSlideshow.tsx`에 `"use client"` 경계를 두고 다음을 구현한다.

```tsx
export const LANDING_SLIDES = [
  { src: "/images/ui/village.webp", label: "시작 마을", position: "center 48%" },
  { src: "/images/ui/battle.webp", label: "전투", position: "center" },
  { src: "/images/ui/fishing.webp", label: "낚시터", position: "center" },
  { src: "/images/ui/guild.webp", label: "길드", position: "center" },
  { src: "/images/ui/hunt.webp", label: "사냥터", position: "center" },
] as const;
```

각 이미지를 `next/image`의 `fill`, `sizes="100vw"`, 빈 `alt`로 겹쳐 렌더하고 활성 레이어만 불투명하게 표시한다. Next.js 16에서 폐기된 `priority` 대신 첫 이미지만 `preload`를 사용한다. `useEffect`에서 `matchMedia("(prefers-reduced-motion: reduce)")`, `document.visibilityState`, 6초 타이머를 관리한다. 이미지 오류는 실패 집합에 기록하고 활성 이미지가 실패하면 `nextAvailableSlideIndex`로 이동한다. 우측 하단에 현재 이름, `게임에서 사용하는 지역 이미지`, 접근 가능한 5개 표시점 버튼을 렌더한다.

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `npm test -- src/app/sign-in/LandingBackgroundSlideshow.test.tsx`

Expected: 2 tests PASS.

- [ ] **Step 5: 컴포넌트 변경 커밋**

```bash
git add src/app/sign-in/LandingBackgroundSlideshow.tsx src/app/sign-in/LandingBackgroundSlideshow.test.tsx
git commit -m "feat: add landing image slideshow"
```

### Task 2: 랜딩 첫 화면에 슬라이드 통합

**Files:**
- Modify: `src/app/sign-in/LandingContent.tsx`
- Modify: `src/app/sign-in/LandingContent.test.tsx`
- Modify: `src/app/dev/page.tsx`

**Interfaces:**
- Consumes: `LandingBackgroundSlideshow()`
- Preserves: `LandingContent({ authed, authError })`

- [ ] **Step 1: 통합 실패 테스트 작성**

`LandingContent.test.tsx`의 비로그인 테스트에 다음 사용자 관찰 가능 계약을 추가한다.

```tsx
expect(html).toContain('aria-label="게임 이미지 슬라이드"');
expect(html).toContain('href="#features"');
expect(html).toContain('href="/manual"');
expect(html).toContain("별도 설치 없이 브라우저에서 바로 시작");
```

- [ ] **Step 2: 통합 테스트가 새 랜딩 요소 부재로 실패하는지 확인**

Run: `npm test -- src/app/sign-in/LandingContent.test.tsx`

Expected: FAIL on the missing slideshow/navigation assertions.

- [ ] **Step 3: 랜딩 레이아웃 구현**

`LandingContent.tsx`에서 첫 화면을 `min-h-[100svh]`의 독립적인 상대 위치 섹션으로 만들고 그 안에 `LandingBackgroundSlideshow`를 배치한다. 상단 불투명 바에는 게임명, `#features`, `/manual`, `/operations` 링크를 둔다. 히어로의 기존 제목·설명·인증 오류·로그인 UI를 `SURFACE_CARD`를 포함한 불투명 패널로 옮긴다. 기존 기능 네 항목에는 `id="features"`를 부여하고 대문 아래 불투명 배경과 푸터를 유지한다. `src/app/dev/page.tsx`의 오래된 미니멀 대문 설명은 게임 이미지 슬라이드 설명으로 고친다.

- [ ] **Step 4: 랜딩 단위 테스트 통과 확인**

Run: `npm test -- src/app/sign-in/LandingContent.test.tsx src/app/sign-in/LandingBackgroundSlideshow.test.tsx`

Expected: all selected tests PASS.

- [ ] **Step 5: 랜딩 통합 커밋**

```bash
git add src/app/sign-in/LandingContent.tsx src/app/sign-in/LandingContent.test.tsx src/app/dev/page.tsx
git commit -m "feat: show game art on sign-in landing"
```

### Task 3: 공개 화면 브라우저 회귀와 전체 검증

**Files:**
- Modify: `e2e/public-surface.spec.ts`

**Interfaces:**
- Consumes: 접근 가능한 슬라이드 이름과 표시점 버튼

- [ ] **Step 1: 브라우저 상호작용 테스트 작성**

```ts
test("로그인 대문의 게임 이미지 슬라이드를 직접 전환할 수 있다", async ({ page }) => {
  await preparePublicPage(page);
  await page.goto("/sign-in");
  const slideshow = page.getByRole("region", { name: "게임 이미지 슬라이드" });
  await expect(slideshow.getByText("시작 마을")).toBeVisible();
  await slideshow.getByRole("button", { name: "낚시터 이미지 보기" }).click();
  await expect(slideshow.getByText("낚시터")).toBeVisible();
  await expect(slideshow.getByRole("button", { name: "낚시터 이미지 보기" }))
    .toHaveAttribute("aria-current", "true");
});
```

- [ ] **Step 2: 선택 단위·이미지 검증 실행**

Run: `npm test -- src/app/sign-in/LandingContent.test.tsx src/app/sign-in/LandingBackgroundSlideshow.test.tsx`

Run: `npm run check-images`

Expected: both commands exit 0.

- [ ] **Step 3: 정적 검증 실행**

Run: `npx tsc --noEmit`

Run: `npx eslint src/app/sign-in/LandingContent.tsx src/app/sign-in/LandingBackgroundSlideshow.tsx src/app/sign-in/LandingContent.test.tsx src/app/sign-in/LandingBackgroundSlideshow.test.tsx e2e/public-surface.spec.ts src/app/dev/page.tsx`

Expected: both commands exit 0.

- [ ] **Step 4: 프로덕션 빌드와 공개 E2E 실행**

Run: `npm run build`

Run: `npx playwright test e2e/public-surface.spec.ts --project=desktop-chromium --project=mobile-webkit`

Expected: build and both public projects exit 0 with no accessibility violations or browser errors.

- [ ] **Step 5: 최종 변경 커밋**

```bash
git add e2e/public-surface.spec.ts
git commit -m "test: cover landing image slideshow"
```
