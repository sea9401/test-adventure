# Economy Webhook Trade Details Implementation Plan

> **For agentic workers:** Implement inline in the current workspace. Do not deploy.

**Goal:** 대규모 골드 이동 알림에 임계치를 만든 실제 거래들의 합계와 상세 흐름을 표시한다.

**Architecture:** `economyLog`가 안전한 거래 샘플을 만들고 `opsAlert`의 신호 버킷이 최대
5건을 보관한다. 웹훅 직전에 계정 이름을 해석하고 허용 목록 기반 표시 문자열로 바꾼다.

**Tech Stack:** TypeScript, Next.js Route Handlers, Drizzle, Vitest

## Global Constraints

- 운영 DB는 읽기 전용 조사만 수행한다.
- 외부 웹훅에는 전체 UUID와 임의 상세 JSON을 노출하지 않는다.
- 배포하지 않는다.

### Task 1: 신호 샘플 집계

**Files:** `src/lib/server/opsAlert.ts`, `src/lib/server/opsAlert.test.ts`

- [x] 세 거래 샘플이 하나의 알림에 합쳐지는 실패 테스트를 작성한다.
- [x] 실패가 기존 버킷이 샘플을 저장하지 않아서 발생하는지 확인한다.
- [x] 버킷에 최대 5개 샘플과 유입·유출 합계를 추가한다.
- [x] 계정 이름·짧은 ID 변환과 안전한 거래 목록 포맷을 구현한다.
- [x] 테스트를 통과시킨다.

### Task 2: 경제 이벤트 샘플 생성

**Files:** `src/lib/server/economyLog.ts`, `src/lib/server/economyLog.test.ts`

- [x] 대규모 거래의 아이템·수량·매물·총액 메타데이터 실패 테스트를 작성한다.
- [x] `buildLargeGoldMovementSignal` 순수 함수를 구현한다.
- [x] 대규모 골드 신호가 공용 버킷에 샘플을 전달하게 연결한다.
- [x] 테스트를 통과시킨다.

### Task 3: 거래 아이템 이름 해석

**Files:** `src/lib/server/economyLog.ts`, `src/lib/server/economyLog.test.ts`

- [x] 상세에 이름이 없는 기존 거래의 실패 테스트를 작성한다.
- [x] 상세 이름을 우선하고 장비·재료 카탈로그를 대체 경로로 사용한다.
- [x] 관련 테스트를 통과시킨다.

### Task 4: 최종 검증과 커밋

- [x] 관련 Vitest를 실행한다.
- [x] `npx tsc --noEmit`과 대상 ESLint를 실행한다.
- [x] `git diff --check`와 변경 범위를 확인한다.
- [x] 구현 파일만 커밋한다.
