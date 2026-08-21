# Tier 0 Job Hunt Codex Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생존자·변이자 사냥 승리가 도감 숙련도 `unknown_entry` 예외로 실패하지 않게 한다.

**Architecture:** 사냥의 직업 숙련도 적립은 유지하고, 도감 이벤트를 조립하는 경계에서 직업 카탈로그의 차수를 확인한다. 0단계 직업만 `job.victory` 이벤트에서 제외하며 다른 도감 검증은 그대로 유지한다.

**Tech Stack:** Next.js Route Handler, TypeScript, Vitest

## Global Constraints

- 운영 최신 `main`에서 수정한다.
- DB 데이터와 스키마를 변경하지 않는다.
- 배포는 별도 요청 전까지 실행하지 않는다.

---

### Task 1: 0단계 직업 사냥 회귀 방지

**Files:**
- Modify: `src/lib/server/huntRoute.test.ts`
- Modify: `src/app/api/v2/dungeon/hunt/route.ts`

**Interfaces:**
- Consumes: `jobById(id: string): V2JobDefinition | undefined`
- Produces: 도감 카탈로그 대상 직업만 포함하는 사냥 숙련도 이벤트 배열

- [ ] **Step 1: 실패하는 통합 테스트 작성**

  생존자와 변이자로 승리 사냥을 실행하고, 도감 카탈로그에 없는 직업 이벤트를 거부하는 기록기 경계에서도 HTTP 200과 직업 숙련도 증가를 확인한다.

- [ ] **Step 2: RED 확인**

  Run: `npm test -- src/lib/server/huntRoute.test.ts`

  Expected: `survivor` 또는 `mutant`의 `unknown_entry` 예외로 새 테스트가 실패한다.

- [ ] **Step 3: 최소 구현**

  `route.ts`에서 `masteryJobId`에 대응하는 직업의 `tier`가 0보다 클 때만 `job.victory` 이벤트를 추가한다.

- [ ] **Step 4: GREEN 및 관련 회귀 검증**

  Run: `npm test -- src/lib/server/huntRoute.test.ts src/app/api/v2/dungeon/hunt/huntProficiency.test.ts`

  Expected: 두 테스트 파일이 모두 통과하고 기존 전사 이벤트도 유지된다.

- [ ] **Step 5: 정적 검사**

  Run: `npx eslint src/app/api/v2/dungeon/hunt/route.ts src/lib/server/huntRoute.test.ts`

  Expected: 오류 0건.

- [ ] **Step 6: 커밋**

  ```bash
  git add docs/superpowers/specs/2026-08-21-tier0-job-hunt-codex-hotfix-design.md docs/superpowers/plans/2026-08-21-tier0-job-hunt-codex-hotfix.md src/app/api/v2/dungeon/hunt/route.ts src/lib/server/huntRoute.test.ts
  git commit -m "fix: keep tier zero jobs hunting"
  ```
