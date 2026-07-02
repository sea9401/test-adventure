"use client";

import {
  GRID_DUNGEON_ROUTE_OPTIONS,
  gridDungeonRouteSummary,
  type GridDungeonRouteId,
} from "@/adventure/data/v2/gridDungeon";

// 격자 던전 — 경로 선택 패널(V2GridDungeonView 에서 분리, 2026-07).
function RouteMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded border border-zinc-800 bg-black/20 px-2 py-1">
      <span className="text-zinc-500">{label}</span>{" "}
      <span className="font-semibold text-zinc-200">{value}</span>
    </span>
  );
}

const ROUTE_GUIDANCE: Record<
  GridDungeonRouteId,
  {
    label: string;
    detail: string;
    tone: string;
    selectedText: (supporterCount: number) => string;
  }
> = {
  balanced: {
    label: "솔로 가능",
    detail: "기본 경로",
    tone: "border-emerald-800/80 bg-emerald-950/35 text-emerald-200",
    selectedText: (supporterCount) =>
      supporterCount > 0 ? "지원자 선택됨 · 안정 진행" : "솔로 기준 경로",
  },
  vault: {
    label: "HP 여유 권장",
    detail: "함정 포함",
    tone: "border-yellow-800/80 bg-yellow-950/35 text-yellow-200",
    selectedText: (supporterCount) =>
      supporterCount > 0 ? "지원자 선택됨 · 함정 부담 완화" : "솔로 가능 · HP 확인",
  },
  guardian: {
    label: "파티 권장",
    detail: "고위험 전투",
    tone: "border-red-900/80 bg-red-950/35 text-red-200",
    selectedText: (supporterCount) =>
      supporterCount >= 2
        ? "지원자 2명 선택됨"
        : supporterCount === 1
          ? "지원자 1명 선택됨 · 2명 권장"
          : "지원자 선택 권장",
  },
};

export function RouteSelector({
  selected,
  disabled,
  selectedSupporterCount,
  onSelect,
}: {
  selected: GridDungeonRouteId;
  disabled: boolean;
  selectedSupporterCount: number;
  onSelect: (routeId: GridDungeonRouteId) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {GRID_DUNGEON_ROUTE_OPTIONS.map((route) => {
        const active = route.id === selected;
        const summary = gridDungeonRouteSummary(route.id);
        const guidance = ROUTE_GUIDANCE[route.id];
        return (
          <button
            key={route.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(route.id)}
            className={`min-h-48 rounded-md border px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? "border-emerald-500 bg-emerald-950/45 text-emerald-100"
                : "border-zinc-800 bg-zinc-950/70 text-zinc-300 hover:border-zinc-600"
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">{route.name}</span>
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] ${
                  active
                    ? "border-emerald-700 text-emerald-200"
                    : "border-zinc-700 text-zinc-500"
                }`}
              >
                {route.risk}
              </span>
            </span>
            <span className="mt-2 block leading-relaxed text-zinc-500">
              {route.description}
            </span>
            <span className="mt-3 flex flex-wrap gap-1.5">
              <span
                className={`rounded border px-2 py-1 text-[11px] font-semibold ${guidance.tone}`}
              >
                {guidance.label}
              </span>
              <span className="rounded border border-zinc-800 bg-black/20 px-2 py-1 text-[11px] text-zinc-400">
                {guidance.detail}
              </span>
            </span>
            <span
              className={`mt-2 block rounded border px-2 py-1.5 text-[11px] ${
                route.id === "guardian" && selectedSupporterCount === 0
                  ? "border-red-900/80 bg-red-950/35 text-red-200"
                  : "border-zinc-800 bg-black/20 text-zinc-400"
              }`}
            >
              파티 상태: {guidance.selectedText(selectedSupporterCount)}
            </span>
            <span className="mt-3 grid grid-cols-2 gap-1.5">
              <RouteMetric
                label="골드"
                value={`${summary.expectedGold.toLocaleString()}G`}
              />
              <RouteMetric
                label="전투"
                value={`${summary.combatRooms.toLocaleString()}방 · ${summary.avgCombatDepth}`}
              />
              <RouteMetric
                label="함정"
                value={`${summary.trapRooms.toLocaleString()}개`}
              />
              <RouteMetric
                label="샘"
                value={`${summary.fountainRooms.toLocaleString()}개`}
              />
              <RouteMetric
                label="재료"
                value={`${summary.materialRooms.toLocaleString()}방 · ${summary.avgMaterialDepth}`}
              />
              <RouteMetric
                label="보스"
                value={`${summary.bossGold.toLocaleString()}G`}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

