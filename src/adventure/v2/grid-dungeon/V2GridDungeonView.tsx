"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CaretDown,
  CaretUp,
  Crown,
  Diamond,
  DoorOpen,
  FirstAidKit,
  Skull,
  Sparkle,
  TreasureChest,
  UsersThree,
  Warning,
} from "@phosphor-icons/react";
import {
  GRID_DUNGEON_ENTRANCE,
  GRID_DUNGEON_ROUTE_OPTIONS,
  GRID_DUNGEON_ROUTES,
  gridDungeonKey,
  gridDungeonMovePreview,
  type GridDungeonMoveDir,
  type GridDungeonPublicRun,
  type GridDungeonRouteId,
  type GridDungeonSupportRole,
  type GridDungeonTileKind,
} from "@/adventure/data/v2/gridDungeon";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";

type GridDungeonState = {
  ok: boolean;
  entrance: typeof GRID_DUNGEON_ENTRANCE;
  atEntrance: boolean;
  rewardQuota?: {
    dayKey: string;
    claimed: number;
    limit: number;
    remaining: number;
  };
  mySupportRole?: GridDungeonSupportRole | null;
  mySupportDaily?: {
    dayKey: string;
    used: number;
    useLimit: number;
    rewarded: number;
    rewardLimit: number;
    honorPerReward: number;
  };
  supportCandidates?: Array<{
    userId: string;
    name: string;
    level: number;
    job: string;
    supportLimit: number;
    supportRemaining: number;
    supportRole: GridDungeonSupportRole | null;
  }>;
  history?: Array<{
    id: string;
    outcome: "cleared" | "failed" | "abandoned";
    at: number;
    rewardGold: number;
    drops?: Record<string, number>;
    exploredTiles: number;
    hp: number;
    message: string;
  }>;
  run: GridDungeonPublicRun | null;
  error?: string;
};

const TILE_LABEL: Record<GridDungeonTileKind, string> = {
  start: "입구",
  empty: "복도",
  wall: "벽",
  monster: "경비병",
  elite: "수문장",
  treasure: "보물",
  trap: "함정",
  relic: "유물",
  fountain: "샘",
  boss: "파수꾼",
  exit: "출구",
};

const TILE_TONE: Record<
  GridDungeonTileKind,
  {
    cell: string;
    icon: string;
    visited: string;
  }
> = {
  start: {
    cell: "border-emerald-800/80 bg-emerald-950/45 text-emerald-200",
    icon: "text-emerald-300",
    visited: "bg-emerald-300",
  },
  empty: {
    cell: "border-zinc-700/80 bg-zinc-900 text-zinc-400",
    icon: "text-zinc-500",
    visited: "bg-zinc-500",
  },
  wall: {
    cell:
      "border-zinc-950 bg-zinc-950 text-zinc-700 shadow-inner shadow-black/70",
    icon: "text-zinc-700",
    visited: "bg-zinc-700",
  },
  monster: {
    cell: "border-red-900/70 bg-red-950/45 text-red-200",
    icon: "text-red-300",
    visited: "bg-red-400",
  },
  elite: {
    cell: "border-fuchsia-900/70 bg-fuchsia-950/45 text-fuchsia-200",
    icon: "text-fuchsia-300",
    visited: "bg-fuchsia-300",
  },
  treasure: {
    cell: "border-yellow-700/80 bg-yellow-950/45 text-yellow-200",
    icon: "text-yellow-300",
    visited: "bg-yellow-300",
  },
  trap: {
    cell: "border-orange-800/80 bg-orange-950/50 text-orange-200",
    icon: "text-orange-300",
    visited: "bg-orange-300",
  },
  relic: {
    cell: "border-violet-800/80 bg-violet-950/45 text-violet-200",
    icon: "text-violet-300",
    visited: "bg-violet-300",
  },
  fountain: {
    cell: "border-cyan-800/80 bg-cyan-950/45 text-cyan-200",
    icon: "text-cyan-300",
    visited: "bg-cyan-300",
  },
  boss: {
    cell: "border-rose-700/80 bg-rose-950/55 text-rose-100",
    icon: "text-rose-300",
    visited: "bg-rose-300",
  },
  exit: {
    cell: "border-indigo-700/80 bg-indigo-950/45 text-indigo-200",
    icon: "text-indigo-300",
    visited: "bg-indigo-300",
  },
};

const DIR_BUTTONS: Array<{
  dir: GridDungeonMoveDir;
  label: string;
  Icon: typeof ArrowUp;
}> = [
  { dir: "up", label: "위", Icon: ArrowUp },
  { dir: "left", label: "왼쪽", Icon: ArrowLeft },
  { dir: "right", label: "오른쪽", Icon: ArrowRight },
  { dir: "down", label: "아래", Icon: ArrowDown },
];

const EVENT_TILE_KINDS = new Set<GridDungeonTileKind>([
  "monster",
  "elite",
  "treasure",
  "trap",
  "relic",
  "fountain",
  "boss",
]);

const GRID_DUNGEON_COMBAT_PLAYBACK_MS = 1_500;

const ERROR_LABEL: Record<string, string> = {
  blocked: "막힌 방향입니다. 다른 통로를 선택하세요.",
  bad_direction: "이동 방향이 올바르지 않습니다.",
  no_run: "진행 중인 탐험이 없습니다.",
  not_active: "진행 중인 탐험에서만 이동할 수 있습니다.",
  not_cleared: "출구에 도착한 뒤 정산할 수 있습니다.",
  not_at_entrance: "지도에서 던전 입구 칸으로 이동해야 시작할 수 있습니다.",
  need_heal: "HP가 부족합니다. 치료소에서 회복한 뒤 다시 시작하세요.",
  not_in_guild: "길드에 가입해야 길드 동료 지원을 사용할 수 있습니다.",
  invalid_supporter: "선택한 지원자를 사용할 수 없습니다.",
  support_limit_reached: "선택한 지원자의 오늘 지원 가능 횟수가 모두 소진되었습니다.",
};

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

const SUPPORT_ROLE_LABEL: Record<GridDungeonSupportRole, string> = {
  dps: "공격",
  healer: "회복",
  tank: "방어",
};

const SUPPORT_ROLE_TONE: Record<GridDungeonSupportRole, string> = {
  dps: "border-red-800 bg-red-950/45 text-red-200",
  healer: "border-emerald-800 bg-emerald-950/45 text-emerald-200",
  tank: "border-sky-800 bg-sky-950/45 text-sky-200",
};

type SupportRoleFilter = GridDungeonSupportRole | "all" | "unset";

const SUPPORT_ROLE_FILTERS: SupportRoleFilter[] = [
  "all",
  "dps",
  "healer",
  "tank",
  "unset",
];

const COMBAT_LOG_TONE = {
  attack: "border-red-900/70 bg-red-950/35 text-red-200",
  heal: "border-emerald-800/70 bg-emerald-950/35 text-emerald-200",
  hit: "border-sky-900/70 bg-sky-950/35 text-sky-200",
  etc: "border-zinc-800 bg-zinc-950 text-zinc-400",
} as const;

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

function DropSummary({
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

function RewardQuotaNotice({
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

function DungeonHistory({
  entries,
}: {
  entries: GridDungeonState["history"];
}) {
  const history = entries ?? [];
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
                  <span>{entry.exploredTiles}칸</span>
                  <span>HP {entry.hp}</span>
                </div>
              </div>
              {dropEntries(entry.drops).length > 0 && (
                <div className="mt-2">
                  <DropSummary drops={entry.drops} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RouteSelector({
  selected,
  disabled,
  onSelect,
}: {
  selected: GridDungeonRouteId;
  disabled: boolean;
  onSelect: (routeId: GridDungeonRouteId) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {GRID_DUNGEON_ROUTE_OPTIONS.map((route) => {
        const active = route.id === selected;
        return (
          <button
            key={route.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(route.id)}
            className={`min-h-24 rounded-md border px-3 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
          </button>
        );
      })}
    </div>
  );
}

function SupportRolePill({ role }: { role: GridDungeonSupportRole | null }) {
  if (!role) {
    return (
      <span className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
        역할 미설정
      </span>
    );
  }
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] ${SUPPORT_ROLE_TONE[role]}`}
    >
      {SUPPORT_ROLE_LABEL[role]}
    </span>
  );
}

function SupportDailyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-0.5 text-xs font-semibold text-zinc-200">{value}</div>
    </div>
  );
}

function MySupportRolePanel({
  role,
  daily,
  busy,
  onSetRole,
}: {
  role: GridDungeonSupportRole | null;
  daily: GridDungeonState["mySupportDaily"] | undefined;
  busy: boolean;
  onSetRole: (role: GridDungeonSupportRole | null) => void;
}) {
  return (
    <section className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-zinc-200">내 지원 카드</div>
        <SupportRolePill role={role} />
      </div>
      <div className="text-[11px] leading-relaxed text-zinc-500">
        다른 길드원이 나를 던전에 데려갈 때 보이는 역할입니다.
      </div>
      {daily && (
        <div className="grid grid-cols-3 gap-2">
          <SupportDailyStat
            label="오늘 지원됨"
            value={`${daily.used} / ${daily.useLimit}`}
          />
          <SupportDailyStat
            label="보상 수령"
            value={`${daily.rewarded} / ${daily.rewardLimit}`}
          />
          <SupportDailyStat
            label="명예 보상"
            value={`+${daily.honorPerReward}`}
          />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {(["dps", "healer", "tank"] as const).map((nextRole) => {
          const selected = role === nextRole;
          return (
            <button
              key={nextRole}
              type="button"
              disabled={busy}
              onClick={() => onSetRole(nextRole)}
              className={`rounded-md border px-2.5 py-2 text-xs font-semibold transition disabled:opacity-40 ${
                selected
                  ? SUPPORT_ROLE_TONE[nextRole]
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-900"
              }`}
            >
              {SUPPORT_ROLE_LABEL[nextRole]}
            </button>
          );
        })}
      </div>
      {role && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSetRole(null)}
          className="text-left text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline disabled:opacity-40"
        >
          역할 해제
        </button>
      )}
    </section>
  );
}

function GuildSupportSelector({
  candidates,
  selectedIds,
  frontlineId,
  filter,
  busy,
  onFilterChange,
  onToggle,
  onFrontlineChange,
}: {
  candidates: NonNullable<GridDungeonState["supportCandidates"]>;
  selectedIds: string[];
  frontlineId: string;
  filter: SupportRoleFilter;
  busy: boolean;
  onFilterChange: (filter: SupportRoleFilter) => void;
  onToggle: (userId: string) => void;
  onFrontlineChange: (id: string) => void;
}) {
  if (candidates.length === 0) return null;
  const counts: Record<SupportRoleFilter, number> = {
    all: candidates.length,
    dps: 0,
    healer: 0,
    tank: 0,
    unset: 0,
  };
  for (const candidate of candidates) {
    if (candidate.supportRole) counts[candidate.supportRole] += 1;
    else counts.unset += 1;
  }
  const displayed = candidates.filter((candidate) => {
    if (filter === "all") return true;
    if (filter === "unset") return candidate.supportRole == null;
    return candidate.supportRole === filter;
  });
  const selected = candidates.filter((candidate) =>
    selectedIds.includes(candidate.userId),
  );
  return (
    <section className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
          <UsersThree size={16} weight="fill" />
          길드 동료 지원
        </div>
        <div className="text-[11px] text-zinc-500">{selected.length} / 2</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUPPORT_ROLE_FILTERS.map((roleFilter) => {
          const label =
            roleFilter === "all"
              ? "전체"
              : roleFilter === "unset"
                ? "미설정"
                : SUPPORT_ROLE_LABEL[roleFilter];
          const active = filter === roleFilter;
          return (
            <button
              key={roleFilter}
              type="button"
              onClick={() => onFilterChange(roleFilter)}
              className={`rounded border px-2 py-1 text-[11px] ${
                active
                  ? "border-emerald-700 bg-emerald-950/45 text-emerald-200"
                  : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900"
              }`}
            >
              {label} {counts[roleFilter]}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {displayed.map((candidate) => {
          const selectedCandidate = selectedIds.includes(candidate.userId);
          const unavailable = candidate.supportRemaining <= 0;
          return (
            <div
              key={candidate.userId}
              className={`min-h-24 rounded-md border px-3 py-2 text-xs transition ${
                selectedCandidate
                  ? "border-cyan-600 bg-cyan-950/35 text-cyan-100"
                  : unavailable
                    ? "border-zinc-900 bg-zinc-950/50 text-zinc-600"
                    : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {candidate.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">
                    Lv.{candidate.level} · {candidate.job}
                  </span>
                </span>
                <SupportRolePill role={candidate.supportRole} />
              </span>
              <span className="mt-2 block text-[11px] text-zinc-500">
                오늘 지원 가능 {candidate.supportRemaining} /{" "}
                {candidate.supportLimit}
              </span>
              <button
                type="button"
                disabled={busy || unavailable}
                onClick={() => onToggle(candidate.userId)}
                className={`mt-2 rounded border px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                  selectedCandidate
                    ? "border-cyan-600 bg-cyan-900/45 text-cyan-100"
                    : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {selectedCandidate ? "선택 해제" : "지원 선택"}
              </button>
              {selectedCandidate && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${
                      frontlineId === candidate.userId
                        ? "border-yellow-700 bg-yellow-950/45 text-yellow-200"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400"
                    }`}
                  >
                    {frontlineId === candidate.userId ? "전열" : "후열"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onFrontlineChange(candidate.userId)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300"
                  >
                    전열 지정
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="rounded border border-zinc-800 bg-black/20 px-2.5 py-2 text-[11px] text-zinc-500">
          전열:{" "}
          <button
            type="button"
            onClick={() => onFrontlineChange("main")}
            className={`rounded px-1.5 py-0.5 ${
              frontlineId === "main"
                ? "bg-yellow-950/45 text-yellow-200"
                : "text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            나
          </button>
          {selected.map((candidate) => (
            <button
              key={candidate.userId}
              type="button"
              onClick={() => onFrontlineChange(candidate.userId)}
              className={`ml-1 rounded px-1.5 py-0.5 ${
                frontlineId === candidate.userId
                  ? "bg-yellow-950/45 text-yellow-200"
                  : "text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              {candidate.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function tileIcon(kind: GridDungeonTileKind, visible: boolean) {
  if (!visible) return null;
  if (kind === "treasure") return <TreasureChest size={20} weight="fill" />;
  if (kind === "trap") return <Warning size={20} weight="fill" />;
  if (kind === "relic") return <Diamond size={20} weight="fill" />;
  if (kind === "monster" || kind === "elite") return <Skull size={20} weight="fill" />;
  if (kind === "boss") return <Crown size={20} weight="fill" />;
  if (kind === "fountain") return <FirstAidKit size={20} weight="fill" />;
  if (kind === "exit") return <DoorOpen size={20} weight="fill" />;
  if (kind === "start") return <Sparkle size={20} weight="fill" />;
  return null;
}

function tileClassName({
  kind,
  isCurrent,
  isRevealed,
  isClearedEvent,
  isPendingEvent,
}: {
  kind: GridDungeonTileKind;
  isCurrent: boolean;
  isRevealed: boolean;
  isClearedEvent: boolean;
  isPendingEvent: boolean;
}) {
  const base =
    "relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded border text-[10px] transition";
  if (isCurrent) {
    return `${base} border-emerald-300 bg-emerald-900/75 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.45),0_0_24px_rgba(16,185,129,0.28)]`;
  }
  if (!isRevealed) {
    return `${base} border-zinc-950 bg-black text-zinc-700`;
  }
  const tone = `${base} ${TILE_TONE[kind].cell}`;
  if (isPendingEvent) return `${tone} ring-1 ring-yellow-300/70`;
  if (isClearedEvent) return `${tone} opacity-75 saturate-50`;
  return tone;
}

function tileBackgroundStyle(isRevealed: boolean, isCurrent: boolean) {
  if (isCurrent) {
    return {
      backgroundImage:
        "radial-gradient(circle at 50% 42%, rgba(52,211,153,0.35), transparent 46%), linear-gradient(135deg, rgba(16,185,129,0.20), transparent 58%)",
    };
  }
  if (!isRevealed) {
    return {
      backgroundImage:
        "radial-gradient(circle at 50% 50%, rgba(39,39,42,0.42), transparent 48%), repeating-linear-gradient(135deg, rgba(63,63,70,0.22) 0 2px, transparent 2px 7px)",
    };
  }
  return undefined;
}

function CombatMeter({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: string;
  pct: number;
  tone: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-zinc-900">
        <div
          className={`h-full transition-[width] ease-out ${tone}`}
          style={{
            width: `${pct}%`,
            transitionDuration: `${GRID_DUNGEON_COMBAT_PLAYBACK_MS}ms`,
          }}
        />
      </div>
    </div>
  );
}

type CombatParty = NonNullable<
  NonNullable<GridDungeonPublicRun["lastCombat"]>["party"]
>;
type CombatPartyMember = CombatParty[number];
type PartyMemberMetric = "damageDealt" | "healingDone" | "damageTaken";

function topPartyMember(
  party: CombatParty | undefined,
  metric: PartyMemberMetric,
) {
  if (!party || party.length === 0) return null;
  return [...party].sort((a, b) => b[metric] - a[metric])[0] ?? null;
}

function PartyRoleBadge({ member }: { member: CombatPartyMember }) {
  const formationLabel = member.formation === "front" ? "전열" : "후열";
  if (member.role === "main") {
    return (
      <span className="text-[10px] text-zinc-500">본인 · {formationLabel}</span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[10px] text-zinc-500">{formationLabel}</span>
      <SupportRolePill role={member.supportRole} />
    </span>
  );
}

function PartyHighlight({
  label,
  member,
  value,
}: {
  label: string;
  member: CombatPartyMember | null;
  value: number;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/70 p-2">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate font-semibold text-zinc-200">
          {member ? member.name : "-"}
        </div>
        <div className="shrink-0 text-[11px] font-medium text-zinc-100">
          {value.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function PartyMetricChart({
  party,
  metric,
  label,
  tone,
}: {
  party: CombatParty | undefined;
  metric: PartyMemberMetric;
  label: string;
  tone: string;
}) {
  if (!party || party.length === 0) return null;
  const maxValue = Math.max(1, ...party.map((member) => member[metric]));
  return (
    <div className="space-y-1.5 rounded border border-zinc-800 bg-zinc-950/70 p-2">
      <div className="text-[10px] font-semibold text-zinc-400">{label}</div>
      {party.map((member) => {
        const value = member[metric];
        const pct =
          value > 0 ? Math.max(4, Math.min(100, (value / maxValue) * 100)) : 0;
        return (
          <div
            key={member.id}
            className="grid grid-cols-[76px_1fr_56px] items-center gap-2 text-[11px]"
          >
            <div className="min-w-0 truncate text-zinc-300">{member.name}</div>
            <div className="h-2 overflow-hidden rounded bg-zinc-900">
              <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-right font-medium text-zinc-200">
              {value.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type CombatLogKind = keyof typeof COMBAT_LOG_TONE;

function classifyCombatLogLine(line: string, enemyName: string): CombatLogKind {
  if (line.includes("HP +")) return "heal";
  if (line.startsWith(`${enemyName}이(가) `)) return "hit";
  if (line.includes(" 피해")) return "attack";
  return "etc";
}

function combatLogLabel(kind: CombatLogKind): string {
  if (kind === "heal") return "회복";
  if (kind === "hit") return "피격";
  if (kind === "attack") return "공격";
  return "기타";
}

function CombatLogList({
  lines,
  enemyName,
  isPlaying,
  summaryLine,
}: {
  lines: string[];
  enemyName: string;
  isPlaying: boolean;
  summaryLine: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleLines = lines.slice(-8);
  if (visibleLines.length === 0) return null;
  const headline = isPlaying ? "전투 진행 중..." : summaryLine;
  const headlineKind = classifyCombatLogLine(headline, enemyName);
  return (
    <div className="space-y-1.5 border-t border-zinc-800 pt-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-zinc-300">전투 로그</div>
        {visibleLines.length > 1 && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
          >
            {expanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
            상세
          </button>
        )}
      </div>
      <div className="grid grid-cols-[42px_1fr] items-center gap-2 rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 text-center text-[10px] ${COMBAT_LOG_TONE[headlineKind]}`}
        >
          {isPlaying ? "진행" : combatLogLabel(headlineKind)}
        </span>
        <span className="min-w-0 truncate text-zinc-300">{headline}</span>
      </div>
      {expanded && (
        <div className="space-y-1">
          {visibleLines.map((line, idx) => {
            const kind = classifyCombatLogLine(line, enemyName);
            return (
              <div
                key={`${idx}:${line}`}
                className="grid grid-cols-[42px_1fr] items-center gap-2"
              >
                <span
                  className={`rounded border px-1.5 py-0.5 text-center text-[10px] ${COMBAT_LOG_TONE[kind]}`}
                >
                  {combatLogLabel(kind)}
                </span>
                <span className="min-w-0 truncate text-zinc-400">{line}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function combatSummaryKey(combat: NonNullable<GridDungeonPublicRun["lastCombat"]>) {
  return [
    combat.enemyName,
    combat.turns,
    combat.hpLost,
    combat.playerHpBefore,
    combat.playerHpAfter,
    combat.enemyHp,
    combat.enemyMaxHp,
    combat.log.join("\n"),
  ].join("|");
}

function combatSummaryLine(
  combat: NonNullable<GridDungeonPublicRun["lastCombat"]>,
): string {
  const hpPart =
    combat.hpLost > 0
      ? `내 HP ${combat.hpLost.toLocaleString()} 감소`
      : "피해 없이 돌파";
  const rewardPart =
    combat.rewardGold > 0
      ? ` · ${combat.rewardGold.toLocaleString()}G 확보`
      : "";
  return combat.outcome === "win"
    ? `${combat.enemyName} 전투 승리 · ${hpPart}${rewardPart}`
    : `${combat.enemyName} 전투 패배 · 탐험 불가`;
}

function CombatPlaybackBadge({ isPlaying }: { isPlaying: boolean }) {
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
        isPlaying
          ? "border-yellow-600/60 bg-yellow-950/40 text-yellow-200"
          : "border-emerald-700/60 bg-emerald-950/30 text-emerald-300"
      }`}
    >
      {isPlaying ? "전투 중" : "전투 종료"}
    </span>
  );
}

function SkillUseSummary({ uses }: { uses: Record<string, number> }) {
  const entries = Object.entries(uses)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko-KR"))
    .slice(0, 2);
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {entries.map(([name, count]) => (
        <span
          key={name}
          className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400"
        >
          {name} x{count}
        </span>
      ))}
    </div>
  );
}

function DungeonCombatSummary({
  combat,
  isPlaying,
}: {
  combat: NonNullable<GridDungeonPublicRun["lastCombat"]>;
  isPlaying: boolean;
}) {
  const displayedPlayerHp = isPlaying
    ? combat.playerHpBefore
    : combat.playerHpAfter;
  const displayedEnemyHp = isPlaying ? combat.enemyMaxHp : combat.enemyHp;
  const hpPct =
    combat.playerMaxHp > 0
      ? Math.max(0, Math.min(100, (displayedPlayerHp / combat.playerMaxHp) * 100))
      : 0;
  const enemyPct =
    combat.enemyMaxHp > 0
      ? Math.max(0, Math.min(100, (displayedEnemyHp / combat.enemyMaxHp) * 100))
      : 0;
  const topDamage = topPartyMember(combat.party, "damageDealt");
  const topHealing = topPartyMember(combat.party, "healingDone");
  const topTaken = topPartyMember(combat.party, "damageTaken");
  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-black/25 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 font-semibold text-zinc-200">
          {combat.enemyName}
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <CombatPlaybackBadge isPlaying={isPlaying} />
          <span>{combat.turns}턴</span>
          <span>내 HP -{combat.hpLost.toLocaleString()}</span>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <CombatMeter
          label="내 HP"
          value={`${displayedPlayerHp.toLocaleString()} / ${combat.playerMaxHp.toLocaleString()}`}
          pct={hpPct}
          tone="bg-emerald-400"
        />
        <CombatMeter
          label="적 HP"
          value={`${displayedEnemyHp.toLocaleString()} / ${combat.enemyMaxHp.toLocaleString()}`}
          pct={enemyPct}
          tone="bg-red-400"
        />
      </div>
      {combat.party && combat.party.length > 0 && (
        <div className="space-y-2 border-t border-zinc-800 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-zinc-300">
              파티 기여도
            </div>
            <div className="text-[10px] text-zinc-500">피해 · 회복 · 피격</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <PartyHighlight
              label="최고 피해"
              member={topDamage}
              value={topDamage?.damageDealt ?? 0}
            />
            <PartyHighlight
              label="최고 회복"
              member={topHealing}
              value={topHealing?.healingDone ?? 0}
            />
            <PartyHighlight
              label="최다 피격"
              member={topTaken}
              value={topTaken?.damageTaken ?? 0}
            />
          </div>
          <div className="grid gap-2">
            <PartyMetricChart
              party={combat.party}
              metric="damageDealt"
              label="피해량"
              tone="bg-red-400"
            />
            <PartyMetricChart
              party={combat.party}
              metric="healingDone"
              label="회복량"
              tone="bg-emerald-400"
            />
            <PartyMetricChart
              party={combat.party}
              metric="damageTaken"
              label="피격량"
              tone="bg-sky-400"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {combat.party.map((member) => {
              const displayedMemberHp = isPlaying
                ? (member.hpBefore ?? member.maxHp)
                : member.hpAfter;
              const memberPct =
                member.maxHp > 0
                  ? Math.max(0, Math.min(100, (displayedMemberHp / member.maxHp) * 100))
                  : 0;
              return (
                <div
                  key={member.id}
                  className="rounded border border-zinc-800 bg-zinc-950/70 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate font-semibold text-zinc-200">
                      {member.name}
                    </div>
                    <PartyRoleBadge member={member} />
                  </div>
                  <CombatMeter
                    label="HP"
                    value={`${displayedMemberHp.toLocaleString()} / ${member.maxHp.toLocaleString()}`}
                    pct={memberPct}
                    tone={member.role === "main" ? "bg-emerald-400" : "bg-cyan-400"}
                  />
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-zinc-500">
                    <div>
                      피해{" "}
                      <span className="text-zinc-300">
                        {member.damageDealt.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      피격{" "}
                      <span className="text-zinc-300">
                        {member.damageTaken.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      회복{" "}
                      <span className="text-zinc-300">
                        {member.healingDone.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <SkillUseSummary uses={member.skillUses} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      <CombatLogList
        lines={combat.log}
        enemyName={combat.enemyName}
        isPlaying={isPlaying}
        summaryLine={combatSummaryLine(combat)}
      />
    </div>
  );
}

export function V2GridDungeonView({
  onBackToMap,
  onRefreshGameState,
}: {
  onBackToMap: () => void;
  onRefreshGameState: () => void | Promise<void>;
}) {
  const [state, setState] = useState<GridDungeonState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] =
    useState<GridDungeonRouteId>("balanced");
  const [selectedSupporterIds, setSelectedSupporterIds] = useState<string[]>([]);
  const [supportRoleFilter, setSupportRoleFilter] =
    useState<SupportRoleFilter>("all");
  const [selectedFrontlineId, setSelectedFrontlineId] = useState("main");
  const [combatPlaybackKey, setCombatPlaybackKey] = useState<string | null>(null);
  const [combatPlaybackActive, setCombatPlaybackActive] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/v2/grid-dungeon", { cache: "no-store" });
    const json = (await res.json()) as GridDungeonState;
    if (!res.ok || !json.ok) {
      setError(json.error ?? "던전 상태를 불러오지 못했습니다.");
      return;
    }
    setState(json);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    if (!combatPlaybackActive) return;
    const timer = window.setTimeout(
      () => setCombatPlaybackActive(false),
      GRID_DUNGEON_COMBAT_PLAYBACK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [combatPlaybackActive, combatPlaybackKey]);

  const postAction = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/v2/grid-dungeon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as GridDungeonState;
        if (!res.ok || !json.ok) {
          setError(ERROR_LABEL[json.error ?? ""] ?? json.error ?? "던전 요청에 실패했습니다.");
          return;
        }
        setState(json);
        if (body.action === "move" && json.run?.lastCombat) {
          setCombatPlaybackKey(combatSummaryKey(json.run.lastCombat));
          setCombatPlaybackActive(true);
        }
        if (body.action === "claim") await onRefreshGameState();
      } finally {
        setBusy(false);
      }
    },
    [onRefreshGameState],
  );

  const run = state?.run ?? null;
  const currentCombatKey = run?.lastCombat
    ? combatSummaryKey(run.lastCombat)
    : null;
  const combatPlaybackPlaying =
    combatPlaybackActive &&
    currentCombatKey != null &&
    currentCombatKey === combatPlaybackKey;
  const interactionLocked = busy || combatPlaybackPlaying;
  const displayedRunHp =
    combatPlaybackPlaying && run?.lastCombat
      ? run.lastCombat.playerHpBefore
      : (run?.hp ?? 0);
  const activeRoute = GRID_DUNGEON_ROUTES[run?.routeId ?? selectedRoute];
  const rewardQuota = state?.rewardQuota;
  const history = state?.history ?? [];
  const supportCandidates = useMemo(
    () => state?.supportCandidates ?? [],
    [state?.supportCandidates],
  );
  const validSelectedSupporterIds = useMemo(() => {
    const valid = new Set(
      supportCandidates
        .filter((candidate) => candidate.supportRemaining > 0)
        .map((candidate) => candidate.userId),
    );
    return selectedSupporterIds.filter((id) => valid.has(id)).slice(0, 2);
  }, [selectedSupporterIds, supportCandidates]);
  const selectedSupporters = useMemo(
    () =>
      supportCandidates.filter((candidate) =>
        validSelectedSupporterIds.includes(candidate.userId),
      ),
    [supportCandidates, validSelectedSupporterIds],
  );
  const effectiveFrontlineId =
    selectedFrontlineId === "main" ||
    validSelectedSupporterIds.includes(selectedFrontlineId)
      ? selectedFrontlineId
      : "main";
  const selectedRoles = selectedSupporters
    .map((supporter) => supporter.supportRole)
    .filter((role): role is GridDungeonSupportRole => role != null);
  const partyWarning =
    selectedSupporters.length === 0
      ? null
      : selectedSupporters.length < 2
        ? "보스전은 지원자 2명을 권장합니다."
        : !selectedRoles.includes("dps") || !selectedRoles.includes("healer")
          ? "보스전은 공격 역할 1명과 회복 역할 1명 조합을 권장합니다."
          : null;
  const revealed = useMemo(() => new Set(run?.revealed ?? []), [run?.revealed]);
  const visited = useMemo(() => new Set(run?.visited ?? []), [run?.visited]);
  const clearedEvents = useMemo(
    () => new Set(run?.clearedEvents ?? []),
    [run?.clearedEvents],
  );
  const movePreviews = useMemo(() => {
    if (!run || run.status !== "active") return new Map<GridDungeonMoveDir, ReturnType<typeof gridDungeonMovePreview>>();
    return new Map(
      DIR_BUTTONS.map(({ dir }) => [dir, gridDungeonMovePreview(run, dir)]),
    );
  }, [run]);

  const toggleSupporter = useCallback((userId: string) => {
    setSelectedSupporterIds((prev) => {
      if (prev.includes(userId)) {
        setSelectedFrontlineId((current) => (current === userId ? "main" : current));
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId].slice(-2);
    });
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 text-zinc-200">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-zinc-100">
            {GRID_DUNGEON_ENTRANCE.name}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {activeRoute.name} · 지도 ({GRID_DUNGEON_ENTRANCE.col},{" "}
            {GRID_DUNGEON_ENTRANCE.row}) 입구에서 진입하는 격자 탐험 던전
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToMap}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
        >
          지도로
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {!state ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
          불러오는 중...
        </div>
      ) : !run || run.status === "claimed" || run.status === "failed" ? (
        <>
          <section className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/70 p-4">
            <div>
              <div className="text-sm font-semibold text-zinc-100">
                입구 상태
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {state.atEntrance
                  ? "입구 앞에 서 있습니다. 바로 탐험을 시작할 수 있습니다."
                  : "지도에서 입구 칸으로 이동해야 탐험을 시작할 수 있습니다."}
              </div>
            </div>
            <RewardQuotaNotice quota={rewardQuota} />
            <RouteSelector
              selected={selectedRoute}
              disabled={!state.atEntrance || busy}
              onSelect={setSelectedRoute}
            />
            <MySupportRolePanel
              role={state.mySupportRole ?? null}
              daily={state.mySupportDaily}
              busy={busy}
              onSetRole={(role) =>
                postAction({ action: "support-profile", role })
              }
            />
            <GuildSupportSelector
              candidates={supportCandidates}
              selectedIds={validSelectedSupporterIds}
              frontlineId={effectiveFrontlineId}
              filter={supportRoleFilter}
              busy={busy}
              onFilterChange={setSupportRoleFilter}
              onToggle={toggleSupporter}
              onFrontlineChange={setSelectedFrontlineId}
            />
            {partyWarning && (
              <div className="rounded-md border border-yellow-800/70 bg-yellow-950/35 px-3 py-2 text-xs text-yellow-200">
                {partyWarning}
              </div>
            )}
            <button
              type="button"
              disabled={!state.atEntrance || busy}
              onClick={() =>
                postAction({
                  action: "start",
                  routeId: selectedRoute,
                  supporterIds: validSelectedSupporterIds,
                  frontlineId: effectiveFrontlineId,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DoorOpen size={16} weight="fill" />
              탐험 시작
            </button>
          </section>
          <DungeonHistory entries={history} />
        </>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="text-zinc-500">체력</div>
              <div className="mt-1 text-base font-bold text-emerald-300">
                {displayedRunHp.toLocaleString()} / {run.maxHp.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="text-zinc-500">확보 골드</div>
              <div className="mt-1 text-base font-bold text-yellow-300">
                {run.pendingGold.toLocaleString()}G
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="text-zinc-500">상태</div>
              <div className="mt-1 text-base font-bold text-zinc-100">
                {run.status === "cleared" ? "정산 가능" : "탐험 중"}
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="text-zinc-500">경로</div>
              <div className="mt-1 text-base font-bold text-violet-200">
                {activeRoute.shortName}
              </div>
            </div>
          </section>

          <RewardQuotaNotice
            quota={rewardQuota}
            pendingDrops={run.pendingDrops as Record<string, number> | undefined}
          />

          <section className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="flex flex-wrap gap-1.5 text-[10px] text-zinc-400">
              {[
                "monster",
                "elite",
                "treasure",
                "trap",
                "relic",
                "fountain",
                "boss",
                "exit",
              ].map((kind) => {
                const k = kind as GridDungeonTileKind;
                return (
                  <span
                    key={kind}
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${TILE_TONE[k].cell}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${TILE_TONE[k].visited}`}
                    />
                    {TILE_LABEL[k]}
                  </span>
                );
              })}
            </div>
            <div className="grid aspect-square w-full grid-cols-5 grid-rows-5 gap-1 rounded bg-black/40 p-1 ring-1 ring-zinc-900">
              {run.layout.flatMap((row, y) =>
                row.map((kind, x) => {
                  const key = gridDungeonKey(x, y);
                  const isCurrent = run.pos.x === x && run.pos.y === y;
                  const isRevealed = revealed.has(key);
                  const isVisited = visited.has(key);
                  const isEventTile = EVENT_TILE_KINDS.has(kind);
                  const isClearedEvent =
                    isRevealed && isEventTile && clearedEvents.has(key);
                  const isPendingEvent =
                    isRevealed && isEventTile && !clearedEvents.has(key);
                  return (
                    <div
                      key={key}
                      title={
                        isRevealed
                          ? `${TILE_LABEL[kind]}${
                              isClearedEvent
                                ? " · 처리 완료"
                                : isPendingEvent
                                  ? " · 미처리"
                                  : ""
                            }`
                          : "미탐험"
                      }
                      className={tileClassName({
                        kind,
                        isCurrent,
                        isRevealed,
                        isClearedEvent,
                        isPendingEvent,
                      })}
                      style={tileBackgroundStyle(isRevealed, isCurrent)}
                    >
                      {!isRevealed && (
                        <span className="absolute inset-0 bg-gradient-to-b from-zinc-900/20 via-transparent to-black/60" />
                      )}
                      {isCurrent ? (
                        <>
                          <span className="absolute inset-1 rounded border border-emerald-300/45" />
                          <span className="h-3.5 w-3.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.75)]" />
                        </>
                      ) : (
                        <span className={TILE_TONE[kind].icon}>
                          {tileIcon(kind, isRevealed)}
                        </span>
                      )}
                      {isRevealed && !isCurrent && kind !== "empty" && kind !== "wall" && (
                        <span className="absolute bottom-1 left-1 right-1 truncate text-center text-[9px] leading-none opacity-80">
                          {TILE_LABEL[kind]}
                        </span>
                      )}
                      {isVisited && !isCurrent && (
                        <span
                          className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${TILE_TONE[kind].visited}`}
                        />
                      )}
                      {isClearedEvent && !isCurrent && (
                        <span className="absolute left-1 top-1 rounded border border-zinc-700 bg-zinc-950/80 px-1 text-[8px] leading-3 text-zinc-300">
                          완료
                        </span>
                      )}
                      {isPendingEvent && !isCurrent && (
                        <span className="absolute left-1 top-1 rounded border border-yellow-700/80 bg-yellow-950/80 px-1 text-[8px] leading-3 text-yellow-200">
                          미처리
                        </span>
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="text-sm text-zinc-200">{run.lastMessage}</div>
            {run.lastCombat && (
              <DungeonCombatSummary
                key={combatSummaryKey(run.lastCombat)}
                combat={run.lastCombat}
                isPlaying={combatPlaybackPlaying}
              />
            )}
            <DropSummary
              drops={run.pendingDrops as Record<string, number> | undefined}
              emptyLabel="확보한 재료가 아직 없습니다."
            />
            {run.status === "cleared" ? (
              <button
                type="button"
                disabled={interactionLocked}
                onClick={() => postAction({ action: "claim" })}
                className="rounded-md bg-yellow-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-yellow-400 disabled:opacity-40"
              >
                {run.pendingGold.toLocaleString()}G 정산
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DIR_BUTTONS.map(({ dir, label, Icon }) => {
                  const preview = movePreviews.get(dir);
                  const available = preview?.available === true;
                  const destination = available
                    ? TILE_LABEL[preview.tile]
                    : preview?.reason === "wall"
                      ? "벽"
                      : "끝";
                  const stateLabel = available
                    ? combatPlaybackPlaying
                      ? "전투 중"
                      : preview.cleared
                      ? "완료"
                      : preview.tile === "exit" && !run.bossDefeated
                        ? "봉인"
                        : "가능"
                    : preview?.reason === "wall"
                      ? "막힘"
                      : "범위 밖";
                  return (
                    <button
                      key={dir}
                      type="button"
                      disabled={interactionLocked || !available}
                      onClick={() => postAction({ action: "move", dir })}
                      title={`${label} · ${destination} · ${stateLabel}`}
                      className={`flex min-h-14 items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs transition disabled:cursor-not-allowed ${
                        available
                          ? "border-emerald-700/80 bg-emerald-950/35 text-emerald-100 hover:bg-emerald-900/50"
                          : "border-zinc-800 bg-zinc-950/70 text-zinc-600"
                      }`}
                    >
                      <Icon size={15} weight="bold" />
                      <span className="min-w-0 text-left leading-tight">
                        <span className="block font-semibold">{label}</span>
                        <span className="block truncate text-[10px] opacity-75">
                          {destination} · {stateLabel}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
