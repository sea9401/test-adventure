# 미개척지 탐사 등급 구현 계획

설계: `docs/superpowers/specs/2026-11-16-unexplored-exploration-grade-design.md`

각 단계는 실패하는 테스트를 먼저 쓰고 구현한다.

1. `src/adventure/data/v2/unexploredGrade.ts`(신규, 의존 없음): 등급 경험치 상수, 등급·진행도 계산,
   추가 포인트 문턱(5 × k(k+1)/2), 프리셋 칸 수(10·40), 흔적 상한(20·60), 칭호 문턱(10·50·100).
2. `unexploredProgression.ts` `grantExplorationXp`: 30포인트 뒤 경험치 누적, 넘긴 경험치 이월, `gradesGained` 반환.
3. `unexploredState.ts`: 프리셋 5칸(파싱·빈 세이브), `unexploredEarnedPoints`에 추가 포인트 합산.
4. `unexploredRewards.ts`·`unexploredHuntRewards.ts`: 흔적 상한을 인자로 받고 파싱은 최대 상한으로 자른다.
   `unexploredHunt.ts`가 세이브의 등급으로 상한을 넘긴다.
5. `unexploredService.ts`: 스냅샷 필드, `switch_preset` 잠금 검사(`preset_locked`), 라우트 오류 문구.
6. 사냥: `applyUnexploredHuntProgress`·`huntExecution.ts`가 `gradesGained`를 돌려주고, 등급이 오르면 알림을 넣고
   `applyHuntAdventureProgress`에 칭호를 넘긴다. `titles.ts`에 칭호 3개, `v2-notification-config.ts`에 알림 종류.
7. 랭킹: `stageMetrics.ts` 지표 목록, `api/rankings/route.ts` 조회, `RankingsView.tsx` 탭.
8. 화면: `V2UnexploredTreeView.tsx` 진행 카드·흔적 상한, `UnexploredPresetSelector.tsx` 잠긴 칸,
   `V2NotificationsView.tsx`·`NotificationBell.tsx` 알림 표시.
9. 안내서 `hunting.tsx`, 변경 기록 `docs/content-modification-records/2026-11-16-unexplored-exploration-grade.md`.
10. 검증: 관련 테스트, tsc, eslint, 모듈 예산, 슬롭 검사, 전체 vitest, 임시 미리보기로 화면 확인.
