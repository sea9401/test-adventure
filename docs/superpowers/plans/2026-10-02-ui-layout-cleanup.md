# 화면 정리 3단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 허브 메뉴를 한 카드 안의 행 목록과 시설 썸네일로, 사냥터 목록을 지역 그림 카드로, 기본 정보를 행으로 바꾸고 남은 색 정리를 마친다.

**Architecture:** 공용 `EntryList`/`EntryRow`를 만들어 허브 네 곳이 쓴다. 사냥터 그림은 기존 배경 매핑에서 헬퍼를 뽑아 공유한다. 나머지는 개별 컴포넌트 수정이다.

**Tech Stack:** Next 16 `next/image`, Tailwind v4, vitest, Playwright 캡처

**Spec:** `docs/superpowers/specs/2026-10-02-ui-layout-cleanup-design.md`

## Global Constraints

- 표면은 `SURFACE_*` 토큰만, 불투명. 행 구분선은 `divide-zinc-200 dark:divide-zinc-700`
- 썸네일은 `next/image`, 장식이므로 `alt=""`, 메뉴 순서·문구 변경 없음
- 터치 대상 40px 이상(행 최소 64px)
- 새 이모지·그라데이션·반투명 패널 금지, 플레이어 문구 변경 없음

## Review Focus

- 썸네일 그림 파일이 없으면 빌드 전 `check-images`가 잡는다 → Task 1·2에서 `npm run check-images` 실행
- 긴 메뉴 이름·설명이 좁은 폭(360px)에서 잘리지 않고 말줄임 → `min-w-0 truncate` 유지, 캡처 확인
- 사냥터 테마가 매핑 범위(84단계) 밖이면 기본 사냥 그림 → Task 2 테스트
- 숨긴 사냥터·빈 목록 상태 → 기존 테스트 유지
- 다크·금빛에서 썸네일 테두리와 행 구분선이 바탕에 묻히지 않는지 → 캡처 확인

---

### Task 1: EntryList·EntryRow와 허브 메뉴

**Files:**
- Create: `src/components/ui/EntryList.tsx`, `src/components/ui/EntryList.test.tsx`
- Modify: `src/adventure/v2/V2CharacterMenu.tsx`, `V2TownHome.tsx`, `V2BattleHome.tsx`, `V2PlazaHome.tsx`
- Modify tests: `V2TownHome.test.tsx`, `V2CharacterMenu.test.tsx`(필요 시)
- Create: `src/app/dev/hub-menus/page.tsx`, `src/app/dev/page.tsx` 목록에 추가

**Interfaces:**
- Produces: `EntryList({ children, className? })`, `EntryRow({ icon, title, description?, onClick, image? })`

- [ ] **Step 1: 실패하는 테스트** — `EntryList.test.tsx`: 목록 컨테이너 하나에 `ui-surface-card`와 `divide-y`, 행 버튼에는 `ui-surface-card`가 없음. `image` 지정 시 `<img`와 `alt=""`, 미지정 시 아이콘 렌더. `V2TownHome.test.tsx`: 치료소 행에 `healingcenter.webp`, `ui-surface-card`가 한 번만 등장.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/components/ui/EntryList.test.tsx src/adventure/v2/V2TownHome.test.tsx` → FAIL
- [ ] **Step 3: 구현** — 스펙 1절. 허브 네 곳의 `<div className="space-y-2">`를 `EntryList`로, `EntryCard`를 `EntryRow`로 바꾸고 스펙 표의 그림을 단다. 미리보기 페이지는 네 허브를 세로로 렌더(마을은 `gameStateLoaded viewerGuildId={null}`).
- [ ] **Step 4: 통과 확인** — 같은 명령 + `npx vitest run src/adventure/v2/V2CharacterMenu.test.tsx`, `npm run check-images` → PASS
- [ ] **Step 5: 커밋** — `feat: 허브 메뉴를 한 카드 행 목록과 시설 그림으로`

### Task 2: 사냥터 지역 그림

**Files:**
- Modify: `src/adventure/v2/gameSceneBackgroundForPath.ts` (+ 테스트 파일 있으면 그곳, 없으면 Create `gameSceneBackgroundForPath.test.ts`)
- Modify: `src/adventure/v2/V2DungeonList.tsx`, `V2DungeonList.render.test.tsx`
- Create: `src/app/dev/hunting-grounds/page.tsx`

**Interfaces:**
- Produces: `huntingGroundImageForDepth(depth: number): string`

- [ ] **Step 1: 실패하는 테스트** — 헬퍼: 1·6 → `plains.webp`, 7 → `canyon.webp`, 84 → `star_grave.webp`, 85·0 → `hunt.webp`. 렌더 테스트: 테마 목록에 첫 테마 그림 경로가 들어감.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 스펙 2절. 테마 카드는 `Card padding="none"` + 위쪽 띠 그림 + 기존 글자 영역(`p-3`). 안쪽 화면은 `GrowthSummary` 위에 넓은 그림.
- [ ] **Step 4: 통과 확인** — 테스트 PASS, `npm run check-images` 통과
- [ ] **Step 5: 커밋** — `feat: 사냥터 목록에 지역 그림`

### Task 3: 기본 정보 행

**Files:**
- Modify: `src/adventure/v2/V2CharacterBasics.tsx`, `V2CharacterBasics.test.tsx`

- [ ] **Step 1: 실패하는 테스트** — 렌더 결과에 `<dl`, 라벨 `<dt>` 3개, `rounded-md border` 정보 상자 없음, 값 그대로(무소속, 1,234 등)
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — `InfoTile`을 `InfoRow`(`dt`/`dd`, `flex justify-between`, `py-2`)로, `dl`에 `divide-y`. 숙달 포인트 값 색은 유지.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat: 기본 정보를 행 목록으로`

### Task 4: 남은 색·제목 정리

**Files:**
- Modify: `V2PreferencesView.tsx`(+테스트), 버튼 8곳(스펙 4절), `AdventureRankingPreview.tsx`
- Modify: `.claude/skills/anti-slop-ui/SKILL.md` 표에 "메뉴 목록 = `EntryList`/`EntryRow`"

- [ ] **Step 1: 실패하는 테스트** — 설정 화면: 카드 제목들이 `ui-section-title`을 가짐(화면 테마·화면 스타일·알림·배경 및 표시 등). `AdventureRankingPreview` 테스트(있으면)에서 선택 탭이 `text-selected`. 버튼 8곳 중 테스트가 있는 곳은 `bg-primary` 단언.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 버튼은 `border border-primary-border bg-primary text-on-primary hover:bg-primary-hover`로 색 클래스만 교체(크기·여백 유지, `dark:` 색 변형 제거).
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 전체 검증** — 캡처(허브·사냥터·기본 정보 × 클래식·금빛 × 라이트·다크, 390px), 전체 vitest, tsc, 변경 파일 eslint, anti-slop scan, `npm run build`
- [ ] **Step 6: 커밋** — `refactor: 설정 제목과 주 버튼 색 정리`
