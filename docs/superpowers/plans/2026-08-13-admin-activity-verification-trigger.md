# Admin Activity Verification Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최고 관리자가 특정 유저의 다음 생활 행동에 일반 또는 2단계 사람 확인을 1회 강제 표시하고 결과를 운영 이력에서 확인할 수 있게 한다.

**Architecture:** 기존 `activity-guard.v1`의 활동별 엔트리에 위험 점수와 독립적인 10분짜리 관리자 요청 표식을 추가한다. 관리자 전용 Route Handler가 이 표식을 설정·조회·취소하고, 기존 활동 게이트와 확인 Route Handler가 수동 요청을 판별해 표시·검증·정리한다. 수동 이벤트는 기존 텔레메트리에 남기되 의심 점수 계산에서는 제외한다.

**Tech Stack:** TypeScript, Next.js 16 App Router Route Handlers, React 19, Drizzle/PostgreSQL, Vitest, Testing Library

## Global Constraints

- 운영 배포는 수행하지 않는다.
- 변경 API는 `super` 관리자만 호출할 수 있다.
- 관리자 요청은 10분 후 만료되고, 실제 위험 점수·신호·체크포인트·제재 판단을 바꾸지 않는다.
- 보호 활동은 `fishing`, `woodcutting`, `mining` 세 종류로 제한한다.
- `captcha` 모드는 Turnstile과 hCaptcha가 모두 설정된 경우에만 허용한다.
- 새 관리자 카드와 내부 요소는 불투명 표면을 사용한다.

---

### Task 1: 관리자 요청 도메인 상태

**Files:**
- Modify: `src/lib/server/activityGuard.ts`
- Test: `src/lib/server/activityGuard.test.ts`

**Interfaces:**
- Produces: `ManualActivityVerificationMode`, `setManualActivityVerification(state, activity, mode, now)`, `clearManualActivityVerification(state, activity)`, `activeManualActivityVerification(state, activity, now)`, `activityVerificationContext(state, activity, configured, now)`
- Consumes: 기존 `ActivityGuardState`, `GuardedActivity`, 파서와 확인 초기화 함수

- [ ] **Step 1: 실패 테스트 작성** — 일반/2단계 요청, 10분 만료, 실제 확인 우선, 수동 성공 정리가 위험 점수와 카운터를 보존하는 사례를 리터럴 픽스처로 추가한다.
- [ ] **Step 2: RED 확인** — `npm test -- src/lib/server/activityGuard.test.ts`를 실행해 신규 함수 부재 또는 기대 불일치로 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — 선택 필드를 파싱하고 설정·조회·취소하며 수동 확인 성공 시 표식만 지우도록 구현한다.
- [ ] **Step 4: GREEN 확인** — 같은 테스트를 실행해 통과시킨다.

### Task 2: 활동 게이트와 확인 API 연동

**Files:**
- Modify: `src/lib/server/activityGuardServer.ts`
- Modify: `src/app/api/v2/activity-verification/route.ts`
- Modify: `src/adventure/v2/useActivityVerification.ts`
- Modify: `src/adventure/v2/ActivityVerificationGate.tsx`
- Modify: `src/lib/server/suspiciousUserScore.ts`
- Test: `src/lib/server/activityGuardServer.test.ts`
- Test: `src/lib/server/activityVerificationRoute.test.ts`
- Test: `src/lib/server/suspiciousUserScore.test.ts`

**Interfaces:**
- Consumes: Task 1의 `activityVerificationContext`와 수동 표식 정리 동작
- Produces: 403 응답의 `manualTest: boolean`, 수동 이벤트의 `detail.manualTest`, 중립적인 수동 확인 안내

- [ ] **Step 1: 실패 테스트 작성** — 일반/2단계 응답과 수동 성공·실패 이벤트, 수동 이벤트 의심 점수 제외 사례를 추가한다.
- [ ] **Step 2: RED 확인** — 세 테스트 파일을 실행해 신규 응답 필드와 점수 제외 기대가 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — 서버 컨텍스트, Route Handler 이벤트 상세, 클라이언트 파서·안내 문구와 점수 필터를 구현한다.
- [ ] **Step 4: GREEN 확인** — 세 테스트 파일을 다시 실행해 통과시킨다.

### Task 3: 최고 관리자 API

**Files:**
- Create: `src/app/api/admin/users/activity-verification/route.ts`
- Create: `src/app/api/admin/users/activity-verification/route.test.ts`

**Interfaces:**
- Consumes: Task 1의 관리자 요청 함수, `lockSaveForUpdate`, `upsertSave`, Turnstile/hCaptcha 설정과 관리자 감사 로그
- Produces: `GET`, `POST`, `DELETE /api/admin/users/activity-verification`

- [ ] **Step 1: 실패 테스트 작성** — 조회, 설정, 취소, 권한 거절, 유저 없음, 잘못된 활동·모드, 공급자 미설정과 실제 확인 대기 충돌을 검증한다.
- [ ] **Step 2: RED 확인** — 신규 Route Handler가 없어 테스트가 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — 입력 검증, 대상 조회, 잠금 트랜잭션, 감사 로그와 수동 요구 이벤트 기록을 구현한다.
- [ ] **Step 4: GREEN 확인** — Route Handler 테스트를 통과시킨다.

### Task 4: 관리자 유저 상세 UI

**Files:**
- Create: `src/admin/tabs/users/ActivityVerificationTestSection.tsx`
- Create: `src/admin/tabs/users/ActivityVerificationTestSection.test.tsx`
- Modify: `src/admin/tabs/users/SelectedUserPanel.tsx`

**Interfaces:**
- Consumes: Task 3의 조회·설정·취소 API, `adminMe.capabilities.super`, 전역 `readOnly`
- Produces: 활동·모드 선택, 1회 표시, 활성 상태, 취소와 운영 이력 링크를 제공하는 관리자 카드

- [ ] **Step 1: 실패 테스트 작성** — 상태 조회, 설정 요청, 활성 표시, 취소와 비활성 조건을 실제 컴포넌트 동작으로 검증한다.
- [ ] **Step 2: RED 확인** — `npm test -- src/admin/tabs/users/ActivityVerificationTestSection.test.tsx`를 실행해 컴포넌트 부재로 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — 불투명 `SURFACE_CARD` 기반 카드와 API 상태 처리를 구현하고 유저 상세에 최고 관리자 조건으로 연결한다.
- [ ] **Step 4: GREEN 확인** — 컴포넌트 테스트를 통과시킨다.

### Task 5: 전체 검증과 커밋

**Files:**
- Verify: 위 모든 변경 파일

**Interfaces:**
- Consumes: Tasks 1-4의 완성된 기능
- Produces: 테스트·타입·린트 검증 결과와 단일 기능 커밋

- [ ] **Step 1: 관련 테스트 실행** — 변경한 도메인, 서버, API와 UI 테스트를 함께 실행한다.
- [ ] **Step 2: 정적 검증 실행** — `npx tsc --noEmit`과 변경 파일 대상 ESLint를 실행한다.
- [ ] **Step 3: 자체 검토** — 수동 이벤트가 위험 점수에 반영되지 않고 실제 확인 우선순위와 기존 일반 흐름이 유지되는지 diff를 검토한다.
- [ ] **Step 4: 커밋** — 검증된 파일을 스테이징하고 `feat: add admin activity verification trigger`로 커밋한다.
