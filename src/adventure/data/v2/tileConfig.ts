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

// 보드 위 고정 거점 = 리베라(중앙 자유도시) 하나뿐 — 정중앙(4,4).
//   나머지 칸은 전부 빈 땅: 플레이어가 직접 개척(개척마을→마을→도시→대도시)하는 곳.
//   옛 기본 무소속 거점 8개(보레아/노토스/에우로스 + 에이라/로렌/코린/세라/발렌)는
//   보드에서 내려 빈 땅으로 돌렸다(2026-06-23 오너 결정). outposts.ts 카탈로그엔 남아 있으나
//   보드/이동목록 어디에도 노출 안 됨(unreachable·inert) — 가역적(이 배열만 되돌리면 복원).
export const TILE_OUTPOSTS: { id: string; col: number; row: number }[] = [
  { id: "neutral_haven_central", col: 4, row: 4 }, // 리베라(중앙·절대중립·점령불가)
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
// 빈 땅에 개척마을(frontier) 건설 → 마을(village)→도시(city)→대도시(metropolis) 승격.
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

// 개척마을 건설비(found) — 정착지 진입을 진지한 골드 sink 로(2026-06-23 오너 결정 1천만).
//   이후 승격은 생산 관리(자원)로. ⚠️라이브 found 비용(V2_FREEFORM_TILES on)에 즉시 적용. 다이얼.
export const TILE_FOUND_COST = 10_000_000;
export const TILE_PROMOTE_COST: Record<TileSettlementTier, number> = {
  frontier: 1000, // → 마을
  village: 1500, // → 도시
  city: 3000, // → 대도시
  metropolis: 0, // 최고 티어
};

// === 중앙(리베라) 거리 기반 비용 스케일 ============================================
// 리베라(중앙 TILE_BOARD_CENTER)에서 멀수록 개척·업그레이드 비용↑ → 중앙 요지 경쟁 유도.
//   거리 = 체비셰프 링(max(|Δcol|,|Δrow|)): 중앙 0·한 칸 바깥 1… 9×9 코너 4. 서버·클라 공용 순수함수.
export function tileDistanceFromCenter(col: number, row: number): number {
  return Math.max(
    Math.abs(col - TILE_BOARD_CENTER),
    Math.abs(row - TILE_BOARD_CENTER),
  );
}

// 거리 배수 — 중앙 1×, 링당 +STEP(선형). 🔧다이얼: STEP 0.5 = 코너(거리4) 3×. 중앙은 항상 기본비용.
export const TILE_COST_DISTANCE_STEP = 0.5;
export function tileCostMultiplier(col: number, row: number): number {
  return 1 + TILE_COST_DISTANCE_STEP * tileDistanceFromCenter(col, row);
}

// 골드 비용에 거리 배수 적용(정수 반올림). 중앙=기본·멀수록↑.
export function scaledTileGoldCost(
  base: number,
  col: number,
  row: number,
): number {
  return Math.round(base * tileCostMultiplier(col, row));
}

// 자원 비용(종류별 수량)에 거리 배수 적용(정수 반올림). 단계 승격(자원) 거리 스케일에 사용.
export function scaledTileResourceCost<K extends string>(
  base: Partial<Record<K, number>>,
  col: number,
  row: number,
): Partial<Record<K, number>> {
  const mult = tileCostMultiplier(col, row);
  const out: Partial<Record<K, number>> = {};
  for (const [k, v] of Object.entries(base) as [K, number][]) {
    out[k] = Math.round(v * mult);
  }
  return out;
}

// 다음 티어(없으면 null = 최고).
export const tileNextTier = (
  t: TileSettlementTier,
): TileSettlementTier | null => {
  const i = TILE_SETTLEMENT_TIERS.indexOf(t);
  return i >= 0 && i < TILE_SETTLEMENT_TIERS.length - 1
    ? TILE_SETTLEMENT_TIERS[i + 1]
    : null;
};

// 이전 티어(없으면 null = 최하 frontier). 정복 함락 시 1단계 강등에 사용(settlement.ts prevTier 미러).
export const tilePrevTier = (
  t: TileSettlementTier,
): TileSettlementTier | null => {
  const i = TILE_SETTLEMENT_TIERS.indexOf(t);
  return i > 0 ? TILE_SETTLEMENT_TIERS[i - 1] : null;
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
