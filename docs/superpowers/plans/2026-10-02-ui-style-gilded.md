# 화면 스타일 선택과 금빛 스타일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정에서 고르는 "금빛" 화면 스타일을 추가하고, 클래식은 픽셀 단위로 그대로 둔다.

**Architecture:** `<html>`의 `ui-skin-gilded` 클래스 아래에서 Tailwind 회색 변수(`--color-zinc-*`, `--color-white`)와 새 의미 토큰(`--ui-*`)을 다시 정의한다. 클래식 의미 토큰은 지금 쓰는 Tailwind 색을 참조한다. 명조 제목과 장식은 클래스 훅과 의사 요소로만 그린다.

**Tech Stack:** Next 16, Tailwind v4.2(`@theme inline`), `next/font/google`, vitest, Playwright 캡처(검증용 스크래치 스크립트)

**Spec:** `docs/superpowers/specs/2026-10-02-ui-style-gilded-design.md`

## Global Constraints

- 저장 키 `ui-style.v1`, 값 `classic` | `gilded`, 루트 클래스 `ui-skin-gilded`, `DEFAULT_UI_STYLE = "classic"`
- 플레이어 표기: 클래식("회색 바탕, 보라색 버튼"), 금빛("따뜻한 바탕, 명조 제목, 금색 버튼")
- 클래식 화면은 변경 전과 픽셀이 같아야 한다(원래 매번 달라지는 영역 제외)
- 금빛 규칙은 터미널 모드(`ui-terminal-mode`)에서 적용하지 않는다
- 금빛 다크 선택자: `:is(.ui-skin-gilded.dark, .ui-skin-gilded .dark, .dark .ui-skin-gilded)`
- 회색 단계표와 의미 색 값은 스펙의 표를 그대로 쓴다
- 새 글꼴은 `Noto_Serif_KR` 600/700, `variable: "--font-serif-kr"`, `preload: false` 하나뿐
- 반투명 패널·그라데이션·새 이모지 금지(anti-slop-ui), 플레이어 문구에 "v2"·개발 경위 금지

## Review Focus

- 다크 대문(`<main className="dark">`) 안에서 금빛을 켠 경우: 대문이 금빛 다크 토큰을 받아야 한다 → Task 3 캡처 확인
- 금빛 + 터미널 모드 동시 저장: 터미널 화면이 지금과 같아야 한다 → Task 3 캡처 확인
- `localStorage` 접근이 막힌 브라우저(사생활 보호 모드): 초기화 스크립트가 예외 없이 클래식으로 남아야 한다 → Task 1 테스트
- 알 수 없는 예전 저장값(`"true"`, `""`): 기본값으로 처리 → Task 1 테스트
- 대화상자처럼 `SURFACE_CARD`에 큰 그림자를 덧붙인 표면: 금빛에서도 그림자 크기·진하기 유지 → Task 3 CSS가 `--tw-inset-shadow`만 건드림, 캡처 확인

---

### Task 1: 스타일 저장값과 초기화 스크립트

**Files:**
- Create: `src/adventure/v2/uiStyle.ts`
- Create: `src/adventure/v2/uiStyle.test.ts`
- Modify: `src/app/layout.tsx` (`<head>`의 기존 init 스크립트 뒤에 추가)

**Interfaces:**
- Produces: `UI_STYLE_STORAGE_KEY = "ui-style.v1"`, `GILDED_STYLE_CLASS = "ui-skin-gilded"`, `type UiStyle = "classic" | "gilded"`, `DEFAULT_UI_STYLE: UiStyle`, `parseStoredUiStyle(value: string | null): UiStyle`, `uiStyleInitScript(): string`

- [ ] **Step 1: 실패하는 테스트 작성** — `uiStyle.test.ts`
  - `parseStoredUiStyle("gilded") === "gilded"`, `("classic") === "classic"`, `(null)`, `("true")`, `("")` 모두 `"classic"`
  - `uiStyleInitScript()`를 `new Function("localStorage", "document", script)`로 실행:
    - 저장값 `"gilded"` → 가짜 `document.documentElement.classList.add`가 `"ui-skin-gilded"`로 호출됨
    - 저장값 `null`, `"classic"` → 호출 없음
    - `localStorage.getItem`이 throw → 예외 없이 호출 없음
- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/uiStyle.test.ts` → 모듈 없음으로 FAIL
- [ ] **Step 3: 구현** — `discreetMode.ts`와 같은 모양. 스크립트는 `JSON.stringify`로 키·클래스·기본값을 박아 넣고 저장값이 `classic`/`gilded`가 아니면 기본값을 쓴다. `layout.tsx`에 `<script dangerouslySetInnerHTML={{ __html: uiStyleInit }} />` 추가.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: 커밋** — `feat: 화면 스타일 저장값과 초기화 스크립트`

### Task 2: 의미 토큰(클래식 값)과 버튼·탭 이전

**Files:**
- Modify: `src/app/globals.css` (`:root`·`.dark` 블록과 `@theme inline`)
- Modify: `src/components/ui/Button.tsx` (`BASE`의 포커스 링, `VARIANT.primary`)
- Modify: `src/components/ui/TabBar.tsx` (`TAB_STATE`)
- Modify: `src/adventure/v2/MainTabNav.tsx:384-385`
- Test: `src/components/ui/Button.test.tsx`, `src/components/ui/TabBar.test.tsx`, `src/adventure/v2/MainTabNav.test.tsx`

**Interfaces:**
- Produces: CSS 변수 `--ui-primary`, `--ui-primary-hover`, `--ui-primary-border`, `--ui-on-primary`, `--ui-selected`, `--ui-selected-line`, `--ui-selected-hover`, `--ui-focus`; 유틸리티 색 이름 `primary`, `primary-hover`, `primary-border`, `on-primary`, `selected`, `selected-line`, `selected-hover`, `focus`

- [ ] **Step 1: 테스트 수정(실패)**
  - Button: `buttonClassName({ variant: "primary" })`가 `bg-primary`, `border-primary-border`, `text-on-primary`, `hover:bg-primary-hover`를 포함하고 `violet`을 포함하지 않음. 기본 클래스에 `focus-visible:ring-focus`. soft 변형 단언(`bg-violet-50`)은 유지.
  - TabBar·MainTabNav: 선택 탭 클래스에 `text-selected`, `border-selected-line`
- [ ] **Step 2: 실패 확인** — `npx vitest run src/components/ui/Button.test.tsx src/components/ui/TabBar.test.tsx src/adventure/v2/MainTabNav.test.tsx` → FAIL
- [ ] **Step 3: 구현**
  - `globals.css`의 `:root`에 클래식 라이트 값, `.dark`에 클래식 다크 값을 스펙 표대로 `var(--color-violet-600)` 식으로 정의. `@theme inline`에 `--color-primary: var(--ui-primary);` 등 8개 등록.
  - Button primary: `border border-primary-border bg-primary text-on-primary hover:bg-primary-hover` (dark 변형 제거, 값은 `.dark` 변수가 담당). BASE 포커스 링: `focus-visible:ring-focus` (dark 변형 제거).
  - TabBar 두 변형과 MainTabNav: active `border-selected-line text-selected`, highlight·MainTabNav의 inactive hover `hover:text-selected-hover`.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: 클래식 픽셀 비교** — 워크트리 dev 서버(포트 3101)에서 `shot2.mjs`로 기준 캡처와 같은 목록을 `after/`에 찍고 `pixdiff.cjs before after` → 모두 identical(인벤토리 다크의 유니크 이름 상자 `(33,159)-(132,172)` 제외)
- [ ] **Step 6: 커밋** — `refactor: 주 버튼과 선택 탭 색을 의미 토큰으로 이전`

### Task 3: 금빛 팔레트, 의미 값, 카드 재질

**Files:**
- Modify: `src/app/globals.css` (새 섹션 "화면 스타일: 금빛", 파일 끝 터미널 모드 블록 앞)
- Modify: `src/components/ui/surfaces.ts` (훅 클래스 `ui-surface-card`, `ui-surface-inset`, `ui-surface-accent`)
- Test: `src/components/ui/surfaces.test.ts`

**Interfaces:**
- Consumes: Task 2의 `--ui-*` 변수
- Produces: 금빛 장식 변수 `--ui-ornament`, `--ui-eyebrow`; 훅 클래스 3종

- [ ] **Step 1: 테스트 추가(실패)** — `SURFACE_CARD`가 `ui-surface-card`, `SURFACE_INSET`이 `ui-surface-inset`, `SURFACE_ACCENT`가 `ui-surface-accent`를 포함
- [ ] **Step 2: 실패 확인** — `npx vitest run src/components/ui/surfaces.test.ts` → FAIL
- [ ] **Step 3: 구현**
  - `surfaces.ts` 세 토큰 문자열 앞에 훅 클래스 추가
  - CSS: `.ui-skin-gilded:not(.ui-terminal-mode)`에 회색 단계표 12개, `--background`/`--foreground` 라이트 값, 의미 토큰 금빛 라이트 값, `--ui-ornament: var(--color-amber-500)`, `--ui-eyebrow: var(--color-amber-700)`. 금빛 다크 선택자에 다크 값(`--background: #0a0a0b`, `--foreground: #ece7de`, 금빛 다크 의미 값, 장식 `amber-300`).
  - 재질: 금빛 `.ui-game-card` 그림자를 따뜻한 갈색 계열로(라이트 `inset 0 1px 0 rgb(255 255 255 / .7), 0 1px 2px rgb(60 45 20 / .08), 0 6px 16px rgb(60 45 20 / .05)`, 다크 `inset 0 1px 0 rgb(255 236 200 / .05), 0 1px 2px rgb(0 0 0 / .4), 0 8px 18px rgb(0 0 0 / .2)`). 금빛 `:is(.ui-surface-card, .ui-surface-accent)`에 `--tw-inset-shadow: inset 0 1px 0 rgb(255 255 255 / .6)`(다크 `rgb(255 236 200 / .04)`).
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npx vitest run src/components/ui/darkSurfaceAudit.test.ts` PASS
- [ ] **Step 5: 클래식 픽셀 비교** — Task 2 Step 5와 같은 기준으로 identical
- [ ] **Step 6: 금빛 캡처 확인** — 같은 목록을 스타일 `gilded`로 찍어 눈으로 확인. 대문 다크, 터미널 모드(`/dev/ui-system`에 `discreet-mode.v1=terminal`도 저장한 상태) 포함. 주요 조합의 대비(본문 `zinc-900`/`white`, 보조 `zinc-500`/`white`, 다크 `zinc-400`/`zinc-900`, 주 버튼 글자/바탕)를 계산해 WCAG AA(4.5:1) 이상인지 확인.
- [ ] **Step 7: 커밋** — `feat: 금빛 화면 스타일 팔레트와 카드 재질`

### Task 4: 명조 제목, 장식, SectionHeading

**Files:**
- Create: `src/components/ui/SectionHeading.tsx`
- Create: `src/components/ui/SectionHeading.test.tsx`
- Modify: `src/app/layout.tsx` (`Noto_Serif_KR` 등록, `<html>` className에 `.variable`)
- Modify: `src/components/ui/SubViewHeader.tsx` (`h1`에 `ui-heading ui-screen-title`)
- Modify: `src/components/ui/GameDialogHost.tsx` (`h2`에 `ui-heading`)
- Modify: `src/app/globals.css` (금빛 섹션에 글꼴·장식 규칙)

**Interfaces:**
- Produces: `SectionHeading({ title: ReactNode; eyebrow?: ReactNode; right?: ReactNode; as?: "h2" | "h3"; className?: string })`, 클래스 훅 `ui-heading`, `ui-screen-title`, `ui-section-title`, `ui-eyebrow`

- [ ] **Step 1: 실패하는 테스트 작성** — `renderToStaticMarkup`으로
  - 기본 `h2`에 `ui-heading ui-section-title`과 `text-sm font-bold` 포함
  - `eyebrow` 지정 시 `ui-eyebrow` 요소가 제목보다 앞에 나옴, 미지정 시 없음
  - `as="h3"`이면 `<h3`, `right`가 렌더됨
- [ ] **Step 2: 실패 확인** — `npx vitest run src/components/ui/SectionHeading.test.tsx` → FAIL
- [ ] **Step 3: 구현**
  - 컴포넌트: 바깥 `flex items-end justify-between gap-2`, 왼쪽 `min-w-0`에 eyebrow(`ui-eyebrow text-[11px] font-semibold text-zinc-500 dark:text-zinc-400`)와 제목(`ui-heading ui-section-title text-sm font-bold text-zinc-900 dark:text-zinc-100`), 오른쪽 `shrink-0`에 `right`
  - CSS(금빛만): `:is(.ui-heading, .ui-game-card h2, .ui-surface-card h2, .ui-surface-accent h2)`에 `font-family: var(--font-serif-kr), var(--font-geist-sans), serif`. `.ui-screen-title::after`는 `h1` 아래 가운데 2.5rem×1px `var(--ui-ornament)`. `.ui-section-title::after`는 block, `margin-top: .375rem`, 2.5rem×1px. `.ui-eyebrow`는 `color: var(--ui-eyebrow); letter-spacing: .12em`.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: 클래식 픽셀 비교와 금빛 캡처** — Task 3 Step 5·6과 같은 방법. 명조는 스펙대로 카드 안 `h2`까지만 적용한다.
- [ ] **Step 6: 커밋** — `feat: 금빛 스타일 명조 제목과 장식`

### Task 5: 설정 화면, 매뉴얼, 미리보기, 규칙 문서

**Files:**
- Modify: `src/adventure/v2/V2PreferencesView.tsx` (화면 테마 카드 다음에 "화면 스타일" 카드)
- Modify: `src/adventure/v2/V2PreferencesView.test.tsx`
- Modify: `src/app/manual/content/controls.tsx:92-94` (라이트·다크 모드 다음 항목)
- Modify: `src/app/dev/ui-system/UiSystemPreview.tsx` (클래식·금빛 × 라이트·다크 4패널, `SectionHeading` 사용)
- Modify: `.claude/skills/anti-slop-ui/SKILL.md` (스펙 "규칙 문서" 세 줄 + 표의 글꼴 행 갱신)

**Interfaces:**
- Consumes: Task 1의 `UI_STYLE_STORAGE_KEY`, `GILDED_STYLE_CLASS`, `parseStoredUiStyle`, `type UiStyle`; Task 4의 `SectionHeading`

- [ ] **Step 1: 실패하는 테스트 작성** — `V2PreferencesView.test.tsx`
  - "금빛" 버튼 클릭 → `document.documentElement.classList.contains("ui-skin-gilded")`가 true, `localStorage.getItem("ui-style.v1") === "gilded"`, 버튼 `aria-pressed="true"`
  - 이어서 "클래식" 클릭 → 클래스 제거, 저장값 `"classic"`
- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/V2PreferencesView.test.tsx` → FAIL
- [ ] **Step 3: 구현**
  - 설정 카드: 제목 `SectionHeading title="화면 스타일"`, 안내 "변경 사항은 이 브라우저에 저장됩니다.", 2열 버튼은 기존 테마 버튼과 같은 클래스. 아이콘은 phosphor `Square`(클래식)와 `Crown`(금빛). 각 버튼에 설명 문구 한 줄. 마운트 시 루트 클래스에서 현재 값을 읽는다.
  - 매뉴얼: `<li><Em>화면 스타일</Em>: 클래식과 금빛 중에서 고릅니다. 금빛은 따뜻한 바탕에 명조 제목과 금색 버튼을 씁니다.</li>`
  - 미리보기: 기존 2패널 앞뒤로 `ui-skin-gilded` 래퍼 2패널 추가, 패널 제목은 `SectionHeading`
  - 규칙 문서: 스펙의 세 줄 추가
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: 전체 검증**
  - `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` → 오류 0
  - `npx eslint` 변경 파일 → 오류 0
  - `npx vitest run src/components/ui src/adventure/v2/uiStyle.test.ts src/adventure/v2/V2PreferencesView.test.tsx src/adventure/v2/MainTabNav.test.tsx src/app/manual` → PASS
  - `bash .claude/skills/anti-slop-ui/scan.sh origin/main` → 새 후보 검토
  - 클래식 픽셀 비교 최종 1회, 금빛 4조합 캡처 최종 확인
  - `npm run build` → 성공
- [ ] **Step 6: 커밋** — `feat: 설정에서 화면 스타일 선택`
