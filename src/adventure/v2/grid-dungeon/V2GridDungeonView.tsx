"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crown,
  DoorOpen,
  FirstAidKit,
  Skull,
  Sparkle,
  TreasureChest,
  UsersThree,
} from "@phosphor-icons/react";
import {
  GRID_DUNGEON_DEFINITION,
  GRID_DUNGEON_ENTRANCE,
  GRID_DUNGEON_REWARD_PREVIEW,
  GRID_DUNGEON_SUPPORT_ROLES,
  GRID_DUNGEON_SUPPORT_ROLE_LABEL,
  gridDungeonKey,
  type GridDungeonMoveDir,
  type GridDungeonPublicRun,
  type GridDungeonSupportRole,
  type GridDungeonTileKind,
} from "@/adventure/data/v2/gridDungeon";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";

type GridDungeonState = {
  ok: boolean;
  entrance: typeof GRID_DUNGEON_ENTRANCE;
  atEntrance: boolean;
  rewardQuota: {
    dayKey: string;
    limit: number;
    claimed: number;
    remaining: number;
  };
  history: {
    entries: Array<{
      id: string;
      outcome: "cleared" | "failed" | "abandoned";
      at: number;
      rewardGold: number;
      drops?: Record<string, number>;
      exploredTiles: number;
      hp: number;
      message: string;
    }>;
  };
  mySupportRole: GridDungeonSupportRole | null;
  mySupportDaily: {
    dayKey: string;
    used: number;
    useLimit: number;
    rewarded: number;
    rewardLimit: number;
    honorPerReward: number;
  };
  supportCandidates: Array<{
    userId: string;
    name: string;
    level: number;
    job: string;
    supportLimit: number;
    supportRemaining: number;
    supportRole: GridDungeonSupportRole | null;
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

const HISTORY_OUTCOME_LABEL: Record<
  GridDungeonState["history"]["entries"][number]["outcome"],
  string
> = {
  cleared: "클리어",
  failed: "실패",
  abandoned: "포기",
};

const HISTORY_OUTCOME_CLASS: Record<
  GridDungeonState["history"]["entries"][number]["outcome"],
  string
> = {
  cleared: "border-emerald-800 bg-emerald-950/50 text-emerald-300",
  failed: "border-red-900 bg-red-950/50 text-red-300",
  abandoned: "border-zinc-700 bg-zinc-900 text-zinc-300",
};

const SUPPORT_ROLE_TONE: Record<GridDungeonSupportRole, string> = {
  dealer: "border-red-800 bg-red-950/45 text-red-200",
  healer: "border-emerald-800 bg-emerald-950/45 text-emerald-200",
  tank: "border-sky-800 bg-sky-950/45 text-sky-200",
  support: "border-violet-800 bg-violet-950/45 text-violet-200",
};

type SupportRoleFilter = GridDungeonSupportRole | "all" | "unset";

const SUPPORT_ROLE_FILTERS: SupportRoleFilter[] = [
  "all",
  ...GRID_DUNGEON_SUPPORT_ROLES,
  "unset",
];

const COMBAT_LOG_TONE = {
  attack: "border-red-900/70 bg-red-950/35 text-red-200",
  heal: "border-emerald-800/70 bg-emerald-950/35 text-emerald-200",
  hit: "border-sky-900/70 bg-sky-950/35 text-sky-200",
  etc: "border-zinc-800 bg-zinc-950 text-zinc-400",
} as const;

function tileIcon(kind: GridDungeonTileKind, visible: boolean) {
  if (!visible) return null;
  if (kind === "treasure") return <TreasureChest size={20} weight="fill" />;
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
}: {
  kind: GridDungeonTileKind;
  isCurrent: boolean;
  isRevealed: boolean;
}) {
  const base =
    "relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded border text-[10px] transition";
  if (isCurrent) {
    return `${base} border-emerald-300 bg-emerald-900/75 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.45),0_0_24px_rgba(16,185,129,0.28)]`;
  }
  if (!isRevealed) {
    return `${base} border-zinc-950 bg-black text-zinc-700`;
  }
  return `${base} ${TILE_TONE[kind].cell}`;
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

function formatHistoryTime(at: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
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
  const [selectedSupporterIds, setSelectedSupporterIds] = useState<string[]>([]);
  const [supportRoleFilter, setSupportRoleFilter] =
    useState<SupportRoleFilter>("all");
  const [selectedFrontlineId, setSelectedFrontlineId] = useState("main");

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
          setError(json.error ?? "던전 요청에 실패했습니다.");
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
  const supportCandidates = useMemo(
    () => state?.supportCandidates ?? [],
    [state?.supportCandidates],
  );
  const mySupportRole = state?.mySupportRole ?? null;
  const mySupportDaily = state?.mySupportDaily ?? null;
  const rewardQuota = state?.rewardQuota ?? null;
  const hasRewardClaim = (rewardQuota?.remaining ?? 0) > 0;
  const pendingDropCount = useMemo(
    () =>
      dropEntries(run?.pendingDrops).reduce(
        (sum, [, amount]) => sum + (amount ?? 0),
        0,
      ),
    [run?.pendingDrops],
  );
  const runCanClaimMaterialReward =
    !!run && run.status === "cleared" && hasRewardClaim;
  const claimableDropCount =
    runCanClaimMaterialReward ? pendingDropCount : 0;
  const history = state?.history.entries ?? [];
  const revealed = useMemo(() => new Set(run?.revealed ?? []), [run?.revealed]);
  const visited = useMemo(() => new Set(run?.visited ?? []), [run?.visited]);
  const mapStats = useMemo(() => (run ? gridDungeonMapStats(run) : null), [run]);
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
    [validSelectedSupporterIds, supportCandidates],
  );
  const effectiveFrontlineId =
    selectedFrontlineId === "main" ||
    validSelectedSupporterIds.includes(selectedFrontlineId)
      ? selectedFrontlineId
      : "main";
  const supportRoleCounts = useMemo(() => {
    const counts: Record<SupportRoleFilter, number> = {
      all: supportCandidates.length,
      dealer: 0,
      healer: 0,
      tank: 0,
      support: 0,
      unset: 0,
    };
    for (const candidate of supportCandidates) {
      if (candidate.supportRole) {
        counts[candidate.supportRole] += 1;
      } else {
        counts.unset += 1;
      }
    }
    return counts;
  }, [supportCandidates]);
  const displayedSupportCandidates = useMemo(
    () =>
      supportCandidates.filter((candidate) => {
        if (supportRoleFilter === "all") return true;
        if (supportRoleFilter === "unset") return candidate.supportRole == null;
        return candidate.supportRole === supportRoleFilter;
      }),
    [supportCandidates, supportRoleFilter],
  );
  const selectedRoles = useMemo(
    () =>
      selectedSupporters
        .map((supporter) => supporter.supportRole)
        .filter((role): role is GridDungeonSupportRole => role != null),
    [selectedSupporters],
  );
  const selectedFrontlineName =
    effectiveFrontlineId === "main"
      ? "나"
      : selectedSupporters.find(
          (supporter) => supporter.userId === effectiveFrontlineId,
        )?.name ?? "나";
  const supportRewardHonor = mySupportDaily?.honorPerReward ?? 5;
  const partyWarning =
    selectedSupporters.length === 0
      ? null
      : selectedSupporters.length < 2
      ? "보스전은 지원자 2명을 권장합니다."
      : !selectedRoles.includes("dealer") || !selectedRoles.includes("healer")
        ? "첫 보스는 공격형 1명 + 회복형 1명 조합을 권장합니다."
        : null;

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
            {GRID_DUNGEON_DEFINITION.name}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            지도 ({GRID_DUNGEON_DEFINITION.entrance.col},{" "}
            {GRID_DUNGEON_DEFINITION.entrance.row}) 입구에서 진입하는 격자 탐험
            던전
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
              {rewardQuota && (
                <div className="mt-1 text-xs text-yellow-300/80">
                  오늘 보상 {rewardQuota.remaining} / {rewardQuota.limit}회 남음
                </div>
              )}
            </div>
            <RewardStatusNotice
              rewardQuota={rewardQuota}
              pendingDropCount={0}
              mode="entrance"
            />
            <RewardPreview />
            <button
              type="button"
              disabled={!state.atEntrance || busy}
              onClick={() =>
                postAction({
                  action: "start",
                  supporterIds: validSelectedSupporterIds,
                  frontlineId: effectiveFrontlineId,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DoorOpen size={16} weight="fill" />
              탐험 시작
            </button>
            {partyWarning && (
              <div className="rounded-md border border-yellow-800/70 bg-yellow-950/35 px-3 py-2 text-xs text-yellow-200">
                {partyWarning}
              </div>
            )}
            <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-zinc-200">
                  내 지원 카드
                </div>
                <div className="text-[11px] text-zinc-500">
                  {mySupportRole
                    ? GRID_DUNGEON_SUPPORT_ROLE_LABEL[mySupportRole]
                    : "미설정"}
                </div>
              </div>
              <div className="text-[11px] leading-relaxed text-zinc-500">
                다른 길드원이 나를 데려갈 때 보이는 역할입니다. 실제 전투는 현재 장착
                스킬과 전투 패턴 스냅샷을 사용합니다.
              </div>
              {mySupportDaily && (
                <div className="grid grid-cols-3 gap-2">
                  <SupportDailyStat
                    label="오늘 지원됨"
                    value={`${mySupportDaily.used} / ${mySupportDaily.useLimit}`}
                  />
                  <SupportDailyStat
                    label="보상 수령"
                    value={`${mySupportDaily.rewarded} / ${mySupportDaily.rewardLimit}`}
                  />
                  <SupportDailyStat
                    label="명예 보상"
                    value={`+${mySupportDaily.honorPerReward}`}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRID_DUNGEON_SUPPORT_ROLES.map((role) => {
                  const selected = mySupportRole === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        postAction({ action: "support-profile", role })
                      }
                      className={`rounded-md border px-2.5 py-2 text-xs font-semibold transition disabled:opacity-40 ${
                        selected
                          ? SUPPORT_ROLE_TONE[role]
                          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-900"
                      }`}
                    >
                      {GRID_DUNGEON_SUPPORT_ROLE_LABEL[role]}
                    </button>
                  );
                })}
              </div>
              {mySupportRole && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    postAction({ action: "support-profile", role: null })
                  }
                  className="text-left text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline disabled:opacity-40"
                >
                  역할 해제
                </button>
              )}
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3 text-xs">
              <div className="font-semibold text-zinc-200">권장 구성</div>
              <div className="mt-1 text-zinc-500">
                보스 권장: 지원자 {GRID_DUNGEON_DEFINITION.recommendedSupporters}명 ·{" "}
                {GRID_DUNGEON_DEFINITION.recommendedRoles
                  .map((role) => GRID_DUNGEON_SUPPORT_ROLE_LABEL[role])
                  .join(" + ")}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-600">
                솔로, 회복형만, 방어형+회복형 조합은 보스전이 어려울 수 있습니다.
              </div>
            </div>
            {supportCandidates.length > 0 && (
              <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                    <UsersThree size={16} weight="fill" />
                    길드 동료
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {selectedSupporters.length} / 2
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SUPPORT_ROLE_FILTERS.map((filter) => {
                    const label =
                      filter === "all"
                        ? "전체"
                        : filter === "unset"
                          ? "미설정"
                          : GRID_DUNGEON_SUPPORT_ROLE_LABEL[filter];
                    const selected = supportRoleFilter === filter;
                    return (
                      <button
                        key={filter}
                        type="button"
                        disabled={busy}
                        onClick={() => setSupportRoleFilter(filter)}
                        className={`rounded border px-2 py-1 text-[10px] transition disabled:opacity-40 ${
                          selected
                            ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                            : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900"
                        }`}
                      >
                        {label} {supportRoleCounts[filter]}
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-2 rounded-md border border-zinc-800 bg-black/20 p-2 text-[11px] sm:grid-cols-3">
                  <div>
                    <div className="text-zinc-500">선택 동료</div>
                    <div className="mt-0.5 font-semibold text-zinc-200">
                      {selectedSupporters.length} / 2명
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500">전열</div>
                    <div className="mt-0.5 font-semibold text-amber-200">
                      {selectedFrontlineName}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500">동료 보상</div>
                    <div className="mt-0.5 font-semibold text-yellow-200">
                      클리어 시 명예 +{supportRewardHonor}
                    </div>
                  </div>
                  {selectedRoles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 sm:col-span-3">
                      {selectedRoles.map((role, idx) => (
                        <span
                          key={`${role}:${idx}`}
                          className={`rounded border px-1.5 py-0.5 ${SUPPORT_ROLE_TONE[role]}`}
                        >
                          {GRID_DUNGEON_SUPPORT_ROLE_LABEL[role]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {selectedSupporters.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold text-zinc-500">
                      전열 지정
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setSelectedFrontlineId("main")}
                        className={`rounded border px-1.5 py-0.5 transition disabled:opacity-40 ${
                          effectiveFrontlineId === "main"
                            ? "border-amber-700 bg-amber-950/45 text-amber-200"
                            : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900"
                        }`}
                      >
                        나 · 전열
                      </button>
                      {selectedSupporters.map((supporter) => (
                        <button
                          key={supporter.userId}
                          type="button"
                          disabled={busy}
                          onClick={() => setSelectedFrontlineId(supporter.userId)}
                          className={`rounded border px-1.5 py-0.5 transition disabled:opacity-40 ${
                            effectiveFrontlineId === supporter.userId
                              ? "border-amber-700 bg-amber-950/45 text-amber-200"
                              : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:bg-zinc-900"
                          }`}
                        >
                          {supporter.name} · 전열
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      {selectedSupporters.map((supporter) => (
                        <span
                          key={supporter.userId}
                          className={`rounded border px-1.5 py-0.5 ${
                            supporter.supportRole
                              ? SUPPORT_ROLE_TONE[supporter.supportRole]
                              : "border-zinc-800 bg-zinc-950 text-zinc-500"
                          }`}
                        >
                          {supporter.name} ·{" "}
                          {effectiveFrontlineId === supporter.userId
                            ? "전열"
                            : "후열"}{" "}
                          ·{" "}
                          {supporter.supportRole
                            ? GRID_DUNGEON_SUPPORT_ROLE_LABEL[
                                supporter.supportRole
                              ]
                            : "역할 미설정"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {displayedSupportCandidates.map((candidate) => {
                    const selected = validSelectedSupporterIds.includes(
                      candidate.userId,
                    );
                    const exhausted = candidate.supportRemaining <= 0;
                    return (
                      <button
                        key={candidate.userId}
                        type="button"
                        disabled={busy || (exhausted && !selected)}
                        onClick={() => toggleSupporter(candidate.userId)}
                        className={`rounded-md border px-3 py-2 text-left text-xs transition disabled:opacity-40 ${
                          selected
                            ? "border-emerald-500 bg-emerald-950/60 text-emerald-100"
                            : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900"
                        }`}
                      >
                        <div className="font-semibold">{candidate.name}</div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">
                          Lv.{candidate.level.toLocaleString()} · {candidate.job}
                        </div>
                        <div className="mt-1">
                          {candidate.supportRole ? (
                            <span
                              className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${SUPPORT_ROLE_TONE[candidate.supportRole]}`}
                            >
                              {
                                GRID_DUNGEON_SUPPORT_ROLE_LABEL[
                                  candidate.supportRole
                                ]
                              }
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-600">
                              역할 미설정
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          지원 가능 {candidate.supportRemaining} /{" "}
                          {candidate.supportLimit}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {displayedSupportCandidates.length === 0 && (
                  <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
                    이 필터에 해당하는 길드 동료가 없습니다.
                  </div>
                )}
              </div>
            )}
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
              <div className="text-zinc-500">확보 재료</div>
              <div className="mt-1 text-base font-bold text-yellow-300">
                {pendingDropCount.toLocaleString()}개
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="text-zinc-500">상태</div>
              <div className="mt-1 text-base font-bold text-zinc-100">
                {run.status === "cleared" ? "정산 가능" : "탐험 중"}
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="text-zinc-500">오늘 보상</div>
              <div
                className={`mt-1 text-base font-bold ${
                  hasRewardClaim ? "text-yellow-300" : "text-zinc-500"
                }`}
              >
                {rewardQuota ? `${rewardQuota.remaining} / ${rewardQuota.limit}` : "-"}
              </div>
            </div>
          </section>
          <RewardStatusNotice
            rewardQuota={rewardQuota}
            pendingDropCount={claimableDropCount}
            mode={run.status === "cleared" ? "claim" : "run"}
          />

          <section className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
            {mapStats && <MapExplorationStats stats={mapStats} />}
            <div className="flex flex-wrap gap-1.5 text-[10px] text-zinc-400">
              {[
                "monster",
                "elite",
                "treasure",
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
                  return (
                    <div
                      key={key}
                      title={isRevealed ? TILE_LABEL[kind] : "미탐험"}
                      className={tileClassName({ kind, isCurrent, isRevealed })}
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
                    </div>
                  );
                }),
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="text-sm text-zinc-200">{run.lastMessage}</div>
            {run.lastCombat && <DungeonCombatSummary combat={run.lastCombat} />}
            {run.supporters.length > 0 && (
              <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
                <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <UsersThree size={15} weight="fill" />
                  동행 길드원
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {run.supporters.map((supporter) => (
                    <div
                      key={supporter.userId}
                      className="rounded border border-zinc-800 bg-black/20 px-2.5 py-2 text-xs"
                    >
                      <div className="font-semibold text-zinc-100">
                        {supporter.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        Lv.{supporter.level.toLocaleString()} · {supporter.job}
                      </div>
                      <div className="mt-1">
                        {supporter.supportRole ? (
                          <span
                            className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${SUPPORT_ROLE_TONE[supporter.supportRole]}`}
                          >
                            {GRID_DUNGEON_SUPPORT_ROLE_LABEL[supporter.supportRole]}
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-600">
                            역할 미설정
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[10px] text-amber-300/80">
                        {run.frontlineId === supporter.userId ? "전열" : "후열"}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-400">
                        HP {supporter.maxHp.toLocaleString()} · ATK{" "}
                        {supporter.atk.toLocaleString()} · SPD{" "}
                        {supporter.spd.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DropSummary
              drops={run.pendingDrops ?? {}}
              emptyLabel="아직 확보한 재료가 없습니다."
            />
            {run.status === "cleared" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => postAction({ action: "claim" })}
                className={`rounded-md px-3 py-2 text-xs font-bold disabled:opacity-40 ${
                  hasRewardClaim
                    ? "bg-yellow-500 text-zinc-950 hover:bg-yellow-400"
                    : "border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {hasRewardClaim
                  ? pendingDropCount > 0
                    ? `재료 ${pendingDropCount.toLocaleString()}개 정산`
                    : "보상 가능 정산"
                  : "보상 없이 정산"}
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {DIR_BUTTONS.map(({ dir, label, Icon }) => (
                  <button
                    key={dir}
                    type="button"
                    disabled={busy}
                    onClick={() => postAction({ action: "move", dir })}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-zinc-700 px-2 py-2 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                  >
                    <Icon size={15} weight="bold" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </section>

          <DungeonHistory entries={history} />
        </>
      )}
    </main>
  );
}

function RewardPreview() {
  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-zinc-200">주요 보상</div>
        <div className="text-[10px] text-zinc-500">
          일 {GRID_DUNGEON_DEFINITION.dailyRewardLimit}회 재료 정산
        </div>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {GRID_DUNGEON_REWARD_PREVIEW.map((reward) => (
          <div
            key={reward.id}
            className="rounded border border-yellow-900/50 bg-yellow-950/20 px-2.5 py-2 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-semibold text-yellow-100">
                {V2_MATERIALS[reward.id]?.name ?? reward.id}
              </span>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${
                  reward.rarity === "희귀"
                    ? "border-fuchsia-800 bg-fuchsia-950/45 text-fuchsia-200"
                    : "border-zinc-700 bg-zinc-900 text-zinc-300"
                }`}
              >
                {reward.rarity}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">{reward.source}</div>
          </div>
        ))}
      </div>
    </div>
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

type GridDungeonMapStats = {
  explored: number;
  traversable: number;
  percent: number;
  bossDiscovered: boolean;
  exitDiscovered: boolean;
};

function gridDungeonMapStats(run: GridDungeonPublicRun): GridDungeonMapStats {
  const visitedKeys = new Set(run.visited);
  const revealedKeys = new Set(run.revealed);
  let traversable = 0;
  let bossKey = "";
  let exitKey = "";
  for (let y = 0; y < run.layout.length; y += 1) {
    const row = run.layout[y] ?? [];
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      if (tile !== "wall") traversable += 1;
      if (tile === "boss") bossKey = gridDungeonKey(x, y);
      if (tile === "exit") exitKey = gridDungeonKey(x, y);
    }
  }
  const explored = [...visitedKeys].filter((key) => {
    const [xRaw, yRaw] = key.split(",");
    const x = Number(xRaw);
    const y = Number(yRaw);
    return run.layout[y]?.[x] !== "wall";
  }).length;
  return {
    explored,
    traversable,
    percent: traversable > 0 ? Math.round((explored / traversable) * 100) : 0,
    bossDiscovered: !!bossKey && revealedKeys.has(bossKey),
    exitDiscovered: !!exitKey && revealedKeys.has(exitKey),
  };
}

function MapExplorationStats({ stats }: { stats: GridDungeonMapStats }) {
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-3">
      <div className="rounded border border-zinc-800 bg-black/20 px-2.5 py-2">
        <div className="text-zinc-500">탐험률</div>
        <div className="mt-0.5 font-semibold text-zinc-100">
          {stats.percent}% · {stats.explored} / {stats.traversable}칸
        </div>
      </div>
      <div className="rounded border border-zinc-800 bg-black/20 px-2.5 py-2">
        <div className="text-zinc-500">보스</div>
        <div
          className={`mt-0.5 font-semibold ${
            stats.bossDiscovered ? "text-rose-200" : "text-zinc-500"
          }`}
        >
          {stats.bossDiscovered ? "발견" : "미발견"}
        </div>
      </div>
      <div className="rounded border border-zinc-800 bg-black/20 px-2.5 py-2">
        <div className="text-zinc-500">출구</div>
        <div
          className={`mt-0.5 font-semibold ${
            stats.exitDiscovered ? "text-indigo-200" : "text-zinc-500"
          }`}
        >
          {stats.exitDiscovered ? "발견" : "미발견"}
        </div>
      </div>
    </div>
  );
}

function RewardStatusNotice({
  rewardQuota,
  pendingDropCount,
  mode,
}: {
  rewardQuota: GridDungeonState["rewardQuota"] | null;
  pendingDropCount: number;
  mode: "entrance" | "run" | "claim";
}) {
  if (!rewardQuota) return null;
  const canReward = rewardQuota.remaining > 0;
  const title =
    mode === "claim"
      ? canReward
        ? "정산 시 재료 보상 지급"
        : "정산 시 재료 보상 없음"
      : canReward
        ? "이번 탐험 보상 가능"
        : "이번 탐험 보상 없음";
  const detail =
    mode === "claim"
      ? canReward
        ? `확보한 재료 ${pendingDropCount.toLocaleString()}개를 정산합니다.`
        : "오늘 보상 횟수를 모두 사용해 확보 재료가 지급되지 않습니다."
      : canReward
        ? `오늘 재료 보상 ${rewardQuota.remaining} / ${rewardQuota.limit}회 남음`
        : "탐험은 가능하지만 오늘 재료 보상은 더 받을 수 없습니다.";
  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${
        canReward
          ? "border-yellow-800/70 bg-yellow-950/35 text-yellow-200"
          : "border-zinc-800 bg-zinc-950/70 text-zinc-400"
      }`}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-[11px] opacity-80">{detail}</div>
    </div>
  );
}

function DungeonCombatSummary({
  combat,
}: {
  combat: NonNullable<GridDungeonPublicRun["lastCombat"]>;
}) {
  const hpPct =
    combat.playerMaxHp > 0
      ? Math.max(0, Math.min(100, (combat.playerHpAfter / combat.playerMaxHp) * 100))
      : 0;
  const enemyPct =
    combat.enemyMaxHp > 0
      ? Math.max(0, Math.min(100, (combat.enemyHp / combat.enemyMaxHp) * 100))
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
          <span>{combat.turns}턴</span>
          <span>던전 HP -{combat.hpLost}</span>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <CombatMeter
          label="내 HP"
          value={`${combat.playerHpAfter.toLocaleString()} / ${combat.playerMaxHp.toLocaleString()}`}
          pct={hpPct}
          tone="bg-emerald-400"
        />
        <CombatMeter
          label="적 HP"
          value={`${combat.enemyHp.toLocaleString()} / ${combat.enemyMaxHp.toLocaleString()}`}
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
              const memberPct =
                member.maxHp > 0
                  ? Math.max(0, Math.min(100, (member.hpAfter / member.maxHp) * 100))
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
                    value={`${member.hpAfter.toLocaleString()} / ${member.maxHp.toLocaleString()}`}
                    pct={memberPct}
                    tone={member.role === "main" ? "bg-emerald-400" : "bg-cyan-400"}
                  />
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-zinc-500">
                    <div>
                      피해량{" "}
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
      {combat.log.length > 0 && (
        <CombatLogList lines={combat.log} enemyName={combat.enemyName} />
      )}
    </div>
  );
}

type PartyMemberMetric = "damageDealt" | "healingDone" | "damageTaken";
type CombatParty = NonNullable<
  NonNullable<GridDungeonPublicRun["lastCombat"]>["party"]
>;
type CombatPartyMember = CombatParty[number];

function topPartyMember(
  party: CombatParty | undefined,
  metric: PartyMemberMetric,
) {
  if (!party || party.length === 0) return null;
  return [...party].sort((a, b) => b[metric] - a[metric])[0] ?? null;
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
      {member && (
        <div className="mt-1">
          <PartyRoleBadge member={member} />
        </div>
      )}
    </div>
  );
}

function PartyRoleBadge({
  member,
}: {
  member: CombatPartyMember;
}) {
  const formationLabel = member.formation === "front" ? "전열" : "후열";
  if (member.role === "main") {
    return (
      <span className="text-[10px] text-zinc-500">
        본인 · {formationLabel}
      </span>
    );
  }
  if (!member.supportRole) {
    return (
      <span className="text-[10px] text-zinc-600">
        {formationLabel} · 역할 미설정
      </span>
    );
  }
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${SUPPORT_ROLE_TONE[member.supportRole]}`}
    >
      {formationLabel} · {GRID_DUNGEON_SUPPORT_ROLE_LABEL[member.supportRole]}
    </span>
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
        const pct = value > 0 ? Math.max(4, Math.min(100, (value / maxValue) * 100)) : 0;
        return (
          <div key={member.id} className="grid grid-cols-[86px_1fr_64px] items-center gap-2 text-[11px]">
            <div className="min-w-0">
              <div className="truncate text-zinc-300">{member.name}</div>
              <div className="mt-0.5">
                <PartyRoleBadge member={member} />
              </div>
            </div>
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
}: {
  lines: string[];
  enemyName: string;
}) {
  const visibleLines = lines.slice(-8);
  return (
    <div className="space-y-1.5 border-t border-zinc-800 pt-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-zinc-300">전투 로그</div>
        {lines.length > visibleLines.length && (
          <div className="text-[10px] text-zinc-500">
            최근 {visibleLines.length}줄
          </div>
        )}
      </div>
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
    </div>
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

function dropEntries(drops: Partial<Record<string, number>> | undefined) {
  return Object.entries(drops ?? {})
    .filter(([, amount]) => (amount ?? 0) > 0)
    .sort(([a], [b]) => a.localeCompare(b));
}

function DropSummary({
  drops,
  emptyLabel,
}: {
  drops: Partial<Record<string, number>> | undefined;
  emptyLabel?: string;
}) {
  const entries = dropEntries(drops);
  if (entries.length === 0) {
    if (!emptyLabel) return null;
    return (
      <div className="rounded-md border border-zinc-800 bg-black/20 px-3 py-2 text-xs text-zinc-500">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {entries.map(([id, amount]) => (
        <span
          key={id}
          className="rounded border border-yellow-800/70 bg-yellow-950/35 px-2 py-1 text-yellow-200"
        >
          {(V2_MATERIALS[id]?.name ?? id)} x{amount}
        </span>
      ))}
    </div>
  );
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
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DungeonHistory({
  entries,
}: {
  entries: GridDungeonState["history"]["entries"];
}) {
  if (entries.length === 0) {
    return (
      <section className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
        <div className="text-xs font-semibold text-zinc-300">최근 탐험 기록</div>
        <div className="mt-1 text-xs text-zinc-500">아직 기록이 없습니다.</div>
      </section>
    );
  }
  return (
    <section className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="text-xs font-semibold text-zinc-300">최근 탐험 기록</div>
      <div className="space-y-1.5">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${HISTORY_OUTCOME_CLASS[entry.outcome]}`}
              >
                {HISTORY_OUTCOME_LABEL[entry.outcome]}
              </span>
              <span className="min-w-0 truncate text-zinc-300">
                {formatHistoryTime(entry.at)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-zinc-500">
              <span>탐험 {entry.exploredTiles}칸</span>
              <span>HP {entry.hp}</span>
            </div>
            {dropEntries(entry.drops).length > 0 && (
              <div className="basis-full">
                <DropSummary drops={entry.drops} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
