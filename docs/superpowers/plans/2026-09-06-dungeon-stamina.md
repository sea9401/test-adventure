# Dungeon Stamina Implementation Plan

**Goal:** 결과를 읽는 동안 미개척지 스태미너를 확인할 수 있게 한다.
**Architecture:** GameChrome의 기존 바를 메뉴 높이 아래 고정하고 StaminaBar에 compact 표시를 추가한다.
**Tech Stack:** React, Next.js 16, Tailwind CSS, Vitest.

- [x] GameChrome.layout.test.tsx에서 미개척지 sticky 표시, 다른 화면 일반 표시, 쿨다운 모드 숨김 회귀 테스트를 작성하고 실패를 확인한다.
- [x] StaminaBar.test.tsx에서 시간 경과 회복, 새 state 반영, 포션 모달 열기를 검증한다.
- [x] GameChrome.tsx에서 /battle/dungeon 및 하위 경로만 `sticky top-[var(--game-header-height,4rem)] z-30`을 적용한다.
- [x] StaminaBar.tsx에 기본 false인 compact prop을 추가하고 padding과 진행 막대 높이를 줄인다. SURFACE_INSET을 사용한다.
- [x] 관련 테스트, eslint, tsc와 diff 검토 후 이번 변경만 커밋한다.

사용자 지침에 따라 같은 세션에서 직접 실행하며 기존 협동 보스 작업은 건드리지 않는다.

검증 결과: 관련 Vitest 34개 및 대상 eslint 통과. 전체 tsc는 별도 협동 보스 변경의 coopListSections.test.ts에서 allowFreeSupport 누락으로 실패했다. 실제 브라우저 스크롤/육안 검증은 실행하지 않았다.
