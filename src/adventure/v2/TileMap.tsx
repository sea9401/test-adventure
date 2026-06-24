"use client";

// === 자유 타일 지도 — /map 의 지도 컴포넌트 (옛 ContinentMap 대체·은퇴) ================
//  - 9×9 보드 + 유지 거점 9개(점령 상태색) + 빈 땅 자유 이동(Phase 2).
//  - 빈 땅 어디든 개척마을 건설 → 마을→도시→대도시 승격/철거(Phase 3).
// 라이브 데이터(occupations/treasuries/currentOutpostId)는 표시만, 정착지는 tileSettlements.
import { useState } from "react";
import {
  CastleTurret,
  Crown,
  Flag,
  Hammer,
  House,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import {
  OUTPOSTS,
  OUTPOST_NPC_TAX_RATE,
} from "@/adventure/data/v2/outposts";
import { CONFLICT_ZONE_IDS } from "@/adventure/data/v2/outpostGraph";
import { tileOutpostId } from "@/adventure/data/v2/tileWarfare";
import {
  V2_TILE_WARFARE,
  V2_TILE_PRODUCTION,
} from "@/adventure/data/v2/settlementWarfareConfig";
import { guildColorHex } from "@/adventure/data/guild-colors";
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
  type TileSettlementTier,
} from "@/adventure/data/v2/tileConfig";
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
  // 소유자의 현재 길드(서버가 멤버십 조인으로 파생). 무소속이면 null.
  guildId?: number | null;
  guildName?: string | null;
  guildColor?: string | null;
};

const tierOf = (t: string): TileSettlementTier =>
  isTileSettlementTier(t) ? t : "frontier";

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
  actionError,
  onDismissActionError,
}: {
  // 칸 이동(거점/빈 땅 공통) — 좌표를 받아 provider 가 거점/빈땅 분기.
  onTravelToTile?: (col: number, row: number) => void;
  tilePos?: { col: number; row: number } | null;
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
  // 개척/승격/철거/개명 실패 사유(한 줄). 있으면 빈 땅 패널에 안내 배너로 표시.
  actionError?: string | null;
  onDismissActionError?: () => void;
} = {}) {
  const [selected, setSelected] = useState<string | null>(null); // 칸 키 "c,r"
  const [foundName, setFoundName] = useState(""); // 개척마을 건설 폼 이름 입력

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

  // 플레이어 마커 칸 — tilePos 우선, 없으면 현재 거점 칸에서 파생(보드 밖이면 마커 없음).
  const playerPos =
    tilePos ??
    (currentOutpostId
      ? (TILE_POS_BY_OUTPOST.get(currentOutpostId) ?? null)
      : null);
  const playerTileKey = playerPos ? tileKey(playerPos.col, playerPos.row) : null;
  const currentOnBoard = playerTileKey != null;

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

      <div>
        <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
          <div
            className="grid h-full w-full bg-zinc-800/70 ring-1 ring-zinc-800"
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
              const isSel = selected === k;
              const isPlayer = k === playerTileKey;
              const ring = isPlayer ? (
                <span className="pointer-events-none absolute inset-0 z-10 rounded-md ring-2 ring-emerald-400" />
              ) : null;
              const cls = `relative flex h-full w-full items-center justify-center transition ${
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
                // 모든 거점 = 마을 아이콘으로 통일(타입/지역중심 구분 폐지).
                const Glyph = House;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelected(k)}
                    title={occ?.villageName?.trim() || o.name}
                    className={cls}
                    style={{ background: `${fill}22` }}
                  >
                    <span
                      className="flex h-[82%] w-[82%] items-center justify-center rounded-md"
                      style={{ background: fill }}
                    >
                      <Glyph className="h-3/5 w-3/5" weight="fill" color="#0b1020" />
                    </span>
                    {ring}
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
                    className={cls}
                    style={{ background: `${settleFill}22` }}
                  >
                    <span
                      className="flex h-[82%] w-[82%] items-center justify-center rounded-md"
                      style={{ background: settleFill }}
                    >
                      <Glyph className="h-3/5 w-3/5" weight="fill" color="#0b1020" />
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
                  className={`relative h-full w-full bg-zinc-900/60 transition hover:bg-zinc-800 ${
                    isSel ? "outline outline-2 outline-indigo-400" : ""
                  }`}
                >
                  {ring}
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
                    {ownerLabel}
                  </div>
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
              {onFoundTile &&
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
