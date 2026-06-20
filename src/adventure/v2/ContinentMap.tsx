"use client";

import { useState } from "react";
import {
  CastleTurret,
  Crown,
  House,
  Mountains,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import {
  OUTPOSTS,
  MAP_BOUNDS,
  kingdomColorOf,
  kingdomNameOf,
  KINGDOM_COLORS,
  OUTPOST_CONFLICT_COLOR,
} from "@/adventure/data/v2/outposts";
import {
  OUTPOST_EDGES,
  shortestOutpostPath,
  CONFLICT_ZONE_IDS,
  areOutpostsAdjacent,
} from "@/adventure/data/v2/outpostGraph";
import type {
  Outpost,
  OutpostType,
  OutpostTier,
} from "@/adventure/data/v2/types";

// 마커 채움색은 종류가 아니라 소속 왕국으로 칠한다(종류는 아이콘으로 구분). kingdomColorOf 참고.

// === 고정 타일 격자 보드 (pan/zoom 폐기) ============================================
// 옛 점-지도(가변 viewBox + 핀치/팬/휠)를 한 화면에 딱 맞는 정사각 타일 격자로 교체.
// 좌표(0..10000 × 0..6000)는 셀로 스냅하고, 모든 렌더(마커·간선·경로·팝업)는 gpos() 로
// 격자 셀 중심을 쓴다. 게임플레이(인접/이동/안개/전쟁)는 그대로 — 순수 비주얼 변경.
const GRID_COLS = 13;
const GRID_ROWS = 8;
const CELL = MAP_BOUNDS.width / GRID_COLS; // ≈769 (열 너비. 가로 스냅 격자는 정사각)
// 세로 스트레치 — 40 거점은 본래 가로로 넓어 세로가 짧다(landscape). 세로 픽셀만 늘려
// 세로폰(portrait)에서 보드가 화면 세로를 채우게 한다. CELL=열 너비(가로 불변), ROW_H=행
// 표시 높이(세로). 스냅/영토색/Voronoi 는 정사각 맵 좌표(CELL) 그대로 — 세로 픽셀만 늘어난다.
// VSTRETCH 는 소유자가 바로 튜닝하는 다이얼(1=정사각 원본, 1.5=near-square portrait).
const VSTRETCH = 1.5;
const ROW_H = CELL * VSTRETCH; // 행 표시 높이(세로 전용). 가로(열 너비)는 CELL 유지.
const BOARD_W = GRID_COLS * CELL;
const BOARD_H = GRID_ROWS * ROW_H; // 세로로 늘어난 보드(≈ 13:12 near-square).

const clampInt = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// 상시 라벨 = 왕국(tier4)만. 그 외는 hover/선택/현재일 때만(격자라 라벨 밀도 자체는 낮음).
const TIER_LABEL_VISIBLE: Record<OutpostTier, boolean> = {
  1: false,
  2: false,
  3: false,
  4: true,
};

// 거점 종류별 플랫 아이콘 — 타일 위에 흰색 글리프로. 왕국(tier4)은 종류 무관 Crown.
const TYPE_ICON: Record<OutpostType, typeof House> = {
  mine: Mountains,
  tower: Sparkle,
  fort: CastleTurret,
  village: House,
};

const TYPE_LABEL: Record<OutpostType, string> = {
  mine: "광산",
  tower: "마탑",
  fort: "요새",
  village: "마을",
};

// id → Outpost 빠른 조회 — 연결선 좌표 + 현재 위치 판정용.
const OUTPOST_BY_ID = new Map(OUTPOSTS.map((o) => [o.id, o]));

// 범례용 왕국 색 목록 — 채움색이 어느 왕국인지 한눈에. 이름은 " 왕국" 접미사 떼어 간결히.
const KINGDOM_LEGEND: { id: string; name: string; color: string }[] =
  Object.entries(KINGDOM_COLORS).map(([id, color]) => ({
    id,
    color,
    name: (OUTPOST_BY_ID.get(id)?.name ?? id).replace(/\s*왕국$/, ""),
  }));

// === 영토(territory) — 격자 셀마다 소속 왕국색. 분쟁 반경 안은 분쟁지대(slate). ==========
// BIOME_REGIONS 중심은 outposts.ts 상단 주석의 5 왕국 + 중앙 평원과 일치.
const BIOME_REGIONS = [
  { label: "북부 빙원", center: { x: 1800, y: 1000 } },
  { label: "동부 삼림", center: { x: 6500, y: 800 } },
  { label: "서부 광산지대", center: { x: 1500, y: 3500 } },
  { label: "동남 화산지대", center: { x: 8000, y: 3300 } },
  { label: "남부 사막", center: { x: 5000, y: 4900 } },
  { label: "중앙 분쟁지대", center: { x: 5000, y: 2800 } },
] as const;

// 중앙 분쟁지대 핵심 반경 — 중심에서 이 거리(맵 좌표) 안의 땅만 무소속 분쟁지대로 남고,
// 그 밖은 전부 최근접 왕국 소속. (outpostDefense.ts 와 같은 값이어야 한다.)
const CONFLICT_LABEL = "중앙 분쟁지대";
const CONFLICT_RADIUS = 800;
const CONFLICT_CENTER = BIOME_REGIONS.find((r) => r.label === CONFLICT_LABEL)!
  .center;
const KINGDOM_REGIONS = BIOME_REGIONS.filter((r) => r.label !== CONFLICT_LABEL);

// BIOME_REGIONS label → 영토 색. 왕국 권역 중심 == 왕국 거점 position 이라 그 거점의 색.
const TERRITORY_COLOR_BY_LABEL: Record<string, string> = (() => {
  const out: Record<string, string> = {
    [CONFLICT_LABEL]: OUTPOST_CONFLICT_COLOR,
  };
  for (const reg of KINGDOM_REGIONS) {
    const kingdom = OUTPOSTS.find(
      (o) =>
        o.tier === 4 &&
        o.position.x === reg.center.x &&
        o.position.y === reg.center.y,
    );
    out[reg.label] =
      (kingdom && KINGDOM_COLORS[kingdom.id]) || OUTPOST_CONFLICT_COLOR;
  }
  return out;
})();

// 점(mx,my)의 소속 영토 라벨 — 분쟁 반경 안이면 분쟁지대, 아니면 최근접 왕국.
function territoryLabelAt(mx: number, my: number): string {
  const cdx = mx - CONFLICT_CENTER.x;
  const cdy = my - CONFLICT_CENTER.y;
  if (cdx * cdx + cdy * cdy <= CONFLICT_RADIUS * CONFLICT_RADIUS) {
    return CONFLICT_LABEL;
  }
  let label = KINGDOM_REGIONS[0].label;
  let bestD = Infinity;
  for (const reg of KINGDOM_REGIONS) {
    const dx = mx - reg.center.x;
    const dy = my - reg.center.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      label = reg.label;
    }
  }
  return label;
}

// === 영토 셀(15×9=135) — 새 격자에서 셀 중심 기준으로 영토 색 재산출. =================
type TerritoryCell = {
  col: number;
  row: number;
  x: number;
  y: number;
  label: string;
  color: string;
};
const TERRITORY_GRID: TerritoryCell[][] = (() => {
  const grid: TerritoryCell[][] = [];
  for (let col = 0; col < GRID_COLS; col++) {
    const column: TerritoryCell[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      // 표시 좌표 — x=열 너비(CELL), y=행 높이(ROW_H, 세로 스트레치).
      const x = col * CELL;
      const y = row * ROW_H;
      // 영토 색/라벨은 정사각 맵 좌표(CELL)로 판정 — Voronoi/색칠 불변, 세로 픽셀만 늘어난다.
      const label = territoryLabelAt(
        (col + 0.5) * CELL,
        (row + 0.5) * CELL,
      );
      column.push({
        col,
        row,
        x,
        y,
        label,
        color: TERRITORY_COLOR_BY_LABEL[label],
      });
    }
    grid.push(column);
  }
  return grid;
})();
const TERRITORY_CELLS: TerritoryCell[] = TERRITORY_GRID.flat();

// 영토 경계 — 서로 다른 영토 셀 사이의 변만(점선). 인접(우/하) 셀 라벨이 다를 때만 선 1개.
const TERRITORY_BORDERS: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}[] = (() => {
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const c = TERRITORY_GRID[col][row];
      // c.x/c.y 는 표시 좌표 — 가로 변(width)은 CELL, 세로 변(height)은 ROW_H.
      const right = TERRITORY_GRID[col + 1]?.[row];
      if (right && right.label !== c.label) {
        // 오른쪽 경계 = 세로선 — y 범위가 ROW_H.
        out.push({ x1: c.x + CELL, y1: c.y, x2: c.x + CELL, y2: c.y + ROW_H });
      }
      const below = TERRITORY_GRID[col]?.[row + 1];
      if (below && below.label !== c.label) {
        // 아래 경계 = 가로선 — y 위치가 ROW_H 만큼 내려간 셀 바닥.
        out.push({ x1: c.x, y1: c.y + ROW_H, x2: c.x + CELL, y2: c.y + ROW_H });
      }
    }
  }
  return out;
})();

// === 거점 → 격자 셀 스냅(충돌은 결정적 확장 링 BFS 로 최근접 빈 셀). ==================
// OUTPOSTS 배열 순서대로 스냅하고, 목표 셀이 차 있으면 반경 1,2,… 의 빈 셀 중 가장 가까운
// (동점은 row→col 오름차순) 셀로 옮긴다. 결정적 — 서버/클라/리로드 동일.
type GridPos = { col: number; row: number; cx: number; cy: number };
const OUTPOST_GRID_POS: Map<string, GridPos> = (() => {
  const taken = new Set<string>();
  const map = new Map<string, GridPos>();
  const key = (c: number, r: number) => `${c},${r}`;
  for (const o of OUTPOSTS) {
    const tcol = clampInt(Math.floor(o.position.x / CELL), 0, GRID_COLS - 1);
    const trow = clampInt(Math.floor(o.position.y / CELL), 0, GRID_ROWS - 1);
    let col = tcol;
    let row = trow;
    if (taken.has(key(col, row))) {
      const maxR = Math.max(GRID_COLS, GRID_ROWS);
      let found = false;
      for (let radius = 1; radius < maxR && !found; radius++) {
        let best: { c: number; r: number } | null = null;
        let bestD = Infinity;
        for (let dc = -radius; dc <= radius; dc++) {
          for (let dr = -radius; dr <= radius; dr++) {
            if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
            const c = tcol + dc;
            const r = trow + dr;
            if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) continue;
            if (taken.has(key(c, r))) continue;
            const d = dc * dc + dr * dr;
            // 동점은 결정적으로 — row, 그다음 col 오름차순.
            if (
              d < bestD ||
              (d === bestD &&
                best &&
                (r < best.r || (r === best.r && c < best.c)))
            ) {
              bestD = d;
              best = { c, r };
            }
          }
        }
        if (best) {
          col = best.c;
          row = best.r;
          found = true;
        }
      }
    }
    taken.add(key(col, row));
    map.set(o.id, {
      col,
      row,
      // 가로 중심은 열 너비(CELL), 세로 중심은 행 높이(ROW_H, 세로 스트레치).
      cx: (col + 0.5) * CELL,
      cy: (row + 0.5) * ROW_H,
    });
  }
  return map;
})();

// 격자 셀 중심 좌표 — 없으면(이론상 불가) 원 좌표 폴백.
function gpos(id: string): { cx: number; cy: number } {
  const g = OUTPOST_GRID_POS.get(id);
  if (g) return { cx: g.cx, cy: g.cy };
  // 폴백(이론상 불가) — 원 좌표. 세로는 스트레치 반영해 늘어난 보드와 맞춘다.
  const o = OUTPOST_BY_ID.get(id);
  return { cx: o?.position.x ?? 0, cy: (o?.position.y ?? 0) * VSTRETCH };
}

type OccupationLite = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedByGuildName: string | null;
  // 성벽 — 재생 반영 현재값(occupations GET). 최대 미만이면 교전 중 표시.
  fortHp?: number;
  fortMaxHp?: number;
  // 마을 건설 시 길드가 지은 이름 — 있으면 거점 표시 이름을 덮는다.
  villageName?: string | null;
};

export function ContinentMap({
  onOutpostEnter,
  onTravelTo,
  onWarp,
  occupations,
  treasuries,
  viewerUserId,
  viewerGuildId,
  currentOutpostId,
  discoveredIds,
  visibleIds,
  warMode,
  onAttack,
  attackBusy,
}: {
  // 현재 거점 자신 재진입(둘러보기)용 — 이동 없이 그 거점 화면을 연다.
  onOutpostEnter?: (o: Outpost) => void;
  // 이동(1홉 진입 또는 다중 홉 자동 이동)용 — 경로를 따라 한 칸씩 진입한다.
  onTravelTo?: (o: Outpost) => void;
  // 워프 — 발견한 비인접 거점으로 즉시 이동한다. 일반 항법 지도에서만 노출한다.
  onWarp?: (o: Outpost) => void;
  occupations?: OccupationLite[];
  // 금고 쌓인 거점 — 팝업에 "금고 N G" 표시(점령 유인).
  treasuries?: Array<{ outpostId: string; gold: number }>;
  viewerUserId?: string | null;
  // 플레이어의 현재 거점 — 인접 거점만 진입 가능하게 게이트 + 닿는 길 강조 + 마커 표식.
  currentOutpostId?: string | null;
  // 발견(안개) — 공개된 거점 id 집합. 미공개는 흐리게+비활성, 이동 목적지에서 제외.
  // 미지정이면 전부 공개로 취급(예: 순수 시각 프리뷰 페이지).
  discoveredIds?: ReadonlySet<string>;
  // 국지 모드 — 이 집합의 거점만 렌더(마커·간선)하고 영토/경계는 숨김. 전쟁 탭의
  // "현 위치 2홉" 작전 지도 등에 사용. 미지정=전체 지도.
  visibleIds?: ReadonlySet<string>;
  // 전쟁 모드 — 팝업 액션이 이동/둘러보기 대신 "공격"(인접 1칸·공격 가능 거점만).
  // 이동 기능은 마을 탭 지도 전용. viewerGuildId 는 아군 거점 판정용.
  warMode?: boolean;
  viewerGuildId?: number | null;
  onAttack?: (o: Outpost) => void;
  attackBusy?: boolean;
} = {}) {
  const occByOutpost = new Map<string, OccupationLite>();
  if (occupations) {
    for (const o of occupations) occByOutpost.set(o.outpostId, o);
  }
  const treasuryByOutpost = new Map<string, number>();
  if (treasuries) {
    for (const t of treasuries) treasuryByOutpost.set(t.outpostId, t.gold);
  }
  // 국지 모드 — 미지정이면 전부 보임.
  const isVisible = (id: string) => !visibleIds || visibleIds.has(id);
  const [selected, setSelected] = useState<Outpost | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  // 발견 판정 — discoveredIds 미지정이면 전부 공개로 본다(순수 시각 프리뷰).
  const isDiscovered = (id: string): boolean =>
    !discoveredIds || discoveredIds.has(id);

  // 선택 거점이 현재 위치 자신인가.
  const isCurrentSelected = !!selected && selected.id === currentOutpostId;
  // 현재 위치 → 선택 거점 최단 경로(거쳐갈 거점들). 워프는 없고, 이 경로를 따라 한 칸씩
  // 이동한다(인접은 1홉). 발견된 거점만 거쳐가고 목적지도 발견된 곳만(안개 게이트).
  const routePath =
    selected && currentOutpostId && !isCurrentSelected
      ? shortestOutpostPath(currentOutpostId, selected.id, discoveredIds)
      : null;
  const routeHops = routePath ? routePath.length - 1 : 0;
  const isAdjacentSelected =
    !!selected &&
    currentOutpostId != null &&
    areOutpostsAdjacent(currentOutpostId, selected.id);
  const canWarpSelected =
    !!selected &&
    currentOutpostId != null &&
    isDiscovered(selected.id) &&
    !isCurrentSelected &&
    !isAdjacentSelected;

  // 선택 거점의 점령 주체 — 팝업 표시. 길드 점령 > 솔로 점령자 > 분쟁지대(무소속) >
  //   미점령은 소속 왕국을 "○○ 왕국령"으로. 중립 거점은 배지로 충분해 생략.
  const selectedOcc = selected ? occByOutpost.get(selected.id) : undefined;
  const selectedKingdomName = selected ? kingdomNameOf(selected) : undefined;
  const selectedOwnerLabel =
    selected && !selected.neutral
      ? selectedOcc?.occupiedByGuildName
        ? `${selectedOcc.occupiedByGuildName} 길드 점령`
        : selectedOcc?.occupiedByUserId
          ? "솔로 점령자"
          : CONFLICT_ZONE_IDS.has(selected.id)
            ? "분쟁지대 · 무소속"
            : selectedKingdomName
              ? `${selectedKingdomName}령`
              : "무소속"
      : null;

  // 타일 한 변(uniform) — 격자라 모든 tier 동일 크기. tier 큐는 stroke 굵기로만 약하게.
  // 타일은 정사각(열 너비 CELL 기준) 유지 — 세로 스트레치는 셀 간격만 넓히고 타일은 안 늘인다.
  // 세로로 여유가 생겼으니 가독성 위해 살짝 키운다(다이얼). 0.66 < VSTRETCH 라 세로 이웃과 안 겹침.
  const TILE = CELL * 0.74; // 다이얼 — 모바일 가독성 위해 키움(가로 이웃과 0.26 간격).
  const HALF = TILE / 2;
  // 라벨 폰트 크기(다이얼) — 여유 공간이 생겨 키웠다.
  const LABEL_FS_KINGDOM = 76;
  const LABEL_FS_OTHER = 60;

  // 모바일: 페이지 좌우 패딩을 뚫고 화면 폭 가득(full-bleed) — 작아 보이던 문제 해소.
  //   sm+: 기존처럼 max-w-720 중앙 정렬 + 약간의 패딩.
  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 select-none sm:left-auto sm:mx-auto sm:w-full sm:max-w-[720px] sm:translate-x-0 sm:p-4">
      <div className="relative aspect-[13/12] w-full overflow-hidden border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40 sm:rounded-lg sm:border">
        <svg
          viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-full w-full"
          role="img"
          aria-label="대륙 지도"
          onClick={() => setSelected(null)}
        >
          {/* 보드 배경 — 단색. 위로 영토 색 타일 + 격자선 + 경계 점선이 얹힌다. */}
          <rect
            x={0}
            y={0}
            width={BOARD_W}
            height={BOARD_H}
            className="fill-zinc-100 dark:fill-zinc-950"
          />

          {/* 영토 색칠 — 135 격자칸마다 소속 왕국 색(분쟁지대=slate). 또렷이 읽히게 .20.
              전체 지도(국지 war 모드 아님)에서만. 국지 모드는 보이는 셀만. */}
          <g>
            {TERRITORY_CELLS.map((c) => {
              // 국지 모드 — 보이는 거점이 한 칸이라도 든 셀만 칠한다(나머지 빈 보드).
              if (visibleIds) {
                let any = false;
                for (const id of visibleIds) {
                  const g = OUTPOST_GRID_POS.get(id);
                  if (g && g.col === c.col && g.row === c.row) {
                    any = true;
                    break;
                  }
                }
                if (!any) return null;
              }
              return (
                <rect
                  key={`terr-${c.col}-${c.row}`}
                  x={c.x}
                  y={c.y}
                  width={CELL}
                  height={ROW_H}
                  fill={c.color}
                  fillOpacity={0.2}
                />
              );
            })}
          </g>

          {/* 격자선 — 영토 색 위에 얇게(타일 경계가 또렷이 읽히게). */}
          <g
            className="stroke-zinc-300/60 dark:stroke-zinc-700/50"
            strokeWidth={2}
          >
            {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
              <line
                key={`gv-${i}`}
                x1={i * CELL}
                y1={0}
                x2={i * CELL}
                y2={BOARD_H}
              />
            ))}
            {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
              <line
                key={`gh-${i}`}
                x1={0}
                y1={i * ROW_H}
                x2={BOARD_W}
                y2={i * ROW_H}
              />
            ))}
          </g>

          {/* 영토 경계 — 서로 다른 영토(왕국령) 셀 사이의 변만 점선으로. 격자 위·마커 아래.
              왕국 이름은 각 영토 수도(tier4) 라벨이 담당. 전체 지도에서만. */}
          {!visibleIds && (
            <g className="stroke-zinc-400/45 dark:stroke-zinc-500/40">
              {TERRITORY_BORDERS.map((b, i) => (
                <line
                  key={`tb-${i}`}
                  x1={b.x1}
                  y1={b.y1}
                  x2={b.x2}
                  y2={b.y2}
                  strokeWidth={4}
                  strokeDasharray="36 28"
                  strokeLinecap="round"
                />
              ))}
            </g>
          )}

          {/* 거점 간 연결선 (Gabriel 그래프) — 인접 = 이동 가능 경로. 마커 아래 레이어.
              전체를 옅게 깔고, 현재 위치에 닿는 길만 위에 또렷한 초록으로 덧그린다.
              좌표는 격자 셀 중심(gpos). */}
          {OUTPOST_EDGES.map(({ a, b }) => {
            const oa = OUTPOST_BY_ID.get(a);
            const ob = OUTPOST_BY_ID.get(b);
            if (!oa || !ob) return null;
            // 안개 — 양 끝이 모두 발견된 길만 그린다(미발견 지역의 길은 숨김).
            if (!isDiscovered(a) || !isDiscovered(b)) return null;
            if (!isVisible(a) || !isVisible(b)) return null;
            const pa = gpos(a);
            const pb = gpos(b);
            return (
              <line
                key={`edge-${a}-${b}`}
                x1={pa.cx}
                y1={pa.cy}
                x2={pb.cx}
                y2={pb.cy}
                stroke="#9ca3af"
                strokeOpacity={0.18}
                strokeWidth={6}
                strokeLinecap="round"
              />
            );
          })}
          {currentOutpostId &&
            OUTPOST_EDGES.filter(
              ({ a, b }) => a === currentOutpostId || b === currentOutpostId,
            ).map(({ a, b }) => {
              const oa = OUTPOST_BY_ID.get(a);
              const ob = OUTPOST_BY_ID.get(b);
              if (!oa || !ob) return null;
              if (!isDiscovered(a) || !isDiscovered(b)) return null;
              if (!isVisible(a) || !isVisible(b)) return null;
              const pa = gpos(a);
              const pb = gpos(b);
              return (
                <line
                  key={`edge-cur-${a}-${b}`}
                  x1={pa.cx}
                  y1={pa.cy}
                  x2={pb.cx}
                  y2={pb.cy}
                  stroke="#10b981"
                  strokeOpacity={0.95}
                  strokeWidth={16}
                  strokeLinecap="round"
                />
              );
            })}

          {/* 선택한 거점까지의 이동 경로 — 한 칸씩 따라갈 길을 또렷한 호박색으로 덧그린다.
              인접이면 1홉, 멀면 여러 홉. 마커 바로 아래 레이어. */}
          {routePath &&
            routePath.length > 1 &&
            routePath.slice(1).map((toId, i) => {
              const oa = OUTPOST_BY_ID.get(routePath[i]);
              const ob = OUTPOST_BY_ID.get(toId);
              if (!oa || !ob) return null;
              const pa = gpos(routePath[i]);
              const pb = gpos(toId);
              return (
                <line
                  key={`route-${routePath[i]}-${toId}`}
                  x1={pa.cx}
                  y1={pa.cy}
                  x2={pb.cx}
                  y2={pb.cy}
                  stroke="#f59e0b"
                  strokeOpacity={0.95}
                  strokeWidth={18}
                  strokeLinecap="round"
                />
              );
            })}

          {/* 거점 타일 — 모든 tier 균일한 둥근 사각 타일(격자 셀 중심). 채움 = 소속 왕국색,
              테두리 = 소유(내것/적/중립/NPC). tier 큐는 stroke 굵기로만 약하게. */}
          {OUTPOSTS.filter((o) => isVisible(o.id)).map((o) => {
            const p = gpos(o.id);
            // 미발견(안개) — 흐린 점만 찍고 비활성(클릭/이름/아이콘 없음).
            if (!isDiscovered(o.id)) {
              return (
                <circle
                  key={o.id}
                  cx={p.cx}
                  cy={p.cy}
                  r={HALF * 0.45}
                  className="fill-zinc-400/25 dark:fill-zinc-600/25"
                />
              );
            }
            const isKingdom = o.tier === 4;
            const isNeutral = o.neutral === true;
            const isSelected = selected?.id === o.id;
            const isHover = hover === o.id;
            const isCurrent = o.id === currentOutpostId;
            const showLabel = isSelected || isHover || isCurrent;
            const occ = occByOutpost.get(o.id);
            const isMine =
              !!occ && !!viewerUserId && occ.occupiedByUserId === viewerUserId;
            const isHostile =
              !!occ &&
              occ.occupiedByUserId !== null &&
              occ.occupiedByUserId !== viewerUserId;
            // 교전 중 — 성벽이 깎인 점령 거점(공성 진행). 펄스 링으로 전황 노출.
            const isUnderSiege =
              !!occ &&
              occ.occupiedByUserId !== null &&
              occ.fortHp != null &&
              occ.fortMaxHp != null &&
              occ.fortHp < occ.fortMaxHp;
            // 채움 = 분쟁지대(중앙 2홉 이내)면 무소속 색, 아니면 소속 왕국색.
            const markerFill = CONFLICT_ZONE_IDS.has(o.id)
              ? OUTPOST_CONFLICT_COLOR
              : kingdomColorOf(o);
            // 소유(내 길드/적/중립)는 테두리 링으로 표시 — 채움(왕국/분쟁색)과 독립.
            const ownerStroke = isMine
              ? "#10b981" // 내 길드 — 초록 링
              : isHostile
                ? "#dc2626" // 적 길드 — 빨강 링
                : isNeutral
                  ? "#f4c842" // 중립(자유도시) — 금색 링
                  : "#ffffff"; // NPC(미점령) — 기본 흰 테두리
            const hasOwnerRing = isMine || isHostile || isNeutral;
            // tier 큐 — 왕국이 가장 굵고 아래로 갈수록 가늘게(타일 크기는 균일).
            const tierStroke = isKingdom ? 14 : o.tier === 3 ? 11 : 9;
            const Glyph = isKingdom ? Crown : TYPE_ICON[o.type];
            return (
              <g
                key={o.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(o);
                }}
                onMouseEnter={() => setHover(o.id)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer"
              >
                {isCurrent && (
                  <rect
                    x={p.cx - HALF - 20}
                    y={p.cy - HALF - 20}
                    width={(HALF + 20) * 2}
                    height={(HALF + 20) * 2}
                    rx={(HALF + 20) * 0.3}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth={10}
                    strokeDasharray="34 24"
                  />
                )}
                {/* 교전 중 — 성벽 깎인 거점에 붉은 펄스 링 (SMIL — JS 타이머 불요). */}
                {isUnderSiege && (
                  <rect
                    x={p.cx - HALF - 12}
                    y={p.cy - HALF - 12}
                    width={(HALF + 12) * 2}
                    height={(HALF + 12) * 2}
                    rx={(HALF + 12) * 0.3}
                    fill="none"
                    stroke="#dc2626"
                    strokeWidth={12}
                  >
                    <animate
                      attributeName="opacity"
                      values="1;0.15;1"
                      dur="1.6s"
                      repeatCount="indefinite"
                    />
                  </rect>
                )}
                {/* 색 타일 + 흰색 아이콘 (플랫 마커). 채움 = 소속 왕국색, 테두리 = 소유. */}
                <rect
                  x={p.cx - HALF}
                  y={p.cy - HALF}
                  width={TILE}
                  height={TILE}
                  rx={TILE * 0.22}
                  fill={markerFill}
                  stroke={ownerStroke}
                  strokeWidth={
                    showLabel ? tierStroke + 4 : hasOwnerRing ? tierStroke : tierStroke - 2
                  }
                />
                <Glyph
                  x={p.cx - HALF * 0.62}
                  y={p.cy - HALF * 0.62}
                  width={HALF * 1.24}
                  height={HALF * 1.24}
                  color="#ffffff"
                  weight="fill"
                  opacity={showLabel ? 1 : 0.75}
                />
                {(TIER_LABEL_VISIBLE[o.tier] || showLabel) && (
                  <text
                    x={p.cx}
                    y={p.cy - HALF - 12}
                    textAnchor="middle"
                    fontSize={isKingdom ? LABEL_FS_KINGDOM : LABEL_FS_OTHER}
                    fontWeight={700}
                    fill="#fff"
                    paintOrder="stroke"
                    stroke="#000"
                    strokeWidth={7}
                  >
                    {occ?.villageName?.trim() || o.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* 범례 — 좌상단. 기본 접힘, 버튼으로 펼침(모바일 공간 절약). */}
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            aria-expanded={legendOpen}
            className="pointer-events-auto inline-flex items-center rounded-md border border-zinc-300 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            범례
          </button>
          {legendOpen && (
            <div className="pointer-events-auto space-y-1.5 rounded-md border border-zinc-300 bg-white/95 p-2.5 text-[11px] text-zinc-600 shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-300">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <Crown size={13} weight="fill" className="text-zinc-500 dark:text-zinc-400" />
                  왕국
                </span>
                <span className="flex items-center gap-1">
                  <CastleTurret size={13} weight="fill" className="text-zinc-500 dark:text-zinc-400" />
                  요새
                </span>
                <span className="flex items-center gap-1">
                  <Sparkle size={13} weight="fill" className="text-zinc-500 dark:text-zinc-400" />
                  마탑
                </span>
                <span className="flex items-center gap-1">
                  <Mountains size={13} weight="fill" className="text-zinc-500 dark:text-zinc-400" />
                  광산
                </span>
                <span className="flex items-center gap-1">
                  <House size={13} weight="fill" className="text-zinc-500 dark:text-zinc-400" />
                  마을
                </span>
              </div>
              <div className="h-px bg-zinc-200 dark:bg-zinc-700" />
              {/* 채움색 = 소속 왕국 */}
              <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                채움색 · 소속 왕국
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {KINGDOM_LEGEND.map((k) => (
                  <span key={k.id} className="flex items-center gap-1">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ background: k.color }}
                    />
                    {k.name}
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ background: OUTPOST_CONFLICT_COLOR }}
                  />
                  분쟁지대
                </span>
              </div>
              <div className="h-px bg-zinc-200 dark:bg-zinc-700" />
              {/* 테두리 = 소유 */}
              <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                테두리 · 소유
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border-2"
                    style={{ borderColor: "#10b981" }}
                  />
                  내 거점
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border-2"
                    style={{ borderColor: "#dc2626" }}
                  />
                  적 점령
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border-2"
                    style={{ borderColor: "#f4c842" }}
                  />
                  중립
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-3 w-3 shrink-0 rounded-sm border-2 border-dashed border-emerald-500" />
                  현재 위치
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-3 w-3 shrink-0 rounded-full bg-zinc-400/30" />
                  미발견
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

        {/* 거점 floating popup — 선택 시 하단 중앙. 이름 + 이동(다른 거점)/둘러보기(현재) + X.
            데스크탑은 보드 위에 absolute 로 띄우고, 모바일은 보드 아래(빈 공간)로 흘려보내
            하단 타일을 가리지 않게 한다. */}
        {selected && (
          <div className="pointer-events-none relative mt-2 flex justify-center px-3 pb-1 sm:absolute sm:inset-x-7 sm:bottom-7 sm:mt-0 sm:px-0 sm:pb-0">
            <div className="pointer-events-auto flex max-w-sm flex-1 items-center gap-2 rounded-lg border border-zinc-300 bg-white/95 px-3 py-2 shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectedOcc?.villageName?.trim() || selected.name}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {TYPE_LABEL[selected.type]}
                  </span>
                  {selected.neutral && (
                    <span className="shrink-0 rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] text-yellow-900">
                      중립
                    </span>
                  )}
                </div>
                {selectedOwnerLabel && (
                  <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {selectedOwnerLabel}
                  </div>
                )}
                {(treasuryByOutpost.get(selected.id) ?? 0) > 0 && (
                  <div className="mt-0.5 truncate text-xs font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
                    금고 {treasuryByOutpost.get(selected.id)!.toLocaleString()}{" "}
                    G — 점령 시 획득
                  </div>
                )}
              </div>
              {warMode ? (
                // 전쟁 모드 — 공격만. 현재 거점/인접 1칸의 공격 가능 거점에 버튼,
                // 그 외엔 사유 텍스트. 이동은 마을 지도 전용이라 없음.
                (() => {
                  const occ = occByOutpost.get(selected.id);
                  const inRange =
                    isCurrentSelected ||
                    (currentOutpostId != null &&
                      areOutpostsAdjacent(currentOutpostId, selected.id));
                  const blockReason = selected.neutral
                    ? "중립 거점 (점령 불가)"
                    : occ?.occupiedByGuildId != null &&
                        occ.occupiedByGuildId === viewerGuildId
                      ? "아군 거점"
                      : !inRange
                        ? "인접 거점에서만 공격 가능"
                        : null;
                  if (blockReason) {
                    return (
                      <span className="shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">
                        {blockReason}
                      </span>
                    );
                  }
                  return (
                    onAttack && (
                      <button
                        type="button"
                        onClick={() => onAttack(selected)}
                        disabled={attackBusy}
                        className="shrink-0 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {attackBusy
                          ? "교전 중…"
                          : occ?.occupiedByUserId
                            ? "공성"
                            : "점령"}
                      </button>
                    )
                  );
                })()
              ) : isCurrentSelected ? (
                onOutpostEnter && (
                  <button
                    type="button"
                    onClick={() => onOutpostEnter(selected)}
                    className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    둘러보기
                  </button>
                )
              ) : canWarpSelected && onWarp ? (
                <button
                  type="button"
                  onClick={() => onWarp(selected)}
                  className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  워프
                </button>
              ) : (
                onTravelTo &&
                (routePath ? (
                  <button
                    type="button"
                    onClick={() => onTravelTo(selected)}
                    className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    {routeHops <= 1 ? "이동" : `이동 (${routeHops}홉)`}
                  </button>
                ) : (
                  <span className="shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">
                    길이 닿지 않는다
                  </span>
                ))
              )}
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="닫기"
                className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
          </div>
        )}
    </div>
  );
}
