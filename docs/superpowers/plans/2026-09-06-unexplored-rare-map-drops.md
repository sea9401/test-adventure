# 미개척지 희귀맵 발견 구현 계획

1. `src/lib/server/huntRoute.test.ts`에 미개척지 승리 시 희귀맵이 발견되고 일반 사냥 최고 개방 단계로 저장되는 통합 회귀 테스트를 추가한다.
2. 테스트가 현재의 미개척지 예외 분기 때문에 실패하는지 확인한다.
3. `src/app/api/v2/dungeon/hunt/route.ts`에서 미개척지 예외를 제거하고, 미개척지일 때 `latestUnlockedHuntStageDepth(frontierDepth)`를 희귀맵 생성 깊이로 전달한다.
4. 관련 통합·단위 테스트, 타입 검사, 린트와 전체 테스트를 실행한다.
5. 변경을 검토하고 기능 커밋을 남긴다. 배포는 수행하지 않는다.
