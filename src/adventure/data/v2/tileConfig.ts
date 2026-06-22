// === 자유 타일 지도 — 보드/거점 배치 (Phase 1, 비파괴) =================================
// 옛 23거점 노드 지도를 9×9 타일 보드로 교체하는 첫 단계의 정적 데이터.
//
// 🔑 유지 거점 9개는 기존 outpost id 를 그대로 재사용한다 — 점령/마을/금고/세이브가 자연
//    승계되고(별도 마이그 불요), 나머지 14개 거점은 새 보드에서 단순히 "표시 안 함"이다.
//    옛 outposts.ts / outpostGraph.ts 는 손대지 않는다(컷오버 전까지 라이브 모델 보존).
// 🔑 이동/정착 로직은 Phase 1 에서 불변 — 이 모듈은 "어떤 거점이 어느 칸에 놓이나"만 정의.

export const TILE_BOARD_SIZE = 9; // 9×9
export const TILE_BOARD_CENTER = 4; // 정중앙 칸 (0..8)

export type TileCoord = { col: number; row: number };

export const tileKey = (col: number, row: number) => `${col},${row}`;

// 리베라(중앙 자유도시)를 정중앙으로 한 3×3 = 유지 거점 9개. 실제 outpost id 재사용.
//   배치는 기존 좌표의 대략적 방위를 따른다(북=위, 남=아래, 동=오른쪽).
export const TILE_OUTPOSTS: { id: string; col: number; row: number }[] = [
  { id: "kingdom_tatiholm", col: 3, row: 3 }, // 에이라(북서)
  { id: "neutral_north_outpost", col: 4, row: 3 }, // 보레아(북)
  { id: "kingdom_silverbance", col: 5, row: 3 }, // 로렌(북동)
  { id: "kingdom_blackforge", col: 3, row: 4 }, // 코린(서)
  { id: "neutral_haven_central", col: 4, row: 4 }, // 리베라(중앙)
  { id: "neutral_east_outpost", col: 5, row: 4 }, // 에우로스(동)
  { id: "kingdom_sunderhold", col: 3, row: 5 }, // 세라(남서)
  { id: "neutral_south_outpost", col: 4, row: 5 }, // 노토스(남)
  { id: "kingdom_ragnarod", col: 5, row: 5 }, // 발렌(남동)
];

// 칸("col,row") → outpost id.
export const TILE_OUTPOST_AT = new Map(
  TILE_OUTPOSTS.map((t) => [tileKey(t.col, t.row), t.id]),
);
// outpost id → 칸 좌표.
export const TILE_POS_BY_OUTPOST = new Map(
  TILE_OUTPOSTS.map((t) => [t.id, { col: t.col, row: t.row } as TileCoord]),
);
// 새 보드에 남는 거점 id 집합(나머지는 표시 제외).
export const TILE_KEPT_OUTPOST_IDS = new Set(TILE_OUTPOSTS.map((t) => t.id));
