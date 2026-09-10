# 상단 상태 적응형 조회 구현 계획

**Goal:** 상태가 같은 화면에서 상단 통합 상태 조회를 60초에서 120초로 완화한다.

**Architecture:** `ChromeStatusProvider`가 성공 응답 snapshot을 비교해 공통 `startAdaptiveVisiblePolling`에 결과를 전달한다. 기존 refresh 이벤트는 scheduler를 재시작한다.

**Tech Stack:** React 19, Next.js 16.2, TypeScript, Vitest, Testing Library.

## 제약

현재 브랜치에서 로컬 변경·검증·커밋을 수행한다. 서브에이전트, 배포, 푸시 없이 진행하고 기존 `tsconfig.json` 변경은 보존한다. Next.js 로컬 `use-client` 문서를 확인했다.

## 1. Provider 회귀 테스트와 구현

- [x] `src/adventure/v2/ChromeStatusProvider.test.tsx`에 0·60·120초의 세 요청 후 239,999ms까지 추가 요청이 없고 240,000ms에 갱신되는 테스트를 작성한다. 변경 응답 뒤 60초 재조회도 확인한다.
- [x] hidden 최초 마운트, 실패 상태 보존, 이벤트 후 기본 주기 복구, in-flight 중복 방지와 unmount 정리 테스트를 추가한다.
- [x] `npm test -- src/adventure/v2/ChromeStatusProvider.test.tsx`로 의도한 실패를 확인한다.
- [x] Provider refresh가 `Promise<AdaptivePollOutcome>`를 반환하고 성공 상태 snapshot을 비교하도록 한다. effect의 interval을 `startAdaptiveVisiblePolling({ task: refresh, delayMs: idle => idle >= 2 ? NOTIF_POLL_MS * 2 : NOTIF_POLL_MS })`로 교체한다. visible refresh 이벤트는 기존 scheduler를 중단한 뒤 다시 시작한다.
- [x] Provider·NotificationBell·V2NoticeLink·GameChrome·V2TopBar·공통 scheduler 테스트를 실행한다.

## 2. 검증과 커밋

- [x] 변경 파일 lint, `npx tsc --noEmit`, `git diff --check`를 실행한다.
- [x] hidden/복귀, 실패, 이벤트 및 진행 중 요청의 timer 수명과 snapshot 비교를 자체 리뷰한다.
- [x] 이 작업 파일만 명시적으로 stage하고 `perf: back off unchanged chrome status polling`으로 커밋한다.
- [x] 테스트 결과와 요청 절감의 범위·알림 지연 한계를 보고한다.

## 검증 기록

- 구현 전 Provider 회귀 테스트: 의도한 실패 6개 확인.
- 구현 후 Provider·consumer·공통 scheduler: 6개 파일, 34개 테스트 통과.
- 이전 4차 변경 회귀 재확인: 11개 파일, 37개 테스트 통과.
- 변경 파일 ESLint, 전체 TypeScript 검사, `git diff --check` 통과.
- 자체 리뷰에서 API 및 consumer 계약 유지, hidden 최초 요청 중단, 이벤트 재예약과 in-flight guard, unmount 정리를 확인했다.
- 이번 변경은 단일 client Provider 범위이므로 전체 테스트와 production build는 다시 실행하지 않았다. 이전 전체 테스트 실패 11개는 수정하지 않았다.
