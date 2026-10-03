# 화면 구성 개편 2단계(자주 쓰는 화면) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자주 쓰는 일곱 화면을 1단계 부품(도움말 머리, SegmentedControl, Button 위계, EmptyState, 행 목록)으로 옮긴다.

**Architecture:** 화면마다 기존 데이터·API·핸들러는 그대로 두고 렌더 구조만 바꾼다. 정렬·빈 칸 계산처럼 판단이
들어가는 부분은 순수 함수로 빼서 단위 테스트한다. 화면 테스트는 기존 방식(renderToStaticMarkup 또는 Testing Library)을 따른다.

**Tech Stack:** Next 16.3.8, React 19, Tailwind v4, vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-10-03-ux-design-system-design.md` (2단계 절)

## Global Constraints

- 패널·카드 배경은 `SURFACE_*` 토큰, 불투명. 컨테이너 `opacity-*` 금지.
- 새 손칠 버튼(색 바탕 + `text-white`) 금지, 새 `text-[10px]`/`text-[11px]` 금지.
- 기능 제거 금지: 기존 버튼·설정·정보는 위치만 옮긴다.
- 플레이어 문구에 개발 경위·"v2"·홍보 문구 금지, 한국어 문장 사이 긴 줄표 금지.
- AGENTS.md는 커밋하지 않는다(`next dev`가 고침).

## Review Focus

- 저장 칸이 모두 찬 전투 프리셋에서 저장 버튼이 막히고 덮어쓰기는 계속 되는가 → T1 테스트
- 스킬 화면 탭(embedded)에서도 패턴 규칙을 볼 수 있는가 → T2 테스트
- 선택 판매 모드 중에는 일괄 작업 패널 대신 선택 안내와 하단 확인 줄이 보이는가 → T3 테스트
- 일요일(본선일)에도 도전 탭 버튼 문구·비용 줄이 맞는가 → T4는 기존 분기 그대로 유지(코드 이동만)
- 납품 가능 정렬이 완료·잠긴 의뢰를 앞으로 끌어오지 않는가 → T7 테스트

---

### Task 1: 전투 프리셋

**Files:** Modify `src/adventure/v2/V2CombatLoadoutPresetsView.tsx`; Test `src/adventure/v2/V2CombatLoadoutPresetsView.test.tsx`

**Interfaces:**
- Produces: `firstEmptyPresetSlot(presets: CombatLoadoutPresetSlots): number | null`;
  `CombatLoadoutPresetList({ presets, activeSlot, busySlot, draftName, onDraftNameChange(name), onSave(), onApply(slot), onDelete(slot), onOverwrite(slot) })`
  (기존 `CombatLoadoutPresetSlots` 대체)

- [ ] 테스트: `firstEmptyPresetSlot([saved,null,...])===1`, 가득 차면 `null`. 목록 렌더: 저장된 이름·"적용 중"·"스킬 2 · 패턴 3 · 장비 6/6"·"빈 칸 4개"·"현재 세팅 저장" 버튼, 빈 칸 슬롯 카드 문구("빈 프리셋") 없음. 다섯 칸이 모두 차면 저장 버튼 disabled + "빈 칸이 없습니다".
- [ ] 실패 확인: `npx vitest run src/adventure/v2/V2CombatLoadoutPresetsView.test.tsx` → import 실패
- [ ] 구현: 도움말 머리, 저장 카드(`TextInput` + `Button`), `EntryList` 대신 `SURFACE_CARD` 안 `divide-y` 행. `save()`는 `firstEmptyPresetSlot`에 저장.
- [ ] 통과 확인 후 커밋 `feat: 전투 프리셋을 저장 카드와 행 목록으로 정리`

### Task 2: 스킬 패턴

**Files:** Modify `src/adventure/v2/V2CombatPatternView.tsx`; Tests `V2CombatPatternView.test.tsx`

**Interfaces:** Produces `PatternRulesHelp(): JSX` (규칙 문단 전체)

- [ ] 테스트: 단독 화면 마크업에 규칙 문단이 기본으로 없고 "도움말" 버튼이 있다. `PatternRulesHelp` 마크업에 기존 규칙 문구(독립 판정·AND/OR·혈전 예시)가 있다(기존 두 테스트를 이쪽으로 옮김). embedded 마크업에는 `<details>`와 "패턴이 작동하는 방식"이 있다. 블록 0개면 "블록이 없으면 기본 공격만 사용합니다"가 나온다(블록 목록을 순수 렌더로 검증할 수 없으면 `PatternBlocksEmpty` 컴포넌트로 빼서 검증).
- [ ] 실패 확인 → 구현(순서 변경, 프리셋 `<details>`, `StatusBanner` 경고 + 스킬 링크) → 통과 → 커밋 `feat: 스킬 패턴 규칙을 도움말로 옮기고 블록을 먼저 보여 주기`

### Task 3: 인벤토리 일괄 작업

**Files:** Modify `src/adventure/v2/inventory/EquipmentTab.tsx`, `src/adventure/v2/V2InventoryView.tsx`; Test `inventory/EquipmentTab.test.tsx`

- [ ] 테스트: 기본 렌더에 "일괄 작업" 버튼(`aria-expanded="false"`)이 있고 "미장착 전부 판매"가 없다. Testing Library로 "일괄 작업"을 누르면 도감 일괄 등록(1)·품질 입력·이하 판매·미장착 전부 판매·선택 판매가 나온다. 검색어가 있으면 패널 안에 "검색 결과와 관계없이" 안내가 나온다. 선택 모드에서는 "판매할 장비를 선택하세요"가 보이고 "일괄 작업" 버튼은 없다. 기존 도감 일괄 등록 테스트는 패널을 연 상태로 고친다.
- [ ] 실패 확인 → 구현(`useState` 패널, `SURFACE_INSET` 패널, 12px 글씨, V2InventoryView의 검색 안내 제거) → 통과 → 커밋 `feat: 인벤토리 일괄 작업을 한 메뉴로 모으기`

### Task 4: 아레나

**Files:** Modify `src/adventure/v2/V2ArenaView.tsx`; Test Create `src/adventure/v2/V2ArenaView.test.tsx`

**Interfaces:** Produces `ARENA_TABS` (5개: main 도전, ranking 순위, loadout 전투 세팅, history 기록, shop 상점), `ArenaRulesHelp({ tournamentDay, dailyMatchCount })`

- [ ] 테스트: `ARENA_TABS` 라벨이 `["도전","순위","전투 세팅","기록","상점"]`. `ArenaRulesHelp` 마크업에 규칙(매칭·쿨타임·Elo)과 주간 보상(1,000 코인)이 있다. 본선일이면 "일요일 연습전" 문구.
- [ ] 실패 확인 → 구현(`TabBar` 밑줄 탭, 순위 탭 `SegmentedControl` 주간 순위/본선, 도전 `Button` 전체 폭, 오류 `StatusBanner`, 규칙·보상 help) → 통과 → 커밋 `feat: 아레나 탭을 다섯 개로 줄이고 규칙을 도움말로`

### Task 5: 협동 보스

**Files:** Modify `src/adventure/v2/coop/V2CoopBossListView.tsx`; Test `coop/V2CoopBossListView.test.tsx`

- [ ] 테스트: 목록 마크업에서 "진행 중인 협동 보스"가 "토벌 설정"보다 앞에 오고, 토벌 설정은 `<details>` 안이다. NORMAL/HARD는 `role="group"`(SegmentedControl). 첫머리 소개 문장은 기본 마크업에 없다.
- [ ] 실패 확인 → 구현 → 통과 → 커밋 `feat: 협동 보스 목록을 먼저 보여 주고 설정은 접기`

### Task 6: 모험가 협회

**Files:** Modify `src/adventure/v2/association/AdventurerAssociationView.tsx`, `association/AssociationFacilityFund.tsx`; Test Create `association/AdventurerAssociationView.test.tsx`

**Interfaces:** Produces `associationFacilityRowDescription(row: { buildingId; level }): string` → `"Lv.1 · <현재 효과 요약>"`

- [ ] 테스트: 설명 함수 결과가 `Lv.1 · `로 시작. fetch 목으로 목록을 렌더하면 시설 6개가 버튼 행으로 나오고 "재료·골드 기부" 버튼이 목록에 없다. 행을 누르면 `role="group"` "시설 보기"에 이용/공동 기부가 있고, 공동 기부를 누르면 기부 양식이 나온다.
- [ ] 실패 확인 → 구현 → 통과 → 커밋 `feat: 모험가 협회를 시설 목록과 상세로 나누기`

### Task 7: 생활 조합 작업장

**Files:** Modify `src/adventure/v2/LifeWorkshopView.tsx`, `src/adventure/v2/LifeRequestBoard.tsx`, `src/app/globals.css`(`.life-workshop-touch-tabs` 제거); Tests `LifeWorkshopView.test.tsx`, `LifeRequestBoard.test.tsx`

**Interfaces:** Produces `sortDailyRequestsForBoard(requests: LifeRequestView[], periodLimitReached: boolean): LifeRequestView[]` (납품 가능 → 진행 중 → 잠김 → 완료, 같은 무리 안 원래 순서 유지)

- [ ] 테스트: 정렬 함수 순서. 작업장 상단 메뉴는 `role="tablist"`이고 선택 탭이 `aria-selected="true"`(기존 aria-pressed·touch-tabs 테스트 교체). 게시판 메뉴는 `role="group"` "생활 의뢰 메뉴". 등급 필터는 `select` "의뢰 등급", 납품 가능은 체크 상자. 의뢰 카드에서 설명 문단이 `truncate` 한 줄.
- [ ] 실패 확인 → 구현 → 통과 → 커밋 `feat: 생활 조합 작업장 탭을 2단으로 줄이고 의뢰를 납품 가능 순으로`

### Task 8: 마무리

- [ ] `designSystemBudget.test.ts` 기준을 실측치로 낮춘다(늘었으면 원인 화면을 고친다).
- [ ] 전체 vitest, tsc(`NODE_OPTIONS=--max-old-space-size=4096`), 바뀐 파일 eslint, anti-slop scan, `npm run build`.
- [ ] 로컬 로그인 환경에서 일곱 화면 390px·1280px 캡처 확인.
- [ ] 커밋 `chore: 2단계 후 디자인 시스템 예산 낮추기`
