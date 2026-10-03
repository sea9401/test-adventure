# 화면 구성 개편 1단계: 공통 틀 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면을 일관되게 만드는 공용 부품·규칙·자동 검사와 전역 수정(스태미나 중복, 채팅 버튼)을 넣는다.

**Architecture:** 기존 `components/ui` 부품을 확장하고(`SubViewHeader`, `EmptyState`, `EntryList`, `Button`), `SegmentedControl`과 예산 검사를 새로 만든다. 화면별 교체는 2단계.

**Tech Stack:** React 19, Tailwind v4, vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-10-03-ux-design-system-design.md`

## Global Constraints

- 표면은 `SURFACE_*`, 불투명. 컨테이너 `opacity` 금지(버튼 `disabled:opacity`만 허용)
- 글씨 최소 12px(`text-xs`) — 새 코드에 `text-[10px]`·`text-[11px]` 금지
- 버튼 색은 `Button`/`buttonClassName`에서만
- 플레이어 문구 간결, 줄표 연결·이모지 금지

## Review Focus

- 도움말 패널이 열린 상태에서 `right` 슬롯(골드 등)과 겹치지 않는가 → T1 테스트
- `success`·`warning`·`info`를 쓰던 화면에서 버튼이 사라지거나 대비가 떨어지지 않는가 → T3 클래스 단언 + 캡처
- 채팅 창이 열려 있을 때 스크롤로 버튼이 숨지 않는가 → T6 테스트
- 사냥터(`/battle/dungeon`)의 고정 스태미나는 유지되는가 → T5 테스트
- 예산 검사가 테스트·`/dev` 파일을 세지 않는가 → T7 테스트

---

### Task 1: SubViewHeader 도움말
**Files:** `src/components/ui/SubViewHeader.tsx`, Create `src/components/ui/SubViewHeader.test.tsx`
- [ ] 실패 테스트: `help` 없으면 "도움말" 버튼 없음. 있으면 버튼(`aria-expanded="false"`) → 클릭 시 `aria-expanded="true"`, 패널(`role="region"`, 이름 "도움말")에 내용 표시, 다시 클릭하면 닫힘. `right`와 함께 써도 둘 다 렌더.
- [ ] 구현: 오른쪽 영역에 `right` 다음 `Question` 아이콘 버튼(40px). 패널은 머리 아래 `SURFACE_INSET p-3 text-sm`.
- [ ] 통과 확인, 커밋 `feat: 화면 머리에 도움말 패널`

### Task 2: SegmentedControl
**Files:** Create `src/components/ui/SegmentedControl.tsx`, `SegmentedControl.test.tsx`
- Interface: `SegmentedControl<K extends string>({ options: {key: K; label: ReactNode}[]; value: K; onChange(k: K): void; ariaLabel: string; className? })`
- [ ] 실패 테스트: `role="group"` 이름=ariaLabel, 선택 버튼만 `aria-pressed="true"`, 클릭 시 onChange(key), 최소 높이 40px 클래스
- [ ] 구현: 트랙 `rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800`, 선택 칸 `bg-white shadow-sm dark:bg-zinc-950`(불투명), 글자 `text-sm`
- [ ] 통과, 커밋 `feat: 화면 안 보기 전환용 SegmentedControl`

### Task 3: 버튼 위계 정리
**Files:** `src/components/ui/Button.tsx`, `Button.test.tsx`
- [ ] 실패 테스트: `success`·`warning`·`info` 변형 클래스가 `primary`와 같음(`bg-primary` 포함, emerald/amber/sky 없음)
- [ ] 구현: 세 변형을 primary 클래스 상수로
- [ ] 통과 + `npx vitest run src/components/ui`, 커밋 `refactor: 버튼 변형을 주·보조·위험으로 정리`

### Task 4: 빈 상태 바로가기와 잠긴 메뉴
**Files:** `src/components/ui/EmptyState.tsx`, `EntryList.tsx`, `EntryCard.tsx` + 테스트
- [ ] 실패 테스트: EmptyState `action={{label, href}}` → 링크 버튼, `onClick` → 버튼. EntryRow/EntryCard `locked="Lv 100에 열림"` → 자물쇠 아이콘·조건 문구 표시, 설명 대신 조건, 제목 흐린 색, `opacity` 클래스 없음
- [ ] 구현, 통과, 커밋 `feat: 빈 상태 바로가기와 잠긴 메뉴 표시`

### Task 5: 스태미나 중복 제거
**Files:** `src/adventure/v2/staminaBarVisibility.ts`(+test), `src/adventure/v2/StaminaBar.tsx`(StaminaPotionModal), 관련 테스트
- [ ] 실패 테스트: `shouldShowStaminaBar`가 `/battle/dungeon`·하위만 true, arena·coop·mastery-tower·storm-expedition false. 회복약 창에 "초마다 1 회복"과 최대치까지 남은 시간 표시
- [ ] 구현: 경로 목록 축소, 모달에 회복 정보 줄(필요 props: `regenBonusPct`, `state`, `max`가 없으면 V2TopBar에서 전달)
- [ ] 통과, 커밋 `feat: 전투 화면의 중복 스태미나 카드 제거`

### Task 6: 채팅 버튼 스크롤 숨김
**Files:** Create `src/components/useHideOnScrollDown.ts`(+test), Modify `src/components/ChatButton.tsx`
- Interface: `useHideOnScrollDown({ disabled?: boolean, threshold?: number }): boolean` (true면 숨김)
- [ ] 실패 테스트: 아래로 threshold 이상 스크롤 → true, 위로 스크롤 → false, disabled면 항상 false
- [ ] 구현: `window.scroll` 패시브 리스너, rAF 없이 마지막 Y 비교. ChatButton 닫힌 버튼에 `translate-y-[calc(100%+2rem)]`/`opacity` 대신 `invisible`+이동(모션 줄이기 시 이동 없음), 크기 `h-12 w-12`
- [ ] 통과, 커밋 `feat: 스크롤 중 채팅 버튼 숨김`

### Task 7: 예산 검사·규칙·미리보기
**Files:** Create `src/components/ui/designSystemBudget.test.ts`; Modify `.claude/skills/anti-slop-ui/SKILL.md`, `src/app/dev/ui-system/UiSystemPreview.tsx`
- [ ] 테스트: src 아래 `.tsx`(테스트·`src/app/dev` 제외)에서 색 바탕+흰 글자 문자열 수 ≤ 기준, 12px 미만 글씨 클래스 수 ≤ 기준. 기준은 이 작업 시점에 실측해 상수로
- [ ] 규칙 문서 "화면 골격" 절, 미리보기에 새 부품
- [ ] 전체 검증: 전체 vitest, tsc, 변경 파일 eslint, 로컬 로그인 환경 캡처(아레나·협동 보스·숙련의 탑에서 스태미나 카드 사라짐, 채팅 버튼), build
- [ ] 커밋 `chore: 디자인 시스템 예산 검사와 화면 골격 규칙`
