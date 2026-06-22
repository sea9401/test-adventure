"use client";

// === 자유 타일 지도 — Phase 1~3 렌더 (비파괴) ========================================
// V2_FREEFORM_TILES on 일 때 /map 에서 옛 ContinentMap 대신 렌더.
//  - 9×9 보드 + 유지 거점 9개(점령 상태색) + 빈 땅 자유 이동(Phase 2).
//  - 빈 땅 어디든 개척마을 건설 → 마을(영지 획득)→도시→대도시 승격/철거(Phase 3).
//  - 개척마을은 땅 미보유(점선 영지 없음), 마을+ 는 3×3 점선 영지를 가진다.
// 라이브 데이터(occupations/treasuries/currentOutpostId)는 표시만, 정착지는 tileSettlements.
import { useEffect, useState } from "react";
import {
  CastleTurret,
  Coins,
  Crown,
  Flag,
  Hammer,
  House,
  Mountains,
  Sparkle,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import {
  OUTPOSTS,
  kingdomNameOf,
  OUTPOST_NPC_TAX_RATE,
} from "@/adventure/data/v2/outposts";
import { CONFLICT_ZONE_IDS } from "@/adventure/data/v2/outpostGraph";
import { guildColorHex } from "@/adventure/data/guild-colors";
import {
  TILE_BOARD_SIZE,
  TILE_OUTPOST_AT,
  TILE_POS_BY_OUTPOST,
  TILE_KEPT_OUTPOST_IDS,
  tileKey,
  TILE_TIER_LABEL,
  TILE_FOUND_COST,
  TILE_PROMOTE_COST,
  TILE_YIELD_PER_HOUR,
  tileYieldLevelMult,
  tileTierOwnsLand,
  tileNextTier,
  tilePendingYield,
  isTileSettlementTier,
  type TileSettlementTier,
} from "@/adventure/data/v2/tileConfig";
import type { Outpost, OutpostType } from "@/adventure/data/v2/types";

const CELL = 54; // 셀(=아이콘) 크기 px. 고정값(반응형은 후속 폴리시).
const GAP = 1;

const TYPE_ICON: Record<OutpostType, Icon> = {
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

// 개척 정착지 티어별 아이콘 — 개척마을(깃발)→마을(집)→도시(성)→대도시(왕관).
const SETTLE_TIER_ICON: Record<TileSettlementTier, Icon> = {
  frontier: Flag,
  village: House,
  city: CastleTurret,
  metropolis: Crown,
};
const FOUNDED_FILL = "#10b981"; // 개척 정착지 = 초록 계열.

const OUTPOST_BY_ID = new Map(OUTPOSTS.map((o) => [o.id, o]));

type OccupationLite = {
  outpostId: string;
  occupiedByUserId: string | null;
  occupiedByGuildId: number | null;
  occupiedByGuildName: string | null;
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
  lastHarvestAt?: number | null;
};

const tierOf = (t: string): TileSettlementTier =>
  isTileSettlementTier(t) ? t : "frontier";

export function TileMap({
  onTravelToTile,
  onTravelTo,
  tilePos,
  tileSettlements,
  onFoundTile,
  onPromoteTile,
  onDemolishTile,
  onHarvestTile,
  occupations,
  treasuries,
  viewerUserId,
  viewerGuildId,
  viewerLevel,
  currentOutpostId,
}: {
  // 칸 이동(거점/빈 땅 공통) — 좌표를 받아 provider 가 거점/빈땅 분기.
  onTravelToTile?: (col: number, row: number) => void;
  // 거점 직접 이동 — 보드 밖 거점(옛 23거점 중 9 외)도 이동 가능하게(공존). visit-outpost.
  onTravelTo?: (o: Outpost) => void;
  tilePos?: { col: number; row: number } | null;
  // 개척 정착지(Phase 3~4).
  tileSettlements?: TileSettlementLite[];
  onFoundTile?: (col: number, row: number) => void;
  onPromoteTile?: (col: number, row: number) => void;
  onDemolishTile?: (col: number, row: number) => void;
  onHarvestTile?: (col: number, row: number) => void;
  occupations?: OccupationLite[];
  treasuries?: Array<{ outpostId: string; gold: number }>;
  viewerUserId?: string | null;
  viewerGuildId?: number | null;
  // 본인 레벨 — 진행도 연동 시급(본인 정착지 표시·수확)에 사용.
  viewerLevel?: number;
  currentOutpostId?: string | null;
} = {}) {
  const [selected, setSelected] = useState<string | null>(null); // 칸 키 "c,r"
  // 보류 수확량 계산용 현재시각 — 초기값은 lazy init(마운트 1회), 30초마다 갱신해 라이브 틱.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const occByOutpost = new Map<string, OccupationLite>();
  if (occupations) for (const o of occupations) occByOutpost.set(o.outpostId, o);
  const treasuryByOutpost = new Map<string, number>();
  if (treasuries) for (const t of treasuries) treasuryByOutpost.set(t.outpostId, t.gold);
  const settlementByKey = new Map<string, TileSettlementLite>();
  if (tileSettlements)
    for (const s of tileSettlements) settlementByKey.set(tileKey(s.col, s.row), s);

  const ownerLabelOf = (o: Outpost): string | null => {
    if (o.neutral) return null;
    const occ = occByOutpost.get(o.id);
    if (occ?.occupiedByGuildName) return `${occ.occupiedByGuildName} 길드 점령`;
    if (occ?.occupiedByUserId) return "솔로 점령자";
    if (CONFLICT_ZONE_IDS.has(o.id)) return "분쟁지대 · 무소속";
    const kn = kingdomNameOf(o);
    return kn ? `${kn}령` : "무소속";
  };
  const taxPctOf = (o: Outpost): number => {
    const occ = occByOutpost.get(o.id);
    const raw =
      occ?.occupiedByUserId != null && occ.taxRate != null
        ? Number(occ.taxRate)
        : OUTPOST_NPC_TAX_RATE;
    return Math.round((Number.isFinite(raw) ? raw : OUTPOST_NPC_TAX_RATE) * 100);
  };

  // 보드 밖 거점 — 옛 23거점 중 보드(9) 외 14개. 공존: 전쟁/도시/마을이 계속 살아있으므로
  // 새 지도에서도 이동 가능하게 목록으로 노출(분쟁지대 먼저). 옛 ContinentMap travel 파리티 유지.
  const offBoardOutposts = OUTPOSTS.filter(
    (o) => !TILE_KEPT_OUTPOST_IDS.has(o.id),
  ).sort(
    (a, b) =>
      (CONFLICT_ZONE_IDS.has(a.id) ? 0 : 1) -
      (CONFLICT_ZONE_IDS.has(b.id) ? 0 : 1),
  );

  const boardPx = TILE_BOARD_SIZE * CELL + (TILE_BOARD_SIZE - 1) * GAP;
  const iconPx = Math.round(CELL * 0.5);
  const cells = Array.from({ length: TILE_BOARD_SIZE * TILE_BOARD_SIZE }, (_, i) => ({
    col: i % TILE_BOARD_SIZE,
    row: Math.floor(i / TILE_BOARD_SIZE),
  }));

  // 선택 칸 → 거점 / 정착지 / 빈 땅.
  const selOutpostId = selected ? TILE_OUTPOST_AT.get(selected) : undefined;
  const selOutpost = selOutpostId ? OUTPOST_BY_ID.get(selOutpostId) : undefined;
  const selSettlement = selected ? settlementByKey.get(selected) : undefined;
  const [selCol, selRow] = selected ? selected.split(",").map(Number) : [-1, -1];

  // 플레이어 마커 칸 — tilePos 우선, 없으면 현재 거점 칸에서 파생(보드 밖이면 마커 없음).
  const playerPos =
    tilePos ??
    (currentOutpostId
      ? (TILE_POS_BY_OUTPOST.get(currentOutpostId) ?? null)
      : null);
  const playerTileKey = playerPos ? tileKey(playerPos.col, playerPos.row) : null;
  const currentOnBoard = playerTileKey != null;

  // 영지 점선 경계 — 땅 보유 정착지(마을+)의 3×3(보드 밖 잘림). 개척마을(frontier)은 없음.
  const at = (i: number) => i * (CELL + GAP);
  const territory = (tileSettlements ?? [])
    .filter((s) => tileTierOwnsLand(tierOf(s.tier)))
    .map((s) => {
      const c0 = Math.max(0, s.col - 1);
      const c1 = Math.min(TILE_BOARD_SIZE - 1, s.col + 1);
      const r0 = Math.max(0, s.row - 1);
      const r1 = Math.min(TILE_BOARD_SIZE - 1, s.row + 1);
      return {
        key: tileKey(s.col, s.row),
        left: at(c0) - 2,
        top: at(r0) - 2,
        width: (c1 - c0 + 1) * CELL + (c1 - c0) * GAP + 4,
        height: (r1 - r0 + 1) * CELL + (r1 - r0) * GAP + 4,
      };
    });

  return (
    <main className="mx-auto max-w-2xl space-y-3 p-4 text-zinc-200">
      <div>
        <h1 className="text-base font-bold text-zinc-100">대륙 지도</h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          칸을 눌러 어디로든 이동하고, 빈 땅에는 개척마을을 세워 마을→도시→대도시로
          키웁니다.
        </p>
      </div>

      {!currentOnBoard && currentOutpostId && (
        <div className="rounded-md border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">
          현재 위치가 새 지도 밖의 거점입니다. 칸을 골라 이동하면 보드로 들어옵니다.
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="relative" style={{ width: boardPx, height: boardPx }}>
          <div
            className="grid bg-zinc-800/70 ring-1 ring-zinc-800"
            style={{
              width: boardPx,
              height: boardPx,
              gridTemplateColumns: `repeat(${TILE_BOARD_SIZE}, ${CELL}px)`,
              gap: GAP,
            }}
          >
            {cells.map(({ col, row }) => {
              const k = tileKey(col, row);
              const oid = TILE_OUTPOST_AT.get(k);
              const o = oid ? OUTPOST_BY_ID.get(oid) : undefined;
              const occ = oid ? occByOutpost.get(oid) : undefined;
              const settlement = settlementByKey.get(k);
              const isSel = selected === k;
              const isPlayer = k === playerTileKey;
              const ring = isPlayer ? (
                <span className="pointer-events-none absolute inset-0 z-10 rounded-md ring-2 ring-emerald-400" />
              ) : null;
              const cls = `relative flex items-center justify-center transition ${
                isSel ? "outline outline-2 outline-indigo-400" : ""
              }`;

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
                const Glyph = o.tier === 4 ? Crown : TYPE_ICON[o.type];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelected(k)}
                    title={occ?.villageName?.trim() || o.name}
                    className={cls}
                    style={{ width: CELL, height: CELL, background: `${fill}22` }}
                  >
                    <span
                      className="flex items-center justify-center rounded-md"
                      style={{ width: CELL - 10, height: CELL - 10, background: fill }}
                    >
                      <Glyph size={iconPx} weight="fill" color="#0b1020" />
                    </span>
                    {ring}
                  </button>
                );
              }

              if (settlement) {
                const Glyph = SETTLE_TIER_ICON[tierOf(settlement.tier)];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelected(k)}
                    title={settlement.name ?? "개척 정착지"}
                    className={cls}
                    style={{
                      width: CELL,
                      height: CELL,
                      background: `${FOUNDED_FILL}22`,
                    }}
                  >
                    <span
                      className="flex items-center justify-center rounded-md"
                      style={{
                        width: CELL - 10,
                        height: CELL - 10,
                        background: FOUNDED_FILL,
                      }}
                    >
                      <Glyph size={iconPx} weight="fill" color="#0b1020" />
                    </span>
                    {ring}
                  </button>
                );
              }

              // 빈 땅.
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelected(k)}
                  title="빈 땅"
                  className={`relative bg-zinc-900/60 transition hover:bg-zinc-800 ${
                    isSel ? "outline outline-2 outline-indigo-400" : ""
                  }`}
                  style={{ width: CELL, height: CELL }}
                >
                  {ring}
                </button>
              );
            })}
          </div>

          {/* 영지 점선 경계 — 마을+ 만(개척마을은 땅 미보유). */}
          {territory.map((t) => (
            <div
              key={`terr-${t.key}`}
              className="pointer-events-none absolute z-20 rounded-lg border-2 border-dashed"
              style={{
                left: t.left,
                top: t.top,
                width: t.width,
                height: t.height,
                borderColor: `${FOUNDED_FILL}88`,
              }}
            />
          ))}
        </div>
      </div>

      {/* 선택 칸 패널 */}
      {selected &&
        (selOutpost ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-sm font-semibold text-zinc-100">
                  {occByOutpost.get(selOutpost.id)?.villageName?.trim() ||
                    selOutpost.name}
                </span>
                <span className="text-xs text-zinc-500">
                  {selOutpost.tier === 4 ? "지역 중심" : TYPE_LABEL[selOutpost.type]}
                </span>
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
            // idle 생산(Phase 4) + 진행도 연동(레벨 배율). 본인 정착지만 표시 — 남의 것은
            // 소유자 레벨을 모르니 시급/보류를 계산할 수 없다(viewerLevel = 본인 레벨).
            const perHour = Math.round(
              (TILE_YIELD_PER_HOUR[tier] ?? 0) *
                tileYieldLevelMult(viewerLevel ?? 1),
            );
            const pending =
              mine && selSettlement.lastHarvestAt != null
                ? tilePendingYield(
                    tier,
                    selSettlement.lastHarvestAt,
                    now,
                    viewerLevel ?? 1,
                  )
                : 0;
            return (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
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
                    {mine ? "내 정착지" : "다른 모험가의 정착지"} ·{" "}
                    {tileTierOwnsLand(tier) ? "영지 3×3 보유" : "땅 미보유 (개척 거점)"}
                  </div>
                  {mine && perHour > 0 && (
                    <div className="mt-0.5 text-xs text-amber-300/90">
                      수확 가능 {pending.toLocaleString()}G
                      <span className="text-zinc-500">
                        {" "}
                        · 시급 {perHour.toLocaleString()}G (레벨 비례)
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {mine && perHour > 0 && onHarvestTile && (
                    <button
                      type="button"
                      onClick={() => onHarvestTile(selCol, selRow)}
                      disabled={pending <= 0}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Coins size={14} weight="fill" />
                      수확{pending > 0 ? ` (${pending.toLocaleString()}G)` : ""}
                    </button>
                  )}
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
                  {mine && next && onPromoteTile && (
                    <button
                      type="button"
                      onClick={() => onPromoteTile(selCol, selRow)}
                      className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                    >
                      {tier === "frontier" ? "마을로 승격(영지)" : "승격"} →{" "}
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
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
            <div className="text-xs text-zinc-400">
              빈 땅 ({selCol}, {selRow})
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
              {onFoundTile && (
                <button
                  type="button"
                  onClick={() => onFoundTile(selCol, selRow)}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <Hammer size={14} weight="fill" />
                  개척마을 건설 ({TILE_FOUND_COST.toLocaleString()}G)
                </button>
              )}
            </div>
          </div>
        ))}

      {/* 다른 지역 거점 — 보드 밖(공존). 전쟁 분쟁지대·도시·마을 등 옛 거점 이동 유지. */}
      {onTravelTo && offBoardOutposts.length > 0 && (
        <details className="rounded-lg border border-zinc-800 bg-zinc-900/50">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-400">
            다른 지역 거점{" "}
            <span className="text-zinc-600">· 보드 밖 {offBoardOutposts.length}</span>
          </summary>
          <div className="flex flex-col gap-1 px-3 pb-3">
            {offBoardOutposts.map((o) => {
              const label = ownerLabelOf(o);
              const isCurrent = currentOutpostId === o.id;
              const conflict = CONFLICT_ZONE_IDS.has(o.id);
              return (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-zinc-900/60 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <span className="text-xs text-zinc-200">{o.name}</span>
                    {conflict && (
                      <span className="ml-1.5 text-[11px] text-rose-400">분쟁</span>
                    )}
                    {label && (
                      <span className="ml-1.5 text-[11px] text-zinc-500">
                        {label}
                      </span>
                    )}
                  </div>
                  {isCurrent ? (
                    <span className="shrink-0 text-[11px] text-emerald-300">
                      현재 위치
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onTravelTo(o)}
                      className="shrink-0 rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                    >
                      이동
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </main>
  );
}
