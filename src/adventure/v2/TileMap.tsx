"use client";

// === 자유 타일 지도 — Phase 1 렌더 (비파괴) ==========================================
// V2_FREEFORM_TILES on 일 때 /map 에서 옛 ContinentMap 대신 렌더. 9×9 타일 보드 위에
// 유지 거점 9개(옛 outpost id 재사용)를 점령 상태색으로 그리고, 클릭→선택 패널에서 이동.
// 빈 땅은 보이되 아직 비활성(자유 이동·개척마을 건설은 Phase 2·3 에서 배선).
// 옛 데이터(occupations/treasuries/currentOutpostId)를 그대로 받아 표시만 바꾼다.
import { useState } from "react";
import {
  CastleTurret,
  Crown,
  House,
  Mountains,
  Sparkle,
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
  tileKey,
} from "@/adventure/data/v2/tileConfig";
import type { Outpost, OutpostType } from "@/adventure/data/v2/types";

const CELL = 54; // 셀(=아이콘) 크기 px. Phase 1 고정값(반응형은 후속 폴리시).
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

export function TileMap({
  onTravelToTile,
  tilePos,
  occupations,
  treasuries,
  viewerUserId,
  viewerGuildId,
  currentOutpostId,
}: {
  // 칸 이동(거점/빈 땅 공통) — 좌표를 받아 provider 가 거점/빈땅 분기.
  onTravelToTile?: (col: number, row: number) => void;
  // 플레이어 마커 칸. 없으면 현재 거점 칸에서 파생.
  tilePos?: { col: number; row: number } | null;
  occupations?: OccupationLite[];
  treasuries?: Array<{ outpostId: string; gold: number }>;
  viewerUserId?: string | null;
  viewerGuildId?: number | null;
  currentOutpostId?: string | null;
} = {}) {
  const [selected, setSelected] = useState<string | null>(null); // 칸 키 "c,r"

  const occByOutpost = new Map<string, OccupationLite>();
  if (occupations) for (const o of occupations) occByOutpost.set(o.outpostId, o);
  const treasuryByOutpost = new Map<string, number>();
  if (treasuries) for (const t of treasuries) treasuryByOutpost.set(t.outpostId, t.gold);

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

  const boardPx = TILE_BOARD_SIZE * CELL + (TILE_BOARD_SIZE - 1) * GAP;
  const iconPx = Math.round(CELL * 0.5);
  const cells = Array.from({ length: TILE_BOARD_SIZE * TILE_BOARD_SIZE }, (_, i) => ({
    col: i % TILE_BOARD_SIZE,
    row: Math.floor(i / TILE_BOARD_SIZE),
  }));

  // 선택 칸 → 거점/빈 땅.
  const selOutpostId = selected ? TILE_OUTPOST_AT.get(selected) : undefined;
  const selOutpost = selOutpostId ? OUTPOST_BY_ID.get(selOutpostId) : undefined;
  const [selCol, selRow] = selected ? selected.split(",").map(Number) : [-1, -1];

  // 플레이어 마커 칸 — tilePos 우선, 없으면 현재 거점 칸에서 파생(보드 밖이면 마커 없음).
  const playerPos =
    tilePos ??
    (currentOutpostId
      ? (TILE_POS_BY_OUTPOST.get(currentOutpostId) ?? null)
      : null);
  const playerTileKey = playerPos ? tileKey(playerPos.col, playerPos.row) : null;

  // 마커가 보드 밖(현재 거점이 9거점 밖이고 tilePos 도 없음)이면 배너로 안내.
  const currentOnBoard = playerTileKey != null;

  return (
    <main className="mx-auto max-w-2xl space-y-3 p-4 text-zinc-200">
      <div>
        <h1 className="text-base font-bold text-zinc-100">대륙 지도</h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          칸을 눌러 어디로든 이동합니다(거점·빈 땅 모두). 개척마을 건설은 곧
          열립니다.
        </p>
      </div>

      {!currentOnBoard && currentOutpostId && (
        <div className="rounded-md border border-amber-700 bg-amber-950/40 p-2 text-xs text-amber-200">
          현재 위치가 새 지도 밖의 거점입니다. 거점을 골라 이동하면 보드로
          들어옵니다.
        </div>
      )}

      <div className="overflow-x-auto">
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
            const isSel = selected === k;
            const isPlayer = k === playerTileKey;

            if (!o) {
              // 빈 땅 — 클릭 선택 → 패널에서 이동(자유 타일 지도). 마커가 여기면 링 표시.
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
                  {isPlayer && (
                    <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-emerald-400" />
                  )}
                </button>
              );
            }

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
                className={`relative flex items-center justify-center transition ${
                  isSel ? "outline outline-2 outline-indigo-400" : ""
                }`}
                style={{ width: CELL, height: CELL, background: `${fill}22` }}
              >
                <span
                  className="flex items-center justify-center rounded-md"
                  style={{ width: CELL - 10, height: CELL - 10, background: fill }}
                >
                  <Glyph size={iconPx} weight="fill" color="#0b1020" />
                </span>
                {isPlayer && (
                  <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-emerald-400" />
                )}
              </button>
            );
          })}
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
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
            <div className="text-xs text-zinc-400">
              빈 땅 ({selCol}, {selRow}) — 개척마을 건설은 다음 단계(Phase 3)에서
              열립니다.
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
        ))}
    </main>
  );
}
