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

// === 개척 정착지 (Phase 3) — 마을 아래 "개척마을" 신설 ===============================
// 개척마을(frontier)은 땅(영지)을 보유하지 않고 시작 → 마을(village)로 승격할 때 비로소
// 3×3 영지를 얻는다. 그 승격 비용이 가장 비싸다(영지 획득의 대가). 마을→도시→대도시.
export const TILE_SETTLEMENT_TIERS = [
  "frontier",
  "village",
  "city",
  "metropolis",
] as const;
export type TileSettlementTier = (typeof TILE_SETTLEMENT_TIERS)[number];

export const TILE_TIER_LABEL: Record<TileSettlementTier, string> = {
  frontier: "개척마을",
  village: "마을",
  city: "도시",
  metropolis: "대도시",
};

// 개척마을은 땅 미보유. 마을(village)+ 는 3×3 영지를 보유(점선 경계 표시).
export const tileTierOwnsLand = (t: TileSettlementTier) => t !== "frontier";

// 비용(목업 골드) — 건설은 싸고, 영지를 얻는 개척마을→마을 승격이 가장 비싸다. 다이얼.
export const TILE_FOUND_COST = 100;
export const TILE_PROMOTE_COST: Record<TileSettlementTier, number> = {
  frontier: 1000, // → 마을 (영지 획득)
  village: 1500, // → 도시
  city: 3000, // → 대도시
  metropolis: 0, // 최고 티어
};

// 다음 티어(없으면 null = 최고).
export const tileNextTier = (
  t: TileSettlementTier,
): TileSettlementTier | null => {
  const i = TILE_SETTLEMENT_TIERS.indexOf(t);
  return i >= 0 && i < TILE_SETTLEMENT_TIERS.length - 1
    ? TILE_SETTLEMENT_TIERS[i + 1]
    : null;
};

export const isTileSettlementTier = (v: unknown): v is TileSettlementTier =>
  typeof v === "string" &&
  (TILE_SETTLEMENT_TIERS as readonly string[]).includes(v);

// 정착지 이름 — 칸 좌표 결정적 해시(서버·클라 동일·랜덤 회피).
const TILE_NAME_POOL = [
  "가람",
  "나루",
  "다온",
  "라온",
  "마루",
  "바롬",
  "사하",
  "아라",
  "자운",
  "해온",
];
export const tileSettlementName = (col: number, row: number) =>
  TILE_NAME_POOL[Math.abs(col * 7 + row * 13) % TILE_NAME_POOL.length];
