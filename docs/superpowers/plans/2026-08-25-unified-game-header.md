# Unified Game Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상단 자원 행, 6개 메인 탭, 전역 티커를 한 폭과 한 표면을 공유하는 sticky 게임 헤더로 결합한다.

**Architecture:** `GameChrome`이 단일 의미론적 `<header>`와 공통 카드 표면을 소유한다. `V2TopBar`, `MainTabNav`, `WarTicker`는 기존 데이터·상호작용 책임을 유지한 채 그 안에 조합되며, `V2TopBar`는 중첩 헤더를 피하기 위해 상단 행 요소로 축소한다.

**Tech Stack:** Next.js App Router, React 19 Client Components, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`와 `11-css.md`의 현재 프로젝트 버전 지침을 따른다.
- 상단 행과 탭 행에는 불투명 표면을 사용하며 `src/components/ui/surfaces.ts`를 단일 출처로 삼는다.
- 메뉴·라우트·자원·티커 데이터와 기존 상호작용은 변경하지 않는다.
- 모바일 safe area, 44px 터치 영역, 라이트·다크 모드를 유지한다.
- 배포와 점검 모드 조작은 하지 않는다.

---

## File Map

- Modify: `src/adventure/v2/GameChrome.tsx` — 단일 sticky 게임 헤더 안에서 세 영역을 조합한다.
- Modify: `src/adventure/v2/V2TopBar.tsx` — 상단 행 스타일과 의미 구조만 담당한다.
- Modify: `src/adventure/v2/V2TopBar.test.tsx` — 상단 행이 독립 sticky 헤더가 아님을 검증한다.
- Create: `src/adventure/v2/GameChrome.layout.test.tsx` — 실제 `V2TopBar`와 `MainTabNav`가 단일 헤더 안에 배치되는 레이아웃 계약을 검증한다.
- Modify: `src/adventure/v2/item-card/V2ItemCardPopover.tsx` — 팝오버의 상단 경계를 결합형 게임 헤더 전체 높이에서 읽는다.
- Create: `src/adventure/v2/item-card/V2ItemCardPopover.header.test.tsx` — 탭 뒤로 팝오버가 가려지는 회귀를 검증한다.
- Modify: `src/components/ui/surfaces.ts` — 불투명 게임 헤더 표면 토큰을 추가한다.

### Task 1: 단일 게임 헤더 레이아웃 계약

**Interfaces:**
- Consumes: `GameChrome({ children }: { children: React.ReactNode })`, `V2TopBar`, `MainTabNav`, `WarTicker`
- Produces: `data-game-header`가 있는 단일 `<header>`와 그 안의 `data-game-top-bar`, `aria-label="메인 메뉴"`, 티커 영역

- [x] **Step 1: 실패하는 레이아웃 테스트 작성**

`src/adventure/v2/GameChrome.layout.test.tsx`에서 라우터와 게임 상태 공급자만 격리하고 `GameChrome`을 렌더한다. `header[data-game-header]`가 아직 없으므로 다음 계약이 실패해야 한다.

```tsx
const gameHeader = container.querySelector("header[data-game-header]");
expect(gameHeader).not.toBeNull();
expect(gameHeader?.querySelector("[data-game-top-bar]")).not.toBeNull();
expect(within(gameHeader as HTMLElement).getByRole("navigation", { name: "메인 메뉴" })).toBeTruthy();
expect(gameHeader?.querySelector("[data-game-ticker-slot]")).not.toBeNull();
```

`V2TopBar.test.tsx`에는 상단 행이 자체 sticky 랜드마크를 만들지 않는 계약을 추가한다.

```tsx
expect(html).toMatch(/^<div[^>]+data-game-top-bar/);
expect(html).not.toContain("sticky top-0");
```

- [x] **Step 2: RED 확인**

Run:

```bash
npm test -- src/adventure/v2/GameChrome.layout.test.tsx src/adventure/v2/V2TopBar.test.tsx
```

Expected: 현재 `GameChrome`에 `header[data-game-header]`가 없고 `V2TopBar` 루트가 자체 sticky `<header>`이므로 관련 assertion이 실패한다.

- [x] **Step 3: 최소 구현**

`surfaces.ts`에 다음 불투명 표면 토큰을 추가한다.

```ts
export const SURFACE_GAME_HEADER =
  "border-b border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900";
```

`GameChrome.tsx`에서 `V2TopBar`, `MainTabNav`, `WarTicker`를 다음 셸로 묶는다.

```tsx
<header
  data-game-header
  className={`${SURFACE_GAME_HEADER} sticky top-0 z-[60] pt-[env(safe-area-inset-top)]`}
>
  <div className="mx-auto w-full max-w-[864px]">
    <V2TopBar
      stamina={stamina}
      staminaMax={staminaMax}
      spendableGold={spendableGold}
    />
    <MainTabNav
      activeKey={activeTab}
      gameStateLoaded={gameStateLoaded}
      viewerGuildId={viewerGuildId}
      onNavigate={(href) => router.push(href)}
    />
    <div data-game-ticker-slot>
      <WarTicker />
    </div>
  </div>
</header>
```

`V2TopBar.tsx` 루트를 `<div data-game-top-bar>`로 바꾸고 sticky·z-index·바깥 표면 스타일을 제거한다. 내부 행에는 `border-b`, `px-3`, `py-1`, 데스크톱 패딩만 남긴다.

- [x] **Step 4: GREEN 확인**

Run:

```bash
npm test -- src/adventure/v2/GameChrome.layout.test.tsx src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/MainTabNav.test.tsx src/adventure/v2/WarTicker.test.ts
```

Expected: 모든 관련 테스트 PASS.

- [x] **Step 5: 레이아웃 세부 정리와 회귀 확인**

드롭다운이 카드 밖으로 열릴 수 있도록 헤더 셸에 `overflow-hidden`을 추가하지 않는다. 중복 `max-w-[864px]`은 정렬 안전장치로 유지하고, 티커가 없을 때 빈 높이가 생기지 않는지 DOM과 브라우저 출력에서 확인한다. `V2ItemCardPopover`는 `[data-game-header]`의 하단을 우선 사용하고, 독립 렌더링 호환을 위해 `[data-game-top-bar]`를 보조 경계로 사용한다.

Run:

```bash
npm run check-images
npx eslint src/adventure/v2/GameChrome.tsx src/adventure/v2/V2TopBar.tsx src/adventure/v2/GameChrome.layout.test.tsx src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/item-card/V2ItemCardPopover.tsx src/adventure/v2/item-card/V2ItemCardPopover.header.test.tsx src/components/ui/surfaces.ts
npx tsc --noEmit
npm run build
```

Expected: 이미지 참조 오류 없음, ESLint 0 errors, TypeScript 0 errors, Next.js build exit 0.

- [x] **Step 6: 구현 커밋**

```bash
git add src/adventure/v2/GameChrome.tsx src/adventure/v2/V2TopBar.tsx src/adventure/v2/GameChrome.layout.test.tsx src/adventure/v2/V2TopBar.test.tsx src/adventure/v2/item-card/V2ItemCardPopover.tsx src/adventure/v2/item-card/V2ItemCardPopover.header.test.tsx src/components/ui/surfaces.ts docs/superpowers/specs/2026-08-25-unified-game-header-design.md docs/superpowers/plans/2026-08-25-unified-game-header.md
git commit -m "feat: unify persistent game header"
```
