"use client";

// === 자유 타일 지도 — /map 의 지도 컴포넌트 (옛 ContinentMap 대체·은퇴) ================
//  - 9×9 보드 + 유지 거점 9개(점령 상태색) + 빈 땅 자유 이동(Phase 2).
//  - 빈 땅 어디든 개척마을 건설 → 마을→도시→대도시 승격/철거(Phase 3).
// 라이브 데이터(occupations/treasuries/currentOutpostId)는 표시만, 정착지는 tileSettlements.
import { useEffect, useState } from "react";
import {
  CastleTurret,
  Coins,
  Crown,
  Flag,
  FlowerLotus,
  Hammer,
  House,
  Mountains,
  Path,
  Trash,
  Wall,
  Waves,
  type Icon,
} from "@phosphor-icons/react";
import {
  OUTPOSTS,
  OUTPOST_NPC_TAX_RATE,
} from "@/adventure/data/v2/outposts";
import { CONFLICT_ZONE_IDS } from "@/adventure/data/v2/outpostGraph";
import { tileOutpostId } from "@/adventure/data/v2/tileWarfare";
import {
  RAID_MIN_TILE_STAY_MS,
  RAID_TREASURY_STEAL_FRAC_UNDEFENDED,
  TRADE_ROUTE_RAID_LOSS_MULT,
  LAKE_ATTACKER_PENALTY_MULT,
  V2_TILE_WARFARE,
  V2_TILE_PRODUCTION,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { guildColorHex } from "@/adventure/data/guild-colors";
import { guildEmblemIcon } from "@/adventure/data/guild-emblems-icons";
import {
  TILE_BOARD_SIZE,
  TILE_OUTPOST_AT,
  TILE_POS_BY_OUTPOST,
  tileKey,
  TILE_TIER_LABEL,
  TILE_FOUND_COST,
  TILE_PROMOTE_COST,
  tileNextTier,
  isTileSettlementTier,
  scaledTileGoldCost,
  tileFeatureAt,
  isLakeAdjacentTile,
  isTradeRouteTile,
  TILE_TERRAIN_LABEL,
  type TileFeatureKind,
  type TileSettlementTier,
} from "@/adventure/data/v2/tileConfig";
import {
  GRID_DUNGEON_ENTRANCE,
  isAtGridDungeonEntrance,
} from "@/adventure/data/v2/gridDungeon";
import { VILLAGE_NAME_MAX } from "@/adventure/data/v2/settlement";
import type { Outpost } from "@/adventure/data/v2/types";

// 보드는 컨테이너 폭을 꽉 채우는 반응형 정사각형(9×9 1fr 트랙). 셀/아이콘은 % 로 스케일.
const GAP = 1; // 셀 사이 간격 px.

// 개척 정착지 티어별 아이콘 — 개척마을(깃발)→마을(집)→도시(성)→대도시(왕관).
const SETTLE_TIER_ICON: Record<TileSettlementTier, Icon> = {
  frontier: Flag,
  village: House,
  city: CastleTurret,
  metropolis: Crown,
};
const FOUNDED_FILL = "#10b981"; // 개척 정착지 = 초록 계열.

// 지형 타일 시각 — 통행 불가(산맥/호수/온천)는 어두운 패턴, 통행 가능(협곡/요새터/교역로)은
//   빈 땅처럼 선택/개척 가능(요새터/교역로는 그 칸 정착지에 보정).
const TERRAIN_GLYPH: Partial<Record<TileFeatureKind, Icon>> = {
  mountain: Mountains,
  canyon: Path,
  lake: Waves,
  hotspring: FlowerLotus,
  stronghold: CastleTurret,
  trade_route: Coins,
};
const TERRAIN_BG: Partial<Record<TileFeatureKind, string>> = {
  mountain: "bg-zinc-950",
  canyon: "bg-stone-800/70 hover:bg-stone-700/70",
  lake: "bg-sky-950",
  hotspring: "bg-amber-950",
  stronghold: "bg-slate-800/70 hover:bg-slate-700/70",
  // 보라(violet) — 노랑은 중립 마커(bg-yellow-400)와 헷갈려 금지. 교역=부유한 거점 톤.
  trade_route: "bg-violet-900/60 hover:bg-violet-800/60",
};
const TERRAIN_ICON_COLOR: Partial<Record<TileFeatureKind, string>> = {
  mountain: "#52525b",
  canyon: "#a8a29e",
  lake: "#38bdf8",
  hotspring: "#fbbf24",
  stronghold: "#cbd5e1",
  trade_route: "#c4b5fd", // violet-300 — 중립 노랑과 분리.
};
// 통행 불가 지형의 퍽 한 줄(정보 패널). 없으면 기본 "통행 불가" 문구만.
const TERRAIN_PERK_HINT: Partial<Record<TileFeatureKind, string>> = {
  hotspring: "인접 정착지 보유 길드원 건강도 회복 가속",
};
// 정착 가능 특수 지형(요새터/교역로)의 퍽 한 줄(정착 패널). 협곡 등은 없음.
const TERRAIN_SETTLE_HINT: Partial<Record<TileFeatureKind, string>> = {
  stronghold: "정착 시 성벽 내구 +15%",
  trade_route: "정착 시 영주 세금 +15% · 약탈 손실 +10%",
};

const OUTPOST_BY_ID = new Map(OUTPOSTS.map((o) => [o.id, o]));

type OccupationLite = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedByGuildName: string | null;
  occupiedByGuildEmblem?: string | null;
  occupiedByGuildColor?: string | null;
  taxRate?: string | null;
  villageName?: string | null;
};

type TileSettlementLite = {
  col: number;
  row: number;
  userId: string;
  tier: string;
  name: string | null;
  // 소유자의 현재 길드(서버가 멤버십 조인으로 파생). 무소속이면 null.
  guildId?: number | null;
  guildName?: string | null;
  guildColor?: string | null;
};

type WarOverviewLite = {
  ok?: boolean;
  myGuild?: {
    outposts: Array<{
      outpostId: string;
      underAttack: boolean;
      intruderCount: number;
    }>;
  } | null;
};

const tierOf = (t: string): TileSettlementTier =>
  isTileSettlementTier(t) ? t : "frontier";

function WarSummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "amber" | "sky";
}) {
  const toneClass: Record<typeof tone, string> = {
    emerald: "border-emerald-700/50 bg-emerald-950/35 text-emerald-200",
    rose: "border-rose-700/50 bg-rose-950/35 text-rose-200",
    amber: "border-amber-700/50 bg-amber-950/35 text-amber-200",
    sky: "border-sky-700/50 bg-sky-950/35 text-sky-200",
  };
  return (
    <div
      className={`war-stat-card rounded-md border px-3 py-2 ${value > 0 ? "is-hot" : ""} ${toneClass[tone]} ${
        value > 0 ? "war-status-hot" : ""
      }`}
    >
      <div className="text-[11px] text-current/70">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function formatRemainingMinutes(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  }
  return `${min}분`;
}

function raidPreviewGold(col: number, row: number, treasury: number): number {
  const safeTreasury = Math.max(0, Math.floor(treasury));
  let amount = Math.floor(safeTreasury * RAID_TREASURY_STEAL_FRAC_UNDEFENDED);
  let mult = 1;
  if (isTradeRouteTile(col, row)) mult *= TRADE_ROUTE_RAID_LOSS_MULT;
  if (isLakeAdjacentTile(col, row)) mult *= LAKE_ATTACKER_PENALTY_MULT;
  if (mult !== 1) amount = Math.min(safeTreasury, Math.floor(amount * mult));
  return Math.max(0, amount);
}

function useClientNowMs(refreshMs = 30_000): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);
  return nowMs;
}

export function TileMap({
  onTravelToTile,
  tilePos,
  tileSettlements,
  onFoundTile,
  onPromoteTile,
  onDemolishTile,
  occupations,
  treasuries,
  viewerUserId,
  viewerGuildId,
  currentOutpostId,
  onOpenOutpost,
  onOpenGridDungeon,
  actionError,
  onDismissActionError,
}: {
  // 칸 이동(거점/빈 땅 공통) — 좌표를 받아 provider 가 거점/빈땅 분기.
  onTravelToTile?: (col: number, row: number) => void;
  tilePos?: { col: number; row: number; at?: number } | null;
  // 개척 정착지(Phase 3).
  tileSettlements?: TileSettlementLite[];
  onFoundTile?: (col: number, row: number, name: string) => void | Promise<boolean>;
  onPromoteTile?: (col: number, row: number) => void;
  onDemolishTile?: (col: number, row: number) => void;
  occupations?: OccupationLite[];
  treasuries?: Array<{ outpostId: string; gold: number }>;
  viewerUserId?: string | null;
  viewerGuildId?: number | null;
  currentOutpostId?: string | null;
  // 거점/타일 전쟁 화면 진입 — /outpost/[id] 딥링크(부모가 router.push 주입).
  onOpenOutpost?: (id: string) => void;
  onOpenGridDungeon?: () => void;
  // 개척/승격/철거/개명 실패 사유(한 줄). 있으면 빈 땅 패널에 안내 배너로 표시.
  actionError?: string | null;
  onDismissActionError?: () => void;
} = {}) {
  const [selected, setSelected] = useState<string | null>(null); // 칸 키 "c,r"
  const [foundName, setFoundName] = useState(""); // 개척마을 건설 폼 이름 입력
  const [warOverview, setWarOverview] = useState<WarOverviewLite["myGuild"]>(null);
  const nowMs = useClientNowMs();

  const occByOutpost = new Map<string, OccupationLite>();
  if (occupations) for (const o of occupations) occByOutpost.set(o.outpostId, o);
  const treasuryByOutpost = new Map<string, number>();
  if (treasuries) for (const t of treasuries) treasuryByOutpost.set(t.outpostId, t.gold);
  const settlementByKey = new Map<string, TileSettlementLite>();
  if (tileSettlements)
    for (const s of tileSettlements) settlementByKey.set(tileKey(s.col, s.row), s);

  useEffect(() => {
    let alive = true;
    if (viewerGuildId == null) {
      queueMicrotask(() => {
        if (alive) setWarOverview(null);
      });
      return () => {
        alive = false;
      };
    }
    queueMicrotask(() => {
      if (!alive) return;
      fetch("/api/v2/war/overview", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: WarOverviewLite | null) => {
          if (alive) setWarOverview(j?.ok ? (j.myGuild ?? null) : null);
        })
        .catch(() => {
          if (alive) setWarOverview(null);
        });
    });
    return () => {
      alive = false;
    };
  }, [viewerGuildId]);

  const ownerLabelOf = (o: Outpost): string | null => {
    if (o.neutral) return null;
    const occ = occByOutpost.get(o.id);
    if (occ?.occupiedByGuildName) return `${occ.occupiedByGuildName} 길드 점령`;
    if (occ?.occupiedByUserId) return "솔로 점령자";
    if (CONFLICT_ZONE_IDS.has(o.id)) return "분쟁지대 · 무소속";
    return "무소속";
  };
  const taxPctOf = (o: Outpost): number => {
    const occ = occByOutpost.get(o.id);
    const raw =
      occ?.occupiedByUserId != null && occ.taxRate != null
        ? Number(occ.taxRate)
        : OUTPOST_NPC_TAX_RATE;
    return Math.round((Number.isFinite(raw) ? raw : OUTPOST_NPC_TAX_RATE) * 100);
  };

  const cells = Array.from({ length: TILE_BOARD_SIZE * TILE_BOARD_SIZE }, (_, i) => ({
    col: i % TILE_BOARD_SIZE,
    row: Math.floor(i / TILE_BOARD_SIZE),
  }));

  // 선택 칸 → 거점 / 정착지 / 빈 땅.
  const selOutpostId = selected ? TILE_OUTPOST_AT.get(selected) : undefined;
  const selOutpost = selOutpostId ? OUTPOST_BY_ID.get(selOutpostId) : undefined;
  const selSettlement = selected ? settlementByKey.get(selected) : undefined;
  const [selCol, selRow] = selected ? selected.split(",").map(Number) : [-1, -1];
  // 선택 칸 지형(미배치 = null). 통행 불가 지형(산맥/호수)은 이동/개척 패널 대신 정보 패널.
  const selFeature = selected ? tileFeatureAt(selCol, selRow) : null;
  const selectedDungeonEntrance = isAtGridDungeonEntrance({
    col: selCol,
    row: selRow,
  });

  // 플레이어 마커 칸 — tilePos 우선, 없으면 현재 거점 칸에서 파생(보드 밖이면 마커 없음).
  const playerPos =
    tilePos ??
    (currentOutpostId
      ? (TILE_POS_BY_OUTPOST.get(currentOutpostId) ?? null)
      : null);
  const playerTileKey = playerPos ? tileKey(playerPos.col, playerPos.row) : null;
  const currentOnBoard = playerTileKey != null;
  const myTileCount =
    (tileSettlements ?? []).filter((s) => s.guildId === viewerGuildId).length +
    (occupations ?? []).filter(
      (o) =>
        o.occupiedByGuildId != null &&
        o.occupiedByGuildId === viewerGuildId &&
        TILE_POS_BY_OUTPOST.has(o.outpostId),
    ).length;
  const intruderCount =
    warOverview?.outposts.reduce((sum, o) => sum + o.intruderCount, 0) ?? 0;
  const underAttackCount =
    warOverview?.outposts.filter((o) => o.underAttack).length ?? 0;
  const standingSettlement = playerTileKey
    ? settlementByKey.get(playerTileKey)
    : undefined;
  const isStandingOnHostileSettlement =
    standingSettlement?.guildId != null &&
    viewerGuildId != null &&
    standingSettlement.guildId !== viewerGuildId;
  const raidStayMs =
    isStandingOnHostileSettlement && typeof tilePos?.at === "number" && nowMs != null
      ? Math.max(0, nowMs - tilePos.at)
      : 0;
  const raidPrepCount =
    isStandingOnHostileSettlement && raidStayMs < RAID_MIN_TILE_STAY_MS ? 1 : 0;

  return (
    <main className="mx-auto max-w-2xl space-y-3 p-4 text-zinc-200">
      <div>
        <h1 className="text-base font-bold text-zinc-100">대륙 지도</h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          칸을 눌러 어디로든 이동하고, 빈 땅에는 개척마을을 세워 마을→도시→대도시로
          키웁니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <WarSummaryChip label="내 영토" value={myTileCount} tone="emerald" />
        <WarSummaryChip label="침입자" value={intruderCount} tone="rose" />
        <WarSummaryChip label="약탈 준비" value={raidPrepCount} tone="amber" />
        <WarSummaryChip label="공성 중" value={underAttackCount} tone="sky" />
      </div>

      {!currentOnBoard && currentOutpostId && (
        <div className="rounded-md border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">
          현재 위치가 새 지도 밖의 거점입니다. 칸을 골라 이동하면 보드로 들어옵니다.
        </div>
      )}

      <div>
        <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
          <div
            className="war-map-grid grid h-full w-full bg-zinc-800/70 ring-1 ring-zinc-800"
            style={{
              gridTemplateColumns: `repeat(${TILE_BOARD_SIZE}, 1fr)`,
              gridTemplateRows: `repeat(${TILE_BOARD_SIZE}, 1fr)`,
              gap: GAP,
            }}
          >
            {cells.map(({ col, row }) => {
              const k = tileKey(col, row);
              const oid = TILE_OUTPOST_AT.get(k);
              const o = oid ? OUTPOST_BY_ID.get(oid) : undefined;
              const occ = oid ? occByOutpost.get(oid) : undefined;
              const settlement = settlementByKey.get(k);
              const isDungeonEntrance = isAtGridDungeonEntrance({ col, row });
              const isSel = selected === k;
              const isPlayer = k === playerTileKey;
              const cls = `relative flex h-full w-full items-center justify-center transition ${
                isSel ? "outline outline-2 outline-indigo-400" : ""
              }`;
              const tileSettledByMyGuild =
                settlement?.guildId != null && settlement.guildId === viewerGuildId;
              const tileSettledByOtherGuild =
                settlement?.guildId != null &&
                viewerGuildId != null &&
                settlement.guildId !== viewerGuildId;
              const raidStayMs =
                isPlayer && typeof tilePos?.at === "number" && nowMs != null
                  ? Math.max(0, nowMs - tilePos.at)
                  : 0;
              const raidReady =
                tileSettledByOtherGuild && raidStayMs >= RAID_MIN_TILE_STAY_MS;
              const raidArming =
                tileSettledByOtherGuild &&
                isPlayer &&
                raidStayMs < RAID_MIN_TILE_STAY_MS;
              const warCellClass = [
                isPlayer ? "war-tile-current" : "",
                tileSettledByMyGuild ? "war-tile-friendly" : "",
                tileSettledByOtherGuild ? "war-tile-hostile" : "",
                raidReady ? "war-raid-ready" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const raidBadge = raidReady ? (
                <span className="pointer-events-none absolute bottom-0.5 left-1/2 z-20 -translate-x-1/2 rounded bg-rose-500 px-1 py-px text-[9px] font-semibold leading-none text-white">
                  약탈
                </span>
              ) : raidArming ? (
                <span className="pointer-events-none absolute bottom-0.5 left-1/2 z-20 -translate-x-1/2 rounded bg-amber-400 px-1 py-px text-[9px] font-semibold leading-none text-zinc-950">
                  잠입
                </span>
              ) : null;

              if (o) {
                const isMine =
                  !!occ &&
                  occ.occupiedByUserId !== null &&
                  (occ.occupiedByGuildId != null
                    ? occ.occupiedByGuildId === viewerGuildId
                    : occ.occupiedByUserId === viewerUserId);
                const isHostile =
                  !!occ && occ.occupiedByUserId !== null && !isMine;
                const ownerColor = isMine
                  ? "#10b981"
                  : isHostile
                    ? "#dc2626"
                    : o.neutral
                      ? "#f4c842"
                      : "#6b7280";
                const guildColor =
                  occ?.occupiedByGuildId != null
                    ? guildColorHex(occ.occupiedByGuildColor ?? null)
                    : null;
                const fill = guildColor ?? ownerColor;
                // 길드 점령 거점 = 그 길드 엠블럼, 그 외(NPC/무소속) = 기본 마을 아이콘.
                const Glyph =
                  occ?.occupiedByGuildId != null
                    ? guildEmblemIcon(occ.occupiedByGuildEmblem)
                    : House;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelected(k)}
                    title={occ?.villageName?.trim() || o.name}
                    className={`${cls} ${warCellClass}`}
                    style={{ background: `${fill}22` }}
                  >
                    <span
                      className="flex h-[82%] w-[82%] items-center justify-center rounded-md"
                      style={{ background: fill }}
                    >
                      <Glyph className="h-3/5 w-3/5" weight="fill" color="#0b1020" />
                    </span>
                    {raidBadge}
                  </button>
                );
              }

              if (settlement) {
                const Glyph = SETTLE_TIER_ICON[tierOf(settlement.tier)];
                // 길드 소속 정착지 = 그 길드 색(우리 길드든 남의 길드든). 색 미설정·무소속 = 개척 초록.
                const settleFill =
                  (settlement.guildId != null
                    ? guildColorHex(settlement.guildColor ?? null)
                    : null) ?? FOUNDED_FILL;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelected(k)}
                    title={settlement.name ?? "개척 정착지"}
                    className={`${cls} ${warCellClass}`}
                    style={{ background: `${settleFill}22` }}
                  >
                    <span
                      className="flex h-[82%] w-[82%] items-center justify-center rounded-md"
                      style={{ background: settleFill }}
                    >
                      <Glyph className="h-3/5 w-3/5" weight="fill" color="#0b1020" />
                    </span>
                    {raidBadge}
                  </button>
                );
              }

              // 지형 타일(산맥·협곡·호수) — 정착지가 없는 특수 칸. 협곡(settleable)은 빈 땅처럼
              //   개척 가능, 산맥·호수(통행 불가)는 배경만(정복 디딤돌 불가).
              const feature = tileFeatureAt(col, row);
              const TerrainGlyph = feature ? TERRAIN_GLYPH[feature.kind] : undefined;
              if (feature && TerrainGlyph) {
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelected(k)}
                    title={`${TILE_TERRAIN_LABEL[feature.kind]}${
                      feature.settleable ? "" : " · 통행 불가"
                    }`}
                    className={`relative flex h-full w-full items-center justify-center transition ${
                      TERRAIN_BG[feature.kind] ?? "bg-zinc-900/60"
                    } ${isSel ? "outline outline-2 outline-indigo-400" : ""}`}
                  >
                    <TerrainGlyph
                      className="h-2/5 w-2/5"
                      weight="fill"
                      color={TERRAIN_ICON_COLOR[feature.kind] ?? "#71717a"}
                    />
                    {isPlayer && (
                      <span className="pointer-events-none absolute inset-0 z-10 rounded-md war-tile-current" />
                    )}
                  </button>
                );
              }

              // 빈 땅.
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelected(k)}
                  title={isDungeonEntrance ? GRID_DUNGEON_ENTRANCE.name : "빈 땅"}
                  className={`relative flex h-full w-full items-center justify-center bg-zinc-900/60 transition hover:bg-zinc-800 ${
                    isSel ? "outline outline-2 outline-indigo-400" : ""
                  }`}
                >
                  {isDungeonEntrance && (
                    <Wall
                      className="h-2/5 w-2/5 text-amber-300"
                      weight="fill"
                    />
                  )}
                  {isPlayer && (
                    <span className="pointer-events-none absolute inset-0 z-10 rounded-md war-tile-current" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 선택 칸 패널 */}
      {selected && (
        <>
          {/* 개척/승격/철거/개명 실패 사유 — 침묵 실패 방지(서버 거절 시 표시). */}
          {actionError && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-red-700 bg-red-950/70 px-3 py-2 text-xs text-red-300">
              <span className="min-w-0">{actionError}</span>
              {onDismissActionError && (
                <button
                  type="button"
                  onClick={onDismissActionError}
                  className="shrink-0 rounded px-1.5 py-0.5 text-red-400 hover:bg-red-900/60"
                >
                  닫기
                </button>
              )}
            </div>
          )}
          {selOutpost ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-sm font-semibold text-zinc-100">
                  {occByOutpost.get(selOutpost.id)?.villageName?.trim() ||
                    selOutpost.name}
                </span>
                <span className="text-xs text-zinc-500">마을</span>
                {selOutpost.neutral && (
                  <span className="rounded bg-yellow-400 px-1 py-0.5 text-[10px] text-yellow-900">
                    중립
                  </span>
                )}
              </div>
              {ownerLabelOf(selOutpost) && (
                <div className="mt-0.5 text-xs text-zinc-500">
                  {ownerLabelOf(selOutpost)}
                </div>
              )}
              <div className="mt-0.5 text-xs text-zinc-500">
                세율 {taxPctOf(selOutpost)}%
                {(treasuryByOutpost.get(selOutpost.id) ?? 0) > 0 && (
                  <span className="ml-2 text-yellow-400">
                    금고 {treasuryByOutpost.get(selOutpost.id)!.toLocaleString()} G
                  </span>
                )}
              </div>
            </div>
            {playerTileKey === selected ? (
              <span className="rounded-md bg-emerald-900/60 px-3 py-1.5 text-xs text-emerald-300">
                현재 위치
              </span>
            ) : (
              onTravelToTile && (
                <button
                  type="button"
                  onClick={() => onTravelToTile(selCol, selRow)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  여기로 이동
                </button>
              )
            )}
          </div>
        ) : selSettlement ? (
          (() => {
            const tier = tierOf(selSettlement.tier);
            const next = tileNextTier(tier);
            const mine = selSettlement.userId === viewerUserId;
            const sameGuild =
              selSettlement.guildId != null &&
              selSettlement.guildId === viewerGuildId;
            const ownerLabel = mine
              ? "내 정착지"
              : sameGuild
                ? `우리 길드 · ${selSettlement.guildName ?? "길드"}`
                : selSettlement.guildId != null
                  ? `${selSettlement.guildName ?? "다른 길드"} 영지`
                  : "다른 모험가의 정착지";
            // 진입 버튼 게이트 — 관리(내 정착지) vs 공격(남의 정착지).
            const ours = mine || sameGuild;
            // 관리: 우리 길드 소유 타일이면 진입(방어·관리). 영토=길드 소유라 솔로 관리는 폐기.
            const canManage = V2_TILE_WARFARE && ours;
            // 공격: 우리 소유가 아닌 타일이면 진입(전쟁=길드만 — 서버가 무소속 공격 차단).
            const canAttack = V2_TILE_WARFARE && !ours;
            const ownerColor =
              (selSettlement.guildId != null
                ? guildColorHex(selSettlement.guildColor ?? null)
                : null) ?? FOUNDED_FILL;
            const selectedTileId = tileOutpostId(selCol, selRow);
            const treasury = treasuryByOutpost.get(selectedTileId) ?? 0;
            const isStandingHere = playerTileKey === selected;
            const stayMs =
              isStandingHere && typeof tilePos?.at === "number" && nowMs != null
                ? Math.max(0, nowMs - tilePos.at)
                : 0;
            const raidReady = canAttack && isStandingHere && stayMs >= RAID_MIN_TILE_STAY_MS;
            const raidRemaining = Math.max(0, RAID_MIN_TILE_STAY_MS - stayMs);
            const estimatedRaidGold = raidPreviewGold(selCol, selRow, treasury);
            return (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-zinc-900/80 p-3"
                style={{ borderColor: `${ownerColor}99` }}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-sm font-semibold text-zinc-100">
                      {selSettlement.name ?? "개척 정착지"}
                    </span>
                    <span className="text-xs text-emerald-400">
                      {TILE_TIER_LABEL[tier]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {ownerLabel}
                  </div>
                  {canAttack && (
                    <div className="mt-2 grid gap-1 text-[11px] text-zinc-400 sm:grid-cols-2">
                      <span>
                        위치{" "}
                        <strong className={isStandingHere ? "text-emerald-300" : "text-zinc-300"}>
                          {isStandingHere ? "현재 이 칸" : "다른 칸"}
                        </strong>
                      </span>
                      <span>
                        약탈{" "}
                        <strong className={raidReady ? "text-rose-300" : "text-amber-300"}>
                          {raidReady
                            ? "가능"
                            : isStandingHere
                              ? `${formatRemainingMinutes(raidRemaining)} 남음`
                              : "체류 필요"}
                        </strong>
                      </span>
                      <span>
                        위험{" "}
                        <strong className="text-rose-300">토벌 대상</strong>
                      </span>
                      <span>
                        무방비 예상{" "}
                        <strong className="text-yellow-300">
                          {estimatedRaidGold.toLocaleString()}G
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {playerTileKey === selected ? (
                    <span className="rounded-md bg-emerald-900/60 px-3 py-1.5 text-xs text-emerald-300">
                      현재 위치
                    </span>
                  ) : (
                    onTravelToTile && (
                      <button
                        type="button"
                        onClick={() => onTravelToTile(selCol, selRow)}
                        className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                      >
                        여기로 이동
                      </button>
                    )
                  )}
                  {/* 진입 버튼: 우리 길드 소유=방어·관리, 남의 정착지=공격(전쟁은 길드만). */}
                  {onOpenOutpost &&
                    (canManage || canAttack) && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenOutpost(tileOutpostId(selCol, selRow))
                        }
                        className="rounded-md border border-rose-700/60 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-950/40"
                      >
                        {canManage ? "방어·관리" : "공격"}
                      </button>
                    )}
                  {/* 생산 관리 이전(T3): V2_TILE_PRODUCTION on 이면 지도 승격 폐지 —
                      승격은 관리 화면(생산/자원)에서. 지도는 개척마을 생성만. */}
                  {!V2_TILE_PRODUCTION && mine && next && onPromoteTile && (
                    <button
                      type="button"
                      onClick={() => onPromoteTile(selCol, selRow)}
                      className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                    >
                      {tier === "frontier" ? "마을로 승격" : "승격"} →{" "}
                      {TILE_TIER_LABEL[next]} ({TILE_PROMOTE_COST[tier].toLocaleString()}G)
                    </button>
                  )}
                  {mine && onDemolishTile && (
                    <button
                      type="button"
                      onClick={() => onDemolishTile(selCol, selRow)}
                      aria-label="철거"
                      className="rounded-md border border-zinc-600 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-rose-400"
                    >
                      <Trash size={14} weight="bold" />
                    </button>
                  )}
                </div>
              </div>
            );
          })()
        ) : selFeature && !selFeature.settleable ? (
          // 통행 불가 지형(산맥·호수) — 이동/개척 불가. 정보만 표시.
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-100">
                {TILE_TERRAIN_LABEL[selFeature.kind]}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                통행 불가 · 정착할 수 없는 지형 ({selCol}, {selRow})
              </div>
              {TERRAIN_PERK_HINT[selFeature.kind] && (
                <div className="mt-0.5 text-xs text-amber-300/80">
                  {TERRAIN_PERK_HINT[selFeature.kind]}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
            <div className="min-w-0">
              <div className="text-xs text-zinc-400">
                {selectedDungeonEntrance
                  ? `${GRID_DUNGEON_ENTRANCE.name} `
                  : selFeature
                    ? `${TILE_TERRAIN_LABEL[selFeature.kind]} `
                    : "빈 땅 "}
                ({selCol}, {selRow})
              </div>
              {selectedDungeonEntrance && (
                <div className="mt-0.5 text-xs text-amber-300/80">
                  오래된 격자 던전 입구 · 이 칸은 개척할 수 없습니다
                </div>
              )}
              {selFeature && TERRAIN_SETTLE_HINT[selFeature.kind] && (
                <div className="mt-0.5 text-xs text-amber-300/80">
                  {TERRAIN_SETTLE_HINT[selFeature.kind]}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {playerTileKey === selected ? (
                <span className="rounded-md bg-emerald-900/60 px-3 py-1.5 text-xs text-emerald-300">
                  현재 위치
                </span>
              ) : (
                onTravelToTile && (
                  <button
                    type="button"
                    onClick={() => onTravelToTile(selCol, selRow)}
                    className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                  >
                    여기로 이동
                  </button>
                )
              )}
              {selectedDungeonEntrance &&
                onOpenGridDungeon &&
                (playerTileKey === selected ? (
                  <button
                    type="button"
                    onClick={onOpenGridDungeon}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
                  >
                    <Wall size={14} weight="fill" />
                    던전 입장
                  </button>
                ) : (
                  <span className="text-xs text-zinc-500">
                    이 칸으로 이동하면 던전에 입장할 수 있습니다
                  </span>
                ))}
              {onFoundTile &&
                !selectedDungeonEntrance &&
                (viewerGuildId == null ? (
                  // 영토=길드 소유 — 무소속은 개척 불가(길드 생성/가입 안내).
                  <span className="text-xs text-amber-400">
                    개척마을은 길드 전용 — 길드를 만들거나 가입하세요
                  </span>
                ) : playerTileKey !== selected ? (
                  // 개척은 그 칸에 실제로 가 있어야 가능 — 먼저 "여기로 이동"(위 버튼) 후 개척.
                  <span className="text-xs text-zinc-500">
                    이 칸으로 이동해야 개척할 수 있습니다
                  </span>
                ) : (
                  // 이름을 직접 정해 개척마을을 세운다 — 그 이름이 지도·헤더의 거점 표시 이름.
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <input
                      type="text"
                      value={foundName}
                      onChange={(e) => setFoundName(e.target.value)}
                      maxLength={VILLAGE_NAME_MAX}
                      placeholder="개척마을 이름"
                      className="w-32 min-w-0 rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500"
                    />
                    <button
                      type="button"
                      disabled={foundName.trim().length === 0}
                      onClick={async () => {
                        // 성공일 때만 입력창을 비운다 — 실패(골드/권한 등)면 이름을 남겨 재시도.
                        const ok = await onFoundTile(
                          selCol,
                          selRow,
                          foundName.trim(),
                        );
                        if (ok) setFoundName("");
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Hammer size={14} weight="fill" />
                      개척 (
                      {scaledTileGoldCost(
                        TILE_FOUND_COST,
                        selCol,
                        selRow,
                      ).toLocaleString()}
                      G)
                    </button>
                  </div>
                ))}
            </div>
          </div>
          )}
        </>
      )}
    </main>
  );
}
