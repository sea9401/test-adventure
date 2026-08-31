# Arena Sanctioned Opponent Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 제재 중인 계정이 아레나 실유저 상대 후보로 선택되지 않게 한다.

**Architecture:** 새 `filterArenaOpponentEligibleRows`가 기존 제재 만료 필터와 운영 계정
필터를 합성한다. 매치 라우트는 후보 조회에서 `bannedUntil`을 읽고 점수 조회·가중 추첨
전에 이 함수를 적용한다.

**Tech Stack:** Next.js 16.2 Route Handlers, TypeScript, Drizzle ORM, Vitest

## Global Constraints

- 어떤 환경에도 배포하지 않는다.
- 기존 일요일 무료 연습전과 공방 작업을 변경하거나 커밋하지 않는다.
- 제재 만료 의미는 `bannedUntil > now`일 때만 차단하는 기존 서버 규칙과 일치시킨다.

---

### Task 1: 아레나 상대 후보 적격성 필터

**Files:**
- Create: `src/lib/server/arenaOpponentEligibility.ts`
- Create: `src/lib/server/arenaOpponentEligibility.test.ts`
- Modify: `src/app/api/v2/arena/match/route.ts:1-10,324-341`

**Interfaces:**
- Consumes: `{ email, bannedUntil }` 후보 행, `filterRankingEligibleRows`, `excludeArenaOperatorAccounts`.
- Produces: `filterArenaOpponentEligibleRows<T>(rows, now): T[]`.

- [ ] **Step 1: 실패하는 회귀 테스트 작성**

  고정 시각 `2026-08-16T00:00:00.000Z`에서 정상 계정과 만료된 정지만 남고 현재 정지,
  영구 밴, `ADMIN_EMAILS` 운영 계정이 제거되는 입력/기대 배열을 작성한다.

- [ ] **Step 2: 테스트 실패 확인**

  Run: `npm test -- src/lib/server/arenaOpponentEligibility.test.ts`

  Expected: 새 모듈이 없어 import 해석 단계에서 실패한다.

- [ ] **Step 3: 최소 구현**

  `filterArenaOpponentEligibleRows`는 아래 합성만 담당한다.

  ```ts
  return excludeArenaOperatorAccounts(filterRankingEligibleRows(rows, now));
  ```

  매치 후보 select에 `bannedUntil: users.bannedUntil`을 추가하고
  `filterArenaOpponentEligibleRows(candidateRows, now)` 결과를 `candidateChars`로 사용한다.

- [ ] **Step 4: 관련 검증 실행**

  Run: `npm test -- src/lib/server/arenaOpponentEligibility.test.ts src/lib/server/rankingEligibility.test.ts src/lib/server/arenaOperatorEligibility.test.ts src/lib/server/arena.test.ts`

  Expected: PASS.

  Run: `npx eslint src/lib/server/arenaOpponentEligibility.ts src/lib/server/arenaOpponentEligibility.test.ts src/app/api/v2/arena/match/route.ts`

  Expected: 오류와 경고 없이 종료.

  Run: `npx tsc --noEmit`

  Expected: 타입 오류 없이 종료.

- [ ] **Step 5: 커밋**

  ```bash
  git add docs/superpowers/specs/2026-08-16-arena-sanctioned-opponent-filter-design.md docs/superpowers/plans/2026-08-16-arena-sanctioned-opponent-filter.md src/lib/server/arenaOpponentEligibility.ts src/lib/server/arenaOpponentEligibility.test.ts src/app/api/v2/arena/match/route.ts
  git commit -m "fix: exclude sanctioned arena opponents"
  ```
