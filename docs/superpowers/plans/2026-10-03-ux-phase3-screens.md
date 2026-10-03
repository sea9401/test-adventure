# 화면 구성 개편 3단계(나머지 화면·PC 2단) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2단계 밖 화면을 같은 골격으로 옮기고, 1024px 이상에서 목록·상세를 나란히 보여 준다.

**Architecture:** 화면마다 데이터·핸들러는 그대로 두고 렌더만 바꾼다. 정렬·나누기처럼 판단이 있는 부분은 순수 함수로 빼서 테스트한다.

**Tech Stack:** Next 16.3.8, React 19, Tailwind v4, vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-10-03-ux-design-system-design.md` (3단계 절)

## Global Constraints

- 2단계와 같음(불투명 표면, 손칠 버튼·12px 미만 금지, 기능 제거 금지, 문구 규칙, AGENTS.md 커밋 금지).

## Review Focus

- 미획득 트로피를 골랐을 때 상세 카드가 나오는가 → T1 테스트
- 보유 꾸미기가 하나도 없을 때 빈 안내와 미획득 접기가 함께 보이는가 → T2 테스트
- 잠긴 직업의 해금 조건이 접힌 상태에서도 보이는가 → T3 테스트
- 개척 노드 잠금이 레벨 정보를 읽기 전 1레벨로 잘못 잠기지 않는가 → T6 테스트
- 1024px 미만에서 TwoPane이 한 줄로 쌓이는가 → T8 테스트(클래스)

---

### Task 1: 트로피 전시대 — `splitTrophiesForCabinet(trophies)` → `{ unlocked, lockedByKind }` + 렌더. Test `V2TrophyCabinetView.test.tsx`.
### Task 2: 꾸미기 — `CollectionLayout`이 `items: {key, owned, node}[]`를 받아 보유 먼저·미획득 접기. Test `V2CosmeticsView.test.tsx`(없으면 생성).
### Task 3: 성장의 신전 — `JobRow` 접기. Test `V2JobLadder.test.tsx`.
### Task 4: 낚시 하위 화면 — 상점·위험 해역 보기 전환 `SegmentedControl`, 설명 접기. Tests 기존 파일.
### Task 5: 치료소·은행 — 버튼 위계. Tests 기존 파일.
### Task 6: 잠금 표시 — `V2CharacterMenu`의 `unexploredLocked?: string`, 던전 선택 자물쇠. Tests `V2CharacterMenu.test.tsx`, 던전 선택 새 테스트.
### Task 7: 홈 — 빈 공지·게시글 숨김, 체크리스트 3개 + 나머지 접기. Tests 기존 파일.
### Task 8: PC 2단 — `src/components/ui/TwoPane.tsx` + 인벤토리·모험가 협회. Test `TwoPane.test.tsx`, 협회 테스트 보강.
### Task 9: 마무리 — 예산 낮추기, 전체 검증, 캡처.

각 Task는 실패하는 테스트 → 확인 → 구현 → 통과 → 커밋 순서로 한다.
