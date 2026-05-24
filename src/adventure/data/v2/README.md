# v2 데이터

v2 리워크의 새 데이터 폴더. 라이브의 권역(region) 시스템을 폐기하고 던전 + 거점 두 시스템으로 대체.

## 파일

- `types.ts` — 핵심 타입 (Dungeon, DungeonFloor, Outpost, OutpostType, OutpostTier, OutpostPolicy, OutpostOccupation)
- `dungeon.ts` — 단일 던전 5층 정적 데이터 (현재 골격만, 몬스터 매핑·튜닝은 후속 PR)
- `outposts.ts` — 거점 정적 데이터 (현재 절대 중립 거점 sketch 만, 일반 거점 배치는 후속 PR)

## 라이브와의 관계

- **재활용**: Monster 타입, 전투 엔진, 스킬·특기, 아이템·강화·마법부여, 거래소
- **폐기 대상**: regions(권역), world.ts 의 region/edge 구조, 권역별 사냥 흐름
- **신규**: Dungeon 5층, Outpost 4 tier × 4 type, 스태미너 시스템, 거점 점령/세금/정책, 군사 시스템

자세한 디자인은 [docs/v2-rewrite-plan.md](../../../../docs/v2-rewrite-plan.md) 참고.
