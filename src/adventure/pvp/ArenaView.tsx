"use client";

import { useState } from "react";
import {
  ChartLineUp,
  ClockCountdown,
  ClockCounterClockwise,
  Sword,
  Trophy,
  WarningCircle,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { TabBar } from "@/components/ui/TabBar";
import { BattleLogList } from "@/adventure/battle/BattleLogList";
import { useGame } from "@/adventure/GameContext";
import { StancePicker } from "@/adventure/character/StancePicker";
import { useArena, useMatchLog, type ChallengeResponse } from "./useArena";
import { StatsView } from "./StatsView";
import { tierFor, tierProgress } from "./tiers";

type ArenaTab = "leaderboard" | "recent" | "stats";

const TABS = [
  {
    key: "leaderboard" as const,
    label: "순위",
    icon: <Trophy size={14} weight="duotone" />,
  },
  {
    key: "recent" as const,
    label: "전투기록",
    icon: <ClockCounterClockwise size={14} weight="duotone" />,
  },
  {
    key: "stats" as const,
    label: "통계",
    icon: <ChartLineUp size={14} weight="duotone" />,
  },
];

const SEASON_END_FMT = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "numeric",
});

export function ArenaView() {
  const {
    status,
    loading,
    error,
    challenge,
    challenging,
    challengeError,
    lastResult,
    clearLastResult,
    onCooldown,
    cooldownSecondsLeft,
  } = useArena();
  const [activeTab, setActiveTab] = useState<ArenaTab>("leaderboard");
  const { characterStateHook } = useGame();

  if (loading && !status) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-12" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<WarningCircle size={32} weight="duotone" className="text-rose-500" />}
        title="아레나를 불러오지 못했습니다"
        message={error}
      />
    );
  }

  if (!status) return null;

  const disabled = challenging || onCooldown;
  const buttonLabel = challenging
    ? "전투 중…"
    : onCooldown
      ? `${cooldownSecondsLeft}초 후 재도전`
      : "도전하기";

  return (
    <div className="space-y-3">
      <SeasonHeader season={status.season} />
      <MeCard
        rating={status.me.rating}
        wins={status.me.wins}
        losses={status.me.losses}
        draws={status.me.draws}
        coins={status.me.coins}
      />

      <StancePicker
        value={characterStateHook.state.selectedStance ?? null}
        onChange={characterStateHook.setStance}
      />

      <button
        type="button"
        disabled={disabled}
        onClick={() => challenge()}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-rose-700 bg-rose-600 px-3 py-3 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {onCooldown ? (
          <ClockCountdown size={18} weight="duotone" />
        ) : (
          <Sword size={18} weight="duotone" />
        )}
        {buttonLabel}
      </button>

      {challengeError && (
        <p className="text-center text-xs text-rose-600 dark:text-rose-400">
          {challengeError}
        </p>
      )}

      {lastResult && (
        <LastResultBanner result={lastResult} onClose={clearLastResult} />
      )}

      <TabBar
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="아레나 보기"
      />
      {activeTab === "leaderboard" && <Leaderboard top={status.top} />}
      {activeTab === "recent" && <RecentMatches recent={status.recent} />}
      {activeTab === "stats" && <StatsView />}
    </div>
  );
}

function SeasonHeader({
  season,
}: {
  season: { id: string; endAt: string };
}) {
  const end = new Date(season.endAt);
  return (
    <Card as="section" padding="sm">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          시즌 {season.id}
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          종료 {SEASON_END_FMT.format(end)}
        </span>
      </div>
    </Card>
  );
}

function MeCard({
  rating,
  wins,
  losses,
  draws,
  coins,
}: {
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  coins: number;
}) {
  const tier = tierFor(rating);
  const progress = tierProgress(rating);
  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : null;
  return (
    <Card as="section" padding="md">
      <div className="flex items-baseline justify-between">
        <span className={`text-lg font-semibold ${tier.color}`}>
          {tier.name}
        </span>
        <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {rating}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>{tier.threshold}</span>
        <span>
          {tier.nextThreshold === null ? "최상위" : tier.nextThreshold}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
        <span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {wins}승
          </span>{" "}
          <span className="text-zinc-400">/</span>{" "}
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            {losses}패
          </span>
          {draws > 0 && (
            <>
              {" "}
              <span className="text-zinc-400">/</span>{" "}
              <span className="font-semibold text-zinc-500">{draws}무</span>
            </>
          )}
        </span>
        {winRate !== null && (
          <span className="text-zinc-500 dark:text-zinc-400">
            승률 {winRate}%
          </span>
        )}
        <span className="ml-auto font-semibold text-amber-600 dark:text-amber-400">
          투기장 코인 {coins.toLocaleString()}
        </span>
      </div>
    </Card>
  );
}

function LastResultBanner({
  result,
  onClose,
}: {
  result: ChallengeResponse;
  onClose: () => void;
}) {
  const myDelta = result.me.ratingAfter - result.me.ratingBefore;
  const myOutcome: "win" | "loss" | "draw" =
    result.outcome === "draw"
      ? "draw"
      : result.outcome === "a_win"
        ? "win"
        : "loss";
  const tone =
    myOutcome === "win"
      ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700"
      : myOutcome === "loss"
        ? "border-rose-600 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-700"
        : "border-zinc-500 bg-zinc-50 dark:bg-zinc-900/40 dark:border-zinc-600";
  const label =
    myOutcome === "win" ? "승리" : myOutcome === "loss" ? "패배" : "무승부";
  return (
    <div className={`rounded-md border p-3 text-sm ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">
          {label} — vs {result.opponent.name}
          {result.opponent.isBot && <BotBadge />}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          닫기
        </button>
      </div>
      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
        {result.me.ratingBefore} → {result.me.ratingAfter}
        <span
          className={
            myDelta > 0
              ? " text-emerald-600 dark:text-emerald-400"
              : myDelta < 0
                ? " text-rose-600 dark:text-rose-400"
                : " text-zinc-500"
          }
        >
          {" "}
          ({myDelta > 0 ? "+" : ""}
          {myDelta})
        </span>
        <span className="text-zinc-400"> · {result.turns}턴</span>
        {result.coinsAwarded > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {" · "}투기장 코인 +{result.coinsAwarded}
          </span>
        )}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
          전투 로그 보기
        </summary>
        <div className="mt-2 max-h-80 overflow-y-auto pr-1">
          <BattleLogList entries={result.log} compact />
        </div>
      </details>
    </div>
  );
}

function RecentMatches({
  recent,
}: {
  recent: ReturnType<typeof useArena>["status"] extends infer S
    ? S extends { recent: infer R }
      ? R
      : never
    : never;
}) {
  return (
    <Card as="section" padding="sm">
      {recent.length === 0 ? (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          아직 전투 기록이 없어요.
        </p>
      ) : (
        <ul className="space-y-1">
          {recent.map((m) => (
            <RecentMatchRow key={m.id} match={m} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentMatchRow({
  match: m,
}: {
  match: ReturnType<typeof useArena>["status"] extends infer S
    ? S extends { recent: (infer R)[] }
      ? R
      : never
    : never;
}) {
  // React 는 `<details>` 의 자식을 open 상태와 무관하게 항상 마운트한다 (브라우저는 CSS 로만 숨김).
  // 그대로 두면 페이지 진입 즉시 매치 20개를 다 fetch — lazy 의미 상실.
  // → 한 번이라도 열린 적 있을 때만 panel 마운트 (everOpened latch). 닫고 다시 열어도 fetch 결과 보존.
  const [everOpened, setEverOpened] = useState(false);
  return (
    <li>
      <details
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open) setEverOpened(true);
        }}
        className="group rounded"
      >
        <summary className="flex cursor-pointer items-center justify-between text-xs hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 rounded px-1 py-1">
          <span className="flex items-center gap-2">
            <OutcomeBadge outcome={m.myOutcome} />
            <span className="text-zinc-700 dark:text-zinc-200">
              {m.iAmAttacker ? "→" : "←"} {m.opponent.name}
              {m.opponent.isBot && <BotBadge />}
            </span>
          </span>
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
            {m.ratingBefore} → {m.ratingAfter}
            <DeltaText delta={m.ratingDelta} />
          </span>
        </summary>
        {everOpened && <MatchLogPanel matchId={m.id} />}
      </details>
    </li>
  );
}

// details 가 열렸을 때만 mount → 첫 mount 에서 한 번 fetch. 닫혔다 다시 열면 캐시된 상태 유지.
function MatchLogPanel({ matchId }: { matchId: number }) {
  const { log, loading, error } = useMatchLog(matchId);
  if (loading) {
    return (
      <div className="mt-1 px-1">
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="mt-1 px-1 text-[11px] text-rose-600 dark:text-rose-400">
        로그를 불러오지 못했습니다: {error}
      </p>
    );
  }
  if (!log) return null;
  return (
    <div className="mt-1 max-h-72 overflow-y-auto pr-1">
      <BattleLogList entries={log} compact />
    </div>
  );
}

function BotBadge() {
  // 인간 닉네임과 시각적으로 분리 — 봇 매치는 fallback 임을 명시.
  return (
    <span className="ml-1.5 rounded bg-zinc-200 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
      BOT
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: "win" | "loss" | "draw" }) {
  const cfg =
    outcome === "win"
      ? { label: "승", cls: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" }
      : outcome === "loss"
        ? { label: "패", cls: "bg-rose-500/20 text-rose-700 dark:text-rose-400" }
        : { label: "무", cls: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-300" };
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

function DeltaText({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const cls =
    delta > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  return (
    <span className={` ${cls}`}>
      {" "}
      ({delta > 0 ? "+" : ""}
      {delta})
    </span>
  );
}

function Leaderboard({
  top,
}: {
  top: ReturnType<typeof useArena>["status"] extends infer S
    ? S extends { top: infer T }
      ? T
      : never
    : never;
}) {
  return (
    <Card as="section" padding="sm">
      {top.length === 0 ? (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          아직 참여한 사람이 없어요. 첫 도전을 해 보세요.
        </p>
      ) : (
        <ol className="space-y-1">
          {top.map((row) => {
            const tier = tierFor(row.rating);
            return (
              <li
                key={row.userId}
                className={`flex items-center justify-between rounded px-1.5 py-1 text-xs ${
                  row.mine
                    ? "bg-amber-500/10 font-medium text-amber-900 dark:text-amber-200"
                    : ""
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="w-6 shrink-0 text-right tabular-nums text-zinc-500">
                    {row.rank}
                  </span>
                  <span className="truncate text-zinc-800 dark:text-zinc-100">
                    {row.name}
                  </span>
                  <span className={`shrink-0 text-[10px] ${tier.color}`}>
                    {tier.name}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                  {row.rating}
                  <span className="ml-1 text-[10px] text-zinc-400">
                    {row.wins}-{row.losses}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
