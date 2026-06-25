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

// === 타일 인접(4방향·상하좌우) — 영토 PvP 정복 인접 게이트용 =========================
// 영토전 정복은 "내 영지에 인접한 칸"만 칠 수 있다(연속 확장). 인접 = 폰 노이만 거리 1
//   (상하좌우만·대각선 제외). 순수 함수(서버·클라 공용).
export function areTilesAdjacent4(
  aCol: number,
  aRow: number,
  bCol: number,
  bRow: number,
): boolean {
  return Math.abs(aCol - bCol) + Math.abs(aRow - bRow) === 1;
}

// 보드 경계 내 상하좌우 이웃 칸(0..TILE_BOARD_SIZE-1).
export function tileNeighbors4(col: number, row: number): TileCoord[] {
  const deltas = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as const;
  const out: TileCoord[] = [];
  for (const [dc, dr] of deltas) {
    const c = col + dc;
    const r = row + dr;
    if (c >= 0 && c < TILE_BOARD_SIZE && r >= 0 && r < TILE_BOARD_SIZE) {
      out.push({ col: c, row: r });
    }
  }
  return out;
}

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

// === 전략 지형 레이어 (P1) — 손배치 특수 타일 ====================================
// 9×9 보드는 칸이 거의 균질해 "어디에 정착하느냐"가 입지 싸움이 아니다. 지형(terrain)을 소수
//   손배치해 칸마다 가치를 차등화한다(절차생성 X — 균형·기억가능성). docs/v2-map-terrain-plan.md.
//
// terrain(지도 고정) ↔ trait(정착지 속성·settlement.ts TerrainTrait)은 별개 책임 — 이 레이어는
//   그 위에 보정/차단으로만 얹힌다. 생산(나무/광물) 코드는 무접촉.
//
// 🔑 P1 범위 = 데이터/타입/헬퍼 + 산맥·협곡·호수. "통행/정착 불가"는 settleable=false 하나로
//    표현(found/move-tile 라우트가 거부). 산맥·호수는 소유 불가라 정복 인접 사슬의 디딤돌도 못 됨
//    → 별도 인접 차단 코드 불요. 온천(건강도)·요새터(fortHp)·교역로(세금)·호수 방어보너스 등
//    수치 효과는 후속 PR(P2/P3) — P1 은 통행/정착 게이트만.
export type TileFeatureKind =
  | "mountain" // 정복-인접 벽 — 정착·소유 불가(settleable=false). 인접 사슬 차단(구조적).
  | "canyon" // 산맥 벽에서 유일하게 소유 가능한 칸 = 길목(settleable=true).
  | "lake" // 수공(水攻) 방어 — 통행/정착 불가(settleable=false). 인접 방어보너스는 후속 PR.
  | "hotspring" // 건강도(전쟁HP) 회복 가속 — 후속 PR(P2·미배치).
  | "stronghold" // 수비/성벽 fortHp ↑ — 후속 PR(P3·미배치).
  | "trade_route"; // 경제(영주 세금) ↑ — 후속 PR(P3·미배치).
// 미래(진입형 던전): | "dungeon" — settleable=false + interaction(§7 자리 예약).

export type TileFeature = {
  kind: TileFeatureKind;
  // 정착/소유 가능한 칸인가. false = 빈 칸이지만 found/이동 불가(산맥·호수·던전).
  settleable: boolean;
  // 진입형 콘텐츠(미래 던전)의 진입 정의. 없으면 비-진입 지형(§7). P1 미사용(자리 예약).
  interaction?: { kind: string; routeId: string; access: "neutral" | "owner" };
};

// 손배치 — 좌표 키 "col,row" → 피처. 미배치 칸은 평범한 빈 땅(이동·정착 자유).
//   P1 배치: 좌측 산맥 줄(col2)이 협곡(2,4)로만 뚫림 + 우측 산맥 줄(col6)이 협곡(6,2)로만 뚫림 +
//   우하단 소형 호수(통행 불가). 산맥 줄은 보드 끝까지 안 닿게(우회로 보존). 리베라 인접 링
//   (3,4)(5,4)(4,3)(4,5)은 비워둔다(land-less 길드 bootstrap 초크와 무겹침).
export const TILE_TERRAIN: Record<string, TileFeature> = {
  // 좌측 산맥 줄(col2) — 협곡(2,4)이 유일한 통로.
  [tileKey(2, 1)]: { kind: "mountain", settleable: false },
  [tileKey(2, 2)]: { kind: "mountain", settleable: false },
  [tileKey(2, 3)]: { kind: "mountain", settleable: false },
  [tileKey(2, 4)]: { kind: "canyon", settleable: true },
  [tileKey(2, 5)]: { kind: "mountain", settleable: false },
  // 우측 산맥 줄(col6) — 협곡(6,2)이 유일한 통로.
  [tileKey(6, 0)]: { kind: "mountain", settleable: false },
  [tileKey(6, 1)]: { kind: "mountain", settleable: false },
  [tileKey(6, 2)]: { kind: "canyon", settleable: true },
  [tileKey(6, 3)]: { kind: "mountain", settleable: false },
  // 우하단 소형 호수 — 통행/정착 불가(인접 방어보너스는 후속 PR).
  [tileKey(6, 6)]: { kind: "lake", settleable: false },
  [tileKey(7, 6)]: { kind: "lake", settleable: false },
  // 좌상단 온천(P2) — 통행/정착 불가 아우라 타일(호수와 대칭). 위에 정착 불가, 인접 4칸에 버프:
  //   인접 정착지 "소유" 길드의 길드원 건강도(war vigor) 회복 가속(HOTSPRING_BENEFIT_COORDS).
  [tileKey(1, 1)]: { kind: "hotspring", settleable: false },
};

// 좌표 → 피처(미배치 = null). 서버·클라 공용 순수함수.
export const tileFeatureAt = (col: number, row: number): TileFeature | null =>
  TILE_TERRAIN[tileKey(col, row)] ?? null;

// 정착/소유 가능 칸인가 — 피처 없으면 자유(true). 산맥·호수 등 settleable=false 만 거부.
export const isTileSettleable = (col: number, row: number): boolean =>
  tileFeatureAt(col, row)?.settleable ?? true;

// 지형 한글 라벨(UI 툴팁/패널). 미배치 칸은 라벨 없음.
export const TILE_TERRAIN_LABEL: Record<TileFeatureKind, string> = {
  mountain: "산맥",
  canyon: "협곡",
  lake: "호수",
  hotspring: "온천",
  stronghold: "요새터",
  trade_route: "교역로",
};

// === 온천(hotspring) 수혜 zone (P2) ===============================================
// 온천 4-인접 중 "정착 가능한" 칸들. 이 칸에 정착지를 **소유**한 길드의 길드원은 건강도(war
//   vigor) 회복이 가속된다(서 있는 위치가 아니라 소유 기준·docs §2.3). 산맥 등 settleable=false
//   이웃은 소유 불가라 제외(예: 온천(1,1)의 이웃 (2,1)=산맥 → 빠짐 → {(1,0),(0,1),(1,2)}).
//   ⚠️ 좌표는 서버에서 tileOutpostId(col,row)="tile:col,row" 로 매핑해 occupiedByGuildId 소유를
//   조회한다(tileHotspring.ts). tileWarfare import 은 순환(그쪽이 tileConfig 참조)이라 여기선
//   좌표만 export 하고 id 변환은 서버 헬퍼에 둔다.
export const HOTSPRING_BENEFIT_COORDS: ReadonlyArray<TileCoord> = (() => {
  const seen = new Set<string>();
  const out: TileCoord[] = [];
  for (const [k, f] of Object.entries(TILE_TERRAIN)) {
    if (f.kind !== "hotspring") continue;
    const [col, row] = k.split(",").map(Number);
    for (const n of tileNeighbors4(col, row)) {
      const nk = tileKey(n.col, n.row);
      if (seen.has(nk) || !isTileSettleable(n.col, n.row)) continue;
      seen.add(nk);
      out.push(n);
    }
  }
  return out;
})();

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

// "추가 링" = max(0, 거리-1) 을 상한까지. 리베라 1칸 범위(거리1)는 가산 0(기본비용), 그 바깥
//   1칸당 1씩↑하되 TILE_COST_MAX_EXTRA_RINGS 에서 상한(거리3↑ 비용 동일). 오너 결정(2026-06-24):
//   1칸 범위=기본·2=+1·3↑=+2 상한 → 골드 1천만/3천만/5천만/5천만(거리1/2/3/4↑).
export const TILE_COST_MAX_EXTRA_RINGS = 2;
export function tileExtraRings(col: number, row: number): number {
  return Math.min(
    TILE_COST_MAX_EXTRA_RINGS,
    Math.max(0, tileDistanceFromCenter(col, row) - 1),
  );
}

// 골드 비용 = 기본 + 링당 가산(가법). 🔧다이얼 TILE_COST_GOLD_STEP_PER_RING=2천만.
//   개척마을 생성(기본 1천만): 거리1=1천만·거리2=3천만·거리3=5천만·거리4=7천만.
export const TILE_COST_GOLD_STEP_PER_RING = 20_000_000;
export function scaledTileGoldCost(
  base: number,
  col: number,
  row: number,
): number {
  return base + TILE_COST_GOLD_STEP_PER_RING * tileExtraRings(col, row);
}

// 자원 비용 배수 — 1칸 범위=1×, 바깥 1칸당 +1×(거리2=2×·거리3=3×·거리4=4×). 골드와 단위가 달라
//   가산 대신 배수(같은 "칸당↑" 느낌). 🔧다이얼 TILE_COST_RES_STEP_PER_RING.
export const TILE_COST_RES_STEP_PER_RING = 1;
export function tileCostMultiplier(col: number, row: number): number {
  return 1 + TILE_COST_RES_STEP_PER_RING * tileExtraRings(col, row);
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

// 칸 해금 비용(타일 정착지 · 고정 누진 · 거리 무관). 오너 결정(2026-06-25):
//   마을 판은 2칸뿐(2×2) → 첫 칸=5천만·2번째=1억. 도시/대도시 칸은 upgrade 가 무료로 자동 부여하므로
//   골드 해금은 이 두 칸에만 적용된다(인덱스 2↑는 상한 폴백·실제로 호출되지 않음).
export const TILE_SLOT_UNLOCK_GOLD_BY_INDEX = [
  50_000_000, 100_000_000,
] as const;
export function tileSlotUnlockGoldCost(currentUnlocked: number): number {
  if (currentUnlocked < 0) return 0;
  return (
    TILE_SLOT_UNLOCK_GOLD_BY_INDEX[currentUnlocked] ??
    TILE_SLOT_UNLOCK_GOLD_BY_INDEX[TILE_SLOT_UNLOCK_GOLD_BY_INDEX.length - 1]
  );
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
