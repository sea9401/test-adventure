# Grid Dungeon Handoff

## 2026-06-30

브랜치: `feature/grid-dungeon-daily-rewards`

배포 상태: 배포하지 않음. 기능 브랜치에만 커밋/푸시 완료.

오늘 주요 작업:
- 지도 타일 `(3, 2)`에 첫 격자 던전 입구 추가.
- 첫 던전 `낡은 지하 유적` 기본 플로우 구현.
- 일일 재료 보상 제한 구조 추가.
- 기존 사냥터 재료 드랍률 너프 후 던전 보상은 재료 중심으로 조정.
- 던전 맵 랜덤 생성과 플레이 가능성 검증 로직 추가.
- 길드원 2명 비동기 지원 기능 추가.
- 지원자 역할 카드, 지원 횟수 제한, 지원자 명예 보상 구조 추가.
- 지원자 스킬 세팅 스냅샷 기반 전투 적용.
- 전열/후열 배치와 전열 피격 완화/대상 유도 로직 추가.
- 파티 전투 기여도 UI 추가.
- 던전 보상 미리보기, 탐험률, 보스/출구 발견 상태, 전투 로그 분류 UI 추가.
- 첫 던전 정의 데이터 `GRID_DUNGEON_DEFINITION` 추가.

최근 커밋:
- `24bccbe3 Polish grid dungeon daily flow`
- `f5020a67 Clarify grid dungeon reward claiming`
- `8c3c8d5d Improve grid dungeon map generation`
- `ab3a1e9b Tune grid dungeon material rewards`
- `be687d65 Show grid dungeon support reward status`
- `af5c68d6 Tune grid dungeon formation balance`

검증:
- `npx tsc --noEmit` 통과.
- `npx vitest run src/adventure/data/v2/gridDungeon.test.ts src/adventure/data/v2/gridDungeonCombat.test.ts` 통과.
- `npm run build` 통과.

빌드 참고:
- `DATABASE_URL not set`으로 로컬 마이그레이션은 스킵됨.
- 기존 미참조 이미지 경고 4개가 계속 표시됨:
  - `/images/monster/v2/forest-bear.webp`
  - `/images/monster/v2/mountain-bison.webp`
  - `/images/monster/v2/mountain-brigand.webp`
  - `/images/monster/v2/mountain-cliff-wolf.webp`

내일 이어갈 추천 순서:
1. 배포 전 실제 플레이 테스트
   - 입장, 이동, 전투, 보물, 보스, 정산까지 전체 흐름 확인.
   - 지원자 0명/1명/2명, 전열을 본인/동료로 바꾼 체감 확인.
2. 보상 수치 점검
   - 일 3회 제한 기준 기대 재료량 확인.
   - 희귀 재료와 소환권 체감 드랍률 확인.
3. 난이도 점검
   - 솔로, 1지원, 2지원 기준 보스 클리어율 확인.
   - 권장 전투력 또는 권장 파티 기준 표시 여부 결정.
4. 맵 UX 보강
   - 이동 가능한 방향 강조.
   - 벽/막힌 방향 이동 안내 개선.
   - 처리 완료 칸과 미처리 칸 구분 강화.
5. 두 번째 던전 추가 준비
   - `GRID_DUNGEON_DEFINITION`을 여러 던전용 구조로 확장.
   - 지역별 입구, 크기, 보상, 난이도 분리.
