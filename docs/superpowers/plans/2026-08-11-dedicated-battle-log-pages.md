# Dedicated Battle Log Pages Implementation Plan

**Goal:** 모든 플레이어 전투 로그를 긴 로그에 적합한 전용 페이지 경험으로 통일하고 뒤로가기와 맨 위 이동을 제공한다.

**Architecture:** 기존 URL형 리플레이는 페이지 렌더 모드를 사용하고, 결과 화면형 리플레이는 세션 한정 handoff ID를 발급해 공용 동적 경로로 이동한다. `BattleScene`의 로그 레이아웃만 공용화해 기존 구조화 로그 표현은 유지한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest

## Constraints

- 운영 DB 쓰기와 네트워크 요청을 불필요하게 늘리지 않는다.
- 전투 계산과 저장된 로그 형식은 변경하지 않는다.
- 페이지 표면은 공용 불투명 surface 토큰을 사용한다.
- 배포와 점검 모드 변경은 수행하지 않는다.

### Task 1: Handoff 저장소와 자연 흐름 로그

- [x] handoff 저장·조회·만료 회귀 테스트 작성 및 실패 확인
- [x] `BattleScene` 페이지 로그 레이아웃 회귀 테스트 작성 및 실패 확인
- [x] 세션 저장소와 메모리 백업 구현
- [x] `BattleScene`에 자연 흐름 로그 모드 구현

### Task 2: 공용 로그 페이지와 편의 기능

- [x] `/battle/log/[handoffId]` 동적 페이지와 로딩 화면 구현
- [x] 공용 뒤로가기 헤더, 오류 상태, 구조화/문자열 로그 렌더 구현
- [x] 스크롤 감지형 `맨 위로` 버튼 구현
- [x] `ReplayBattleScene`을 이동 카드/페이지 렌더 모드로 분리

### Task 3: 모든 플레이어 전투 연결

- [x] 아레나 일반전·토너먼트·협동 보스는 페이지 모드로 전환
- [x] 사냥·숙련의 탑·폭풍 원정·대련·영지 관련 전투는 공용 이동 카드로 전환
- [x] 대련의 기존 전체 로그 모달 제거
- [x] 격자 던전 문자열 로그에 공용 전용 페이지 이동 추가

### Task 4: 검증과 커밋

- [x] 집중 테스트와 전체 테스트 실행
- [x] TypeScript, ESLint, production build 실행
- [x] `git diff --check` 및 범위 검토
- [x] 로컬 커밋
