"use client";

import Link from "next/link";
import { Crown, Trophy } from "@phosphor-icons/react";
import { useState } from "react";
import {
  useGuildRankings,
  useRankings,
  type GuildRankingEntry,
  type RankingEntry,
  type RankingMetric,
} from "@/adventure/rankings/useRankings";
import { GuildEmblemImage } from "@/adventure/v2/guild/GuildEmblemImage";
import { Card } from "@/components/ui/Card";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";

type UserPreviewMetric = Extract<
  RankingMetric,
  "combatPower" | "masteryTower" | "achievementScore"
>;
type PreviewMetric = UserPreviewMetric | "guild";
type PreviewEntry = RankingEntry | GuildRankingEntry;

const PREVIEW_METRICS: Array<{
  key: PreviewMetric;
  title: string;
}> = [
  { key: "combatPower", title: "전투력" },
  { key: "masteryTower", title: "숙련의 탑" },
  { key: "achievementScore", title: "업적" },
  { key: "guild", title: "길드" },
];

const RANK_TEXT: Record<number, string> = {
  2: "text-zinc-500 dark:text-zinc-300",
  3: "text-orange-600 dark:text-orange-400",
};

export function AdventureRankingPreview() {
  const [metricIndex, setMetricIndex] = useState(0);
  const metric = PREVIEW_METRICS[metricIndex];
  const userRankings = useRankings(metric.key);
  const guildRankings = useGuildRankings(metric.key === "guild");
  const list: PreviewEntry[] | null =
    metric.key === "guild" ? guildRankings.list : userRankings.list;
  const loading =
    metric.key === "guild" ? guildRankings.loading : userRankings.loading;
  const error = metric.key === "guild" ? guildRankings.error : userRankings.error;
  const topThree = list?.slice(0, 3) ?? [];

  return (
    <Card as="section" padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Trophy size={19} weight="duotone" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
              모험가 명예 기록
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              상위 3개의 기록
            </p>
          </div>
        </div>
        <Link
          href="/plaza/rankings"
          className="shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          전체 랭킹
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="랭킹 지표 선택"
        className="grid grid-cols-4 border-y border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950"
      >
        {PREVIEW_METRICS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            onClick={() => setMetricIndex(index)}
            aria-selected={index === metricIndex}
            className={`relative px-2 py-2.5 text-xs font-semibold transition ${
              index === metricIndex
                ? "bg-white text-violet-700 after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:rounded-full after:bg-violet-600 dark:bg-zinc-900 dark:text-violet-300 dark:after:bg-violet-400"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            {item.title}
          </button>
        ))}
      </div>

      <div className="p-4">
        {loading ? (
          <RankingPreviewSkeleton />
        ) : error ? (
          <p className="py-6 text-center text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : topThree.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            아직 표시할 랭킹 기록이 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {topThree[0] ? (
              <RankingLeader entry={topThree[0]} metric={metric.key} />
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {topThree.slice(1).map((entry) => (
                <RankingRow key={entry.rank} entry={entry} metric={metric.key} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function RankingLeader({
  entry,
  metric,
}: {
  entry: PreviewEntry;
  metric: PreviewMetric;
}) {
  return (
    <article
      className={`${SURFACE_INSET} flex min-w-0 items-center gap-3 p-4 ring-2 ring-inset ring-amber-500 dark:ring-amber-400 ${
        entry.mine
          ? "outline outline-2 outline-offset-2 outline-emerald-500"
          : ""
      }`}
    >
      <div className="relative shrink-0">
        {isGuildRankingEntry(entry) ? (
          <GuildEmblemImage
            emblem={entry.emblem}
            guildName={entry.name}
            className="h-16 w-16 border-2 border-amber-400 dark:border-amber-500"
          />
        ) : (
          <CosmeticAvatar
            avatar={entry.avatar}
            name={entry.name}
            profileBorder={entry.profileBorder}
            width={64}
            height={64}
            sizes="64px"
            className="h-16 w-16 rounded-2xl"
          />
        )}
        <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-sm dark:bg-amber-500">
          <Crown size={15} weight="fill" aria-hidden />
          <span className="sr-only">1위</span>
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10px] font-bold tracking-[0.16em] text-amber-700 dark:text-amber-300">
          {metric === "guild" ? "TOP GUILD" : "TOP ADVENTURER"}
        </div>
        <PreviewRankingName entry={entry} className="text-base" />
      </div>
      <div className={`${SURFACE_INSET} shrink-0 px-3 py-2 text-right`}>
        <div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
          1위 기록
        </div>
        <div className="mt-0.5 text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
          {rankingValue(entry, metric)}
        </div>
      </div>
    </article>
  );
}

function RankingRow({
  entry,
  metric,
}: {
  entry: PreviewEntry;
  metric: PreviewMetric;
}) {
  return (
    <article
      className={`${SURFACE_INSET} flex min-w-0 items-center gap-2.5 p-3 ${
        entry.mine ? "ring-2 ring-emerald-500" : ""
      }`}
    >
      <span
        className={`w-5 shrink-0 text-center text-lg font-black italic tabular-nums ${
          RANK_TEXT[entry.rank] ?? RANK_TEXT[2]
        }`}
        aria-label={`${entry.rank}위`}
      >
        {entry.rank}
      </span>
      {isGuildRankingEntry(entry) ? (
        <GuildEmblemImage
          emblem={entry.emblem}
          guildName={entry.name}
          className="h-11 w-11"
        />
      ) : (
        <CosmeticAvatar
          avatar={entry.avatar}
          name={entry.name}
          profileBorder={entry.profileBorder}
          width={44}
          height={44}
          sizes="44px"
          className="h-11 w-11 rounded-xl"
        />
      )}
      <div className="min-w-0 flex-1">
        <PreviewRankingName entry={entry} className="text-sm" />
        <div className="mt-0.5 truncate text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
          {rankingValue(entry, metric)}
        </div>
      </div>
    </article>
  );
}

function RankingPreviewSkeleton() {
  return (
    <div className="space-y-2">
      <div
        className={`${SURFACE_INSET} p-4 ring-2 ring-inset ring-amber-500 dark:ring-amber-400`}
      >
        <div className="flex items-center gap-3">
          <Skeleton className="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <Skeleton rows={2} />
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className={`${SURFACE_INSET} p-3`}>
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-11 w-11" />
              <div className="min-w-0 flex-1">
                <Skeleton rows={2} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewRankingName({
  entry,
  className,
}: {
  entry: PreviewEntry;
  className: string;
}) {
  const classes = `block truncate font-bold text-zinc-900 dark:text-zinc-100 ${className}`;
  return isGuildRankingEntry(entry) ? (
    <span className={classes}>{entry.name}</span>
  ) : (
    <PlayerNameLink name={entry.name} className={classes} />
  );
}

function isGuildRankingEntry(entry: PreviewEntry): entry is GuildRankingEntry {
  return "guildId" in entry;
}

function rankingValue(entry: PreviewEntry, metric: PreviewMetric): string {
  if (metric === "guild" && isGuildRankingEntry(entry)) {
    return `명성 ${entry.fameTotal.toLocaleString("ko-KR")}`;
  }
  if (isGuildRankingEntry(entry)) return "—";
  if (metric === "combatPower") {
    return `전투력 ${entry.combatPower.toLocaleString("ko-KR")}`;
  }
  if (metric === "masteryTower") {
    return `최고 ${entry.masteryTowerFloor.toLocaleString("ko-KR")}층`;
  }
  return `업적 ${entry.achievementScore.toLocaleString("ko-KR")}점`;
}
