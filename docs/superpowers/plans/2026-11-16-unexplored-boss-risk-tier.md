# 미개척지 개인 보스 위험도 구현 계획

설계: `docs/superpowers/specs/2026-11-16-unexplored-boss-risk-tier-design.md`

각 단계는 실패하는 테스트를 먼저 쓰고 구현한다.

1. `src/adventure/data/v2/unexploredBossRisk.ts`(순수): 배율, 보상, 선택 가능 위험도, 기록, 칭호 문턱.
2. `unexploredState.ts`: `bossRisk` 파싱.
3. `coopBosses.ts`: 기믹 상태의 `riskTier` 보존과 위험도 체력 기준 정규화, `coopBossForBattle`의 최대 체력·배율 옵션.
4. `v2Coop.ts` `createCoopBossSession`: 위험도 체력과 `riskTier` 저장. `unexplored/summon` 라우트의 요청 검증.
5. `coop/attack`, `coop/[sessionId]` 라우트: 세션 체력과 위험도를 전투 보스에 전달.
6. `coop/claim` 라우트와 `unexploredBossRewards.ts`: 위험도 보상, 최고 위험도 기록, 칭호.
7. 랭킹 `bossRisk`, 화면(소환 때 위험도 선택, 보스 목록·상세 표시), 안내서, 변경 기록.
8. 검증: 관련 테스트, tsc, eslint, 모듈 예산, 슬롭 검사, 전체 vitest, 화면 확인.
