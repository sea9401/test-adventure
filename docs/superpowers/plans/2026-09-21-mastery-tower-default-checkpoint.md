# 숙련의 탑 기본 입장 수정 계획

**Goal:** 시작층 없는 새 등반이 보유 체크포인트를 사용하도록 한다.
**Architecture:** `resolveMasteryTowerAttemptFloor`의 새 등반 기본값만 변경한다.
**Tech Stack:** TypeScript, Vitest, Next.js 16.

사용자 지침에 따라 현재 브랜치에서 직접 진행하며 서브에이전트와 배포는 사용하지 않는다.

- [x] `masteryTower.test.ts`에 날짜/주간 변경, 역대 기록 복구, 패배 후 기본 입장 및 신규 계정 테스트를 추가한다.
- [x] `masteryTowerRollover.test.ts`에서 9월 20일 → 21일 정산 상태의 기본 입장이 81층이며 전날 보상은 한 번만 지급되는지 검증한다.
- [x] 테스트를 실행해 수정 전 81층 기대값이 1층으로 실패하는지 확인한다.
- [x] `const floor = requestedStartFloor ?? masteryTowerCheckpointStartFloor(state) ?? 1;`로 기본값을 수정한다.
- [x] 관련 도메인·정산·요청·보상·화면 테스트와 변경 파일 lint를 실행하고 diff를 검토한다.
- [x] 검증 결과를 기록하고 해당 변경만 현재 브랜치에 커밋한다.

검증: 수정 전 5개 테스트에서 `expected floor: 81 / received floor: 1` 실패 확인.
수정 후 관련 7개 파일의 52개 테스트 통과. 변경한 TypeScript 파일 3개의 ESLint와
`git diff --check` 통과. 직접 diff를 검토해 명시적 시작층 검증과 진행 중 등반 분기를
유지하는지 확인했다. 운영 계정 요청 이력 조회, 전체 빌드, 배포는 수행하지 않았다.
