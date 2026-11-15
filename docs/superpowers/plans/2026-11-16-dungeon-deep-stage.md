# 던전 심층 단계 구현 계획

설계: `docs/superpowers/specs/2026-11-16-dungeon-deep-stage-design.md`

각 단계는 실패하는 테스트를 먼저 쓰고 구현한다.

1. `src/adventure/data/v2/dungeonDeepStage.ts`(신규, 순수): 깊이 가산치, 증표 수, 고를 수 있는 단계, 요청 검증, 칭호 문턱.
2. 칭호 6개. 증표는 재료가 아니라 `deep-shop.v1`의 잔액으로 둔다.
3. 세이브: `StormExpeditionState.deepBest`·`deepBestAt`, `StormExpeditionActive.deepStage` 파싱. 성소 적에 단계 반영.
4. 성소 라우트: `start`·`auto`의 `deepStage`, 완주 시 증표·최고 단계·칭호, 상태 응답.
5. 원정 라우트: 같은 내용. 연습 모드는 보상·기록 없음.
6. 교환소: `src/adventure/v2/deepShop.ts`(품목·주간 한도·구매 계산), `src/app/api/v2/deep-shop/route.ts`.
7. 랭킹: 지표 2개와 조회, `RankingsView.tsx` 탭.
8. 화면: 성소 난이도·단계 선택, 원정 출발·일괄 진행 설정, 교환소 화면과 던전 목록 진입.
9. 안내서, 변경 기록.
10. 검증: 관련 테스트, tsc, eslint, 모듈 예산, 슬롭 검사, 전체 vitest, 임시 미리보기 화면 확인.
