# Manual Content Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 `main`의 8월 20~21일 플레이어 노출 변경을 게임 안내서와 패치 노트에 정확히 동기화한다.

**Architecture:** 기존 안내서 컴포넌트 구조를 유지하고 관련 섹션에만 문단·표·목록을 추가한다. 변하기 쉬운 규칙은 게임 데이터 상수를 직접 가져오며, 서버 동작을 바꾸지 않고 정적 렌더 회귀 테스트로 문서 계약을 보호한다.

**Tech Stack:** Next.js 16.2.11, React, TypeScript, Vitest 정적 렌더 테스트, Markdown 패치 노트

## Global Constraints

- 숙소 페이지·API·트로피 전시는 공개하거나 문서화하지 않는다.
- 배포, 운영 기능 플래그, DB 데이터와 점검 모드를 변경하지 않는다.
- 현재 공개된 7차 전직 네 종만 안내한다.
- 내부 보안·DB·CI 구현은 플레이어 안내서에서 제외한다.
- 문서 내용 변경도 핵심 규칙은 테스트를 먼저 실패시킨 뒤 반영한다.

---

### Task 1: 현재 동작과 반대인 안내 교정

**Files:**
- Modify: `src/app/manual/content/coop.tsx`
- Modify: `src/app/manual/content/jobs.tsx`
- Test: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: 협동 보스 비용·쿨다운·가시성 상수, 7차 직업·전직 상수, 기존 정적 렌더 테스트
- Produces: 협동 보스와 전직·수행의 권위 있는 플레이어 설명

- [ ] 협동 보스 비용·공개 범위와 7차·수행 규칙을 요구하는 실패 테스트를 추가한다.
- [ ] `npm test -- src/app/manual/current-content.test.tsx`로 문구 누락 실패를 확인한다.
- [ ] `coop.tsx`와 `jobs.tsx`를 실제 상수와 UI 동작에 맞춰 수정한다.
- [ ] 같은 테스트를 다시 실행해 통과를 확인한다.

### Task 2: 도감 숙련·월간 연구·트로피 안내 추가

**Files:**
- Modify: `src/app/manual/content/compendium.tsx`
- Modify: `src/app/manual/content/quests.tsx`
- Modify: `src/app/manual/content/plaza.tsx`
- Test: `src/app/manual/current-content.test.tsx`

**Interfaces:**
- Consumes: 도감 분야·단계·트로피 상수와 월간 연구 화면 계약
- Produces: 장기 수집, 영구 랭킹, 월간 경쟁과 전시의 연결 설명

- [ ] 6분야·7단계·20,000점·대표 3종·랭킹을 요구하는 실패 테스트를 추가한다.
- [ ] 집중 테스트의 예상 실패를 확인한다.
- [ ] 세 안내서에 기능의 위치, 진행 방식, 보상 원칙과 공개 범위를 추가한다.
- [ ] 집중 테스트를 다시 실행해 통과를 확인한다.

### Task 3: 원정·게시판·거래 및 발견성 보강

**Files:**
- Modify: `src/app/manual/content/hunting.tsx`
- Modify: `src/app/manual/content/plaza.tsx`
- Modify: `src/app/manual/content/skills.tsx`
- Modify: `src/app/manual/content/combat.tsx`
- Modify: `src/app/manual/content/overview.tsx`
- Modify: `src/app/manual/sections.ts`
- Test: `src/app/manual/current-content.test.tsx`
- Test: `src/app/manual/sections.test.ts`

**Interfaces:**
- Consumes: 폭풍 원정 일괄 진행 정책, 게시판 활동 상수, 현재 UI 진입점
- Produces: 위험·제한과 기능 발견성을 포함한 최신 안내

- [ ] 원정 일괄 진행, 게시판 Lv.20, 거래 제한, 장비 등록 상태, 스킬 상세와 틱 표시를 요구하는 실패 테스트를 추가한다.
- [ ] 집중 테스트의 예상 실패를 확인한다.
- [ ] 관련 안내서 본문과 섹션 요약을 최소 범위로 갱신한다.
- [ ] 집중 테스트를 다시 실행해 통과를 확인한다.

### Task 4: 패치 노트와 최종 검증

**Files:**
- Create: `docs/patch-notes/2026-08-21-content-and-collection-update.md`

**Interfaces:**
- Consumes: Task 1~3에서 확정한 플레이어 노출 변경
- Produces: 공지사항에 옮겨 게시할 수 있는 8월 20~21일 업데이트 초안

- [ ] 기능·편의·수정 사항과 숙소 제외 범위를 패치 노트로 작성한다.
- [ ] 안내서 테스트 전체와 `sections.test.ts`를 실행한다.
- [ ] TypeScript, 수정 파일 ESLint, 프로덕션 빌드와 `git diff --check`를 실행한다.
- [ ] 변경 목록을 재검토하고 숙소 노출 문구가 없는지 확인한 뒤 커밋한다.

