# 성기사 성력 구현 계획

사용자 승인 설계를 현재 브랜치에서 직접 실행한다. 서브에이전트 및 추가 승인 절차는 사용하지 않는다.

- [x] `holyPower.test.ts`: 성역 4회/상한/갱신/소모, 계수 2~5 경계 회귀를 먼저 작성하고 실패 확인.
- [x] `holyPower.ts`: 정규화, 시전·행동 종료 상태 전이, 계수·로그 스냅샷 구현. 성력 0/40/100에 계수 2/3.2/5를 반환한다.
- [x] `v2Skills.ts`, `v2SkillsCommonCatalog.ts`: 성역/심판 표식, 비용과 설명, 계열 패시브 집계. `aggregateEquippedPassives(equipped, jobId?)`에 현재 직업을 서버에서 전달.
- [x] `combatShared.ts`: 심판 계수를 방어 전 적용하고 공통 감쇠를 중복 적용하지 않음. 패턴 컨텍스트에 성력/성역 전달.
- [x] `holyPowerAdapters.ts`, `engine.ts`, `engine-pvp.ts`, `engineState.ts`: 시전 성공 후 자원 변경, 자기 행동 종료 회복/성력 1회, 전투 초기화.
- [x] `combatPattern.ts`, `V2CombatPatternView.tsx`, `arenaLoadout.ts`: 조건 파싱, 편집 선택지와 100/4 입력 상한, 표시. ATB/레거시 자원 스냅샷에도 연결.
- [x] 공유 시전과 PvE/PvP 실제 패턴 실행, 패시브 계열 경계, 비용·설명·저장 호환을 검사. 관련 Vitest, 타입 검사(6GB), 변경 파일 ESLint와 diff 검토 후 커밋.

검증: 관련 242개 파일 3,105개 테스트 통과. 마지막 테스트 타입 보완 후 해당 4개 재통과. TypeScript(noEmit, 6GB), 변경 파일 ESLint, 모듈 크기 12개, git diff --check 통과. 기존 직업·스킬 데이터 ID 유지 및 전투별 성력 초기화, PvP 양측 대칭을 직접 검토했다.
