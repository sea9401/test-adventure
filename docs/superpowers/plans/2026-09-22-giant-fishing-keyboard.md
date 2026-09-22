# 거대어 키보드 조작 구현 계획

**Goal:** #710의 버튼 클릭 없는 Enter/Space 감아올리기 지원.
**Architecture:** 공용 실시간 패널의 window 키 이벤트를 기존 hook의 down/up으로 연결한다. 기존 hook의 포인터 혼합 입력과 서버 입력 기록을 재사용한다.
**Tech Stack:** React, TypeScript, Vitest, Testing Library.

현재 브랜치에서 관련 파일만 수정하고 커밋한다. 기존 작업 트리의 다른 변경은 보존한다. 사용자 지침에 따라 서브에이전트와 별도 승인 절차 없이 진행한다.

## 구현 및 검증

- [x] BossPanel 테스트에 document.body를 대상으로 Enter/Space down/up을 보내 aria-pressed 전환을 확인하는 실패 테스트 작성 및 실행.
- [x] RealtimePanel에 키 이벤트 등록/해제, 입력 대상 필터, 활성 상태 잠금, 누른 키 집합을 추가하고 기존 버튼 로컬 키 핸들러를 대체. 안내 문구 추가.
- [x] RealtimePanel 테스트로 입력창/버튼/편집 영역/대화상자 충돌, 조합 입력, 키 반복, 복수 키, 포커스 이동과 창 blur, 잠금 상태를 확인.
- [x] 관련 패널·hook·View 회귀 테스트, 변경 파일 ESLint, TypeScript 검사를 실행하고 diff를 자체 검토.
- [x] 해당 변경만 현재 브랜치에 커밋.

## 검증 결과

- BossPanel의 버튼 포커스 없는 Enter/Space 테스트 2건이 수정 전 실패하는 것을 확인했다.
- BossPanel, RealtimePanel, useDangerousFishingRealtime, DangerousFishingView, RealtimeFinish의 127개 테스트가 통과했다.
- 변경한 세 코드/테스트 파일의 ESLint와 `git diff --check`가 통과했다.
- 전체 TypeScript 검사는 기본 Node 힙 한도를 초과했다. 8 GiB 한도로 재실행했으나 별도 작업 중인 `src/app/api/v2/events/chuseok/route.test.ts`의 14, 35행 문법 오류(TS1005, TS1128)로 완료하지 못했다. 해당 파일은 수정하지 않았다.
