# PC 2단 확장(사냥터·퀘스트·거래소) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1024px 이상에서 사냥터·퀘스트·거래소 둘러보기를 `TwoPane` 2단으로 보여 준다.

**Architecture:** 데이터·핸들러는 그대로, 렌더만 `TwoPane`으로 감싼다. 사냥터는 모험가 협회처럼 `useMediaQuery`로 PC일 때만 목록·상세를 함께 그린다. 퀘스트·거래소는 CSS만으로 쌓기/나란히를 바꾼다.

**Tech Stack:** Next 16.3.8, React 19, Tailwind v4, vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-10-03-ux-design-system-design.md` (3-10)

## Global Constraints

- 2·3단계와 같음(불투명 표면, 손칠 버튼·12px 미만 금지, 기능 제거 금지, 문구 규칙).
- 휴대폰(1024px 미만) 화면은 바뀌지 않는다.

## Review Focus

- 왼쪽 칸이 긴 화면에서 아래쪽이 가려지지 않는가 → T1(sticky false) 테스트
- 사냥터 PC에서 표시 설정으로 고른 사냥터를 숨기면 다른 사냥터로 넘어가는가 → T2 테스트
- 거래소 다른 탭(최근 거래·내 거래·판매)은 2단이 아닌가 → T4 테스트

---

### Task 1: `TwoPane sticky` — Test `TwoPane.test.tsx`: `sticky={false}`면 aside에 `lg:sticky`가 없다.
### Task 2: 사냥터 — `V2DungeonList`에 PC 2단. Test `V2DungeonList.render.test.tsx`(matchMedia 목).
### Task 3: 퀘스트 — `V2QuestView` 일일·주간·가이드 탭을 `TwoPane`으로. Test `V2QuestView.layout.test.tsx`(공급자·fetch 목).
### Task 4: 거래소 — 둘러보기 탭을 `TwoPane`으로, PC 폭 60rem. Test `V2MarketplaceView.layout.test.tsx`(하니스).
### Task 5: 마무리 — 예산 확인, 전체 검증, PC·휴대폰 캡처, 미리보기 페이지에 세 화면 추가.

각 Task는 실패하는 테스트 → 확인 → 구현 → 통과 → 커밋 순서.
