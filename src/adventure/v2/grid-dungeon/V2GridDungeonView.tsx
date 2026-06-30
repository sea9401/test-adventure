"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crown,
  Diamond,
  DoorOpen,
  FirstAidKit,
  Skull,
  Sparkle,
  TreasureChest,
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

const ERROR_LABEL: Record<string, string> = {
  blocked: "막힌 방향입니다. 다른 통로를 선택하세요.",
  bad_direction: "이동 방향이 올바르지 않습니다.",
  no_run: "진행 중인 탐험이 없습니다.",
  not_active: "진행 중인 탐험에서만 이동할 수 있습니다.",
  not_cleared: "출구에 도착한 뒤 정산할 수 있습니다.",
  not_at_entrance: "지도에서 던전 입구 칸으로 이동해야 시작할 수 있습니다.",
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
        if (body.action === "claim") await onRefreshGameState();
      } finally {
        setBusy(false);
      }
    },
    [onRefreshGameState],
  );

  const run = state?.run ?? null;
  const activeRoute = GRID_DUNGEON_ROUTES[run?.routeId ?? selectedRoute];
  const rewardQuota = state?.rewardQuota;
  const history = state?.history ?? [];
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
            <button
              type="button"
              disabled={!state.atEntrance || busy}
              onClick={() =>
                postAction({ action: "start", routeId: selectedRoute })
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
                {run.hp} / 10
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
            <DropSummary
              drops={run.pendingDrops as Record<string, number> | undefined}
              emptyLabel="확보한 재료가 아직 없습니다."
            />
            {run.status === "cleared" ? (
              <button
                type="button"
                disabled={busy}
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
                    ? preview.cleared
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
                      disabled={busy || !available}
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
