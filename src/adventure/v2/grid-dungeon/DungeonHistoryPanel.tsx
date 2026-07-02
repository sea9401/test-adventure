"use client";

import { useState } from "react";
import {
  GRID_DUNGEON_ROUTES,
} from "@/adventure/data/v2/gridDungeon";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import type { GridDungeonState } from "./gridDungeonViewTypes";

// 격자 던전 — 탐사 기록/드랍 요약/보상 한도 패널(V2GridDungeonView 에서 분리, 2026-07).
const HISTORY_LABEL: Record<
  NonNullable<GridDungeonState["history"]>[number]["outcome"],
  string
> = {
  cleared: "클리어",
  failed: "실패",
  abandoned: "포기",
};

const HISTORY_TONE: Record<
  NonNullable<GridDungeonState["history"]>[number]["outcome"],
  string
> = {
  cleared: "border-emerald-800 bg-emerald-950/45 text-emerald-200",
  failed: "border-red-900 bg-red-950/45 text-red-200",
  abandoned: "border-zinc-700 bg-zinc-900 text-zinc-300",
};

function dropEntries(drops: Record<string, number> | undefined) {
  return Object.entries(drops ?? {})
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a.localeCompare(b));
}

function dropCount(drops: Record<string, number> | undefined) {
  return dropEntries(drops).reduce((sum, [, amount]) => sum + amount, 0);
}

function formatHistoryTime(at: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return remain > 0 ? `${minutes}분 ${remain}초` : `${minutes}분`;
}

export function DropSummary({
  drops,
  emptyLabel,
}: {
  drops: Record<string, number> | undefined;
  emptyLabel?: string;
}) {
  const entries = dropEntries(drops);
  if (entries.length === 0) {
    return emptyLabel ? (
      <div className="text-[11px] text-zinc-500">{emptyLabel}</div>
    ) : null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([id, amount]) => (
        <span
          key={id}
          className="rounded border border-yellow-800/70 bg-yellow-950/35 px-2 py-1 text-[11px] text-yellow-200"
        >
          {V2_MATERIALS[id]?.name ?? id} x{amount.toLocaleString()}
        </span>
      ))}
    </div>
  );
}

export function RewardQuotaNotice({
  quota,
  pendingDrops,
}: {
  quota: GridDungeonState["rewardQuota"];
  pendingDrops?: Record<string, number>;
}) {
  if (!quota) return null;
  const canClaimMaterials = quota.remaining > 0;
  const pending = dropCount(pendingDrops);
  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${
        canClaimMaterials
          ? "border-yellow-800/70 bg-yellow-950/35 text-yellow-200"
          : "border-zinc-800 bg-zinc-950/70 text-zinc-400"
      }`}
    >
      <div className="font-semibold">
        재료 보상 {quota.remaining} / {quota.limit}회 남음
      </div>
      <div className="mt-0.5 text-[11px] opacity-80">
        {canClaimMaterials
          ? pending > 0
            ? `정산 시 확보 재료 ${pending.toLocaleString()}개가 지급됩니다.`
            : "오늘 재료 보상을 받을 수 있습니다."
          : "탐험과 골드 정산은 가능하지만 오늘 재료 보상은 더 받을 수 없습니다."}
      </div>
    </div>
  );
}

export function DungeonHistory({
  entries,
}: {
  entries: GridDungeonState["history"];
}) {
  const history = entries ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <section className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="text-xs font-semibold text-zinc-300">최근 탐험 기록</div>
      {history.length === 0 ? (
        <div className="text-xs text-zinc-500">아직 기록이 없습니다.</div>
      ) : (
        <div className="space-y-1.5">
          {history.slice(0, 5).map((entry) => (
            <div
              key={entry.id}
              className="rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${HISTORY_TONE[entry.outcome]}`}
                  >
                    {HISTORY_LABEL[entry.outcome]}
                  </span>
                  <span className="truncate text-zinc-300">
                    {formatHistoryTime(entry.at)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-zinc-500">
                  <span>{entry.rewardGold.toLocaleString()}G</span>
                  <span>재료 {(entry.materialCount ?? dropCount(entry.drops)).toLocaleString()}</span>
                  <span>{entry.exploredTiles}칸</span>
                  <span>HP {entry.hp}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId((current) =>
                        current === entry.id ? null : entry.id,
                      )
                    }
                    className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
                  >
                    {expandedId === entry.id ? "접기" : "상세"}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">
                {entry.detailReason || entry.message}
                {entry.rewardLimited ? (
                  <span className="ml-2 rounded border border-yellow-800/70 bg-yellow-950/35 px-1.5 py-0.5 text-[10px] text-yellow-200">
                    재료 제한
                  </span>
                ) : null}
              </div>
              {dropEntries(entry.drops).length > 0 && (
                <div className="mt-2">
                  <DropSummary drops={entry.drops} />
                </div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] text-zinc-500 sm:grid-cols-4">
                <span>
                  경로{" "}
                  <span className="text-zinc-300">
                    {GRID_DUNGEON_ROUTES[entry.routeId].shortName}
                  </span>
                </span>
                <span>
                  파티{" "}
                  <span className="text-zinc-300">
                    {(entry.supporterCount + 1).toLocaleString()}명
                  </span>
                </span>
                <span>
                  보스{" "}
                  <span
                    className={
                      entry.bossReached ? "text-emerald-300" : "text-zinc-400"
                    }
                  >
                    {entry.bossReached ? "도달" : "미도달"}
                  </span>
                </span>
                <span>
                  전투{" "}
                  <span className="text-zinc-300">
                    {entry.combatCount.toLocaleString()}회 ·{" "}
                    {entry.totalCombatTurns.toLocaleString()}턴
                  </span>
                </span>
              </div>
              {entry.durationMs > 0 && (
                <div className="mt-1 text-[11px] text-zinc-600">
                  소요 {formatDuration(entry.durationMs)}
                </div>
              )}
              {expandedId === entry.id && (
                <div className="mt-2 grid gap-1.5 border-t border-zinc-800 pt-2 text-[11px] text-zinc-500 sm:grid-cols-2">
                  <span>
                    결과 메시지{" "}
                    <span className="text-zinc-300">{entry.message}</span>
                  </span>
                  <span>
                    보상 상태{" "}
                    <span className="text-zinc-300">
                      {entry.rewardLimited
                        ? "골드만 정산"
                        : entry.rewardGold > 0 || dropCount(entry.drops) > 0
                          ? "정상 정산"
                          : "정산 없음"}
                    </span>
                  </span>
                  <span>
                    평균 전투 턴{" "}
                    <span className="text-zinc-300">
                      {entry.combatCount > 0
                        ? Math.round(entry.totalCombatTurns / entry.combatCount)
                        : 0}
                    </span>
                  </span>
                  <span>
                    생존 HP{" "}
                    <span
                      className={
                        entry.hp > 0 ? "text-emerald-300" : "text-red-300"
                      }
                    >
                      {entry.hp.toLocaleString()}
                    </span>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

