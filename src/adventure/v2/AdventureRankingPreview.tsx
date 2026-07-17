"use client";

import Image from "next/image";
import Link from "next/link";
import { Crown, Trophy } from "@phosphor-icons/react";
import { useState } from "react";
import { avatarImageSrc } from "@/adventure/profile/avatars";
import {
  useRankings,
  type RankingEntry,
  type RankingMetric,
} from "@/adventure/rankings/useRankings";
import { Card } from "@/components/ui/Card";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_INSET } from "@/components/ui/surfaces";

type PreviewMetric = Exclude<RankingMetric, "guild">;

const PREVIEW_METRICS: Array<{
  key: PreviewMetric;
  title: string;
}> = [
  { key: "level", title: "총 숙련도" },
  { key: "combatPower", title: "전투력" },
  { key: "fishingScore", title: "낚시 점수" },
];

const RANK_TEXT: Record<number, string> = {
  2: "text-zinc-500 dark:text-zinc-300",
  3: "text-orange-600 dark:text-orange-400",
};

export function AdventureRankingPreview() {
  const [metricIndex, setMetricIndex] = useState(0);
  const metric = PREVIEW_METRICS[metricIndex];
  const { list, loading, error } = useRankings(metric.key);
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
              상위 3명의 기록
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
        className="grid grid-cols-3 border-y border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950"
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
  entry: RankingEntry;
  metric: PreviewMetric;
}) {
  return (
    <article
      className={`flex min-w-0 items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950 ${
        entry.mine ? "ring-2 ring-emerald-500" : ""
      }`}
    >
      <div className="relative shrink-0">
        <Image
          src={avatarImageSrc(entry.avatar)}
          alt={`${entry.name} 프로필`}
          width={56}
          height={56}
          sizes="56px"
          className="h-14 w-14 rounded-xl border-2 border-amber-400 object-cover dark:border-amber-500"
        />
        <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-sm dark:bg-amber-500">
          <Crown size={15} weight="fill" aria-hidden />
          <span className="sr-only">1위</span>
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10px] font-bold tracking-[0.16em] text-violet-600 dark:text-violet-300">
          TOP ADVENTURER
        </div>
        <PlayerNameLink
          name={entry.name}
          className="block truncate text-base font-bold text-zinc-900 dark:text-zinc-100"
        />
      </div>
      <div className="shrink-0 rounded-md border border-violet-200 bg-white px-3 py-2 text-right dark:border-violet-900 dark:bg-zinc-900">
        <div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
          1위 기록
        </div>
        <div className="mt-0.5 text-sm font-bold tabular-nums text-violet-700 dark:text-violet-300">
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
  entry: RankingEntry;
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
      <Image
        src={avatarImageSrc(entry.avatar)}
        alt={`${entry.name} 프로필`}
        width={38}
        height={38}
        sizes="38px"
        className="h-[38px] w-[38px] shrink-0 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
      />
      <div className="min-w-0 flex-1">
        <PlayerNameLink
          name={entry.name}
          className="block truncate text-sm font-bold text-zinc-900 dark:text-zinc-100"
        />
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
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950">
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14" />
          <div className="min-w-0 flex-1">
            <Skeleton rows={2} />
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className={`${SURFACE_INSET} p-3`}>
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-[38px] w-[38px]" />
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

function rankingValue(entry: RankingEntry, metric: PreviewMetric): string {
  if (metric === "level") return `숙련 ${entry.cumLevel.toLocaleString("ko-KR")}`;
  if (metric === "combatPower") {
    return `전투력 ${entry.combatPower.toLocaleString("ko-KR")}`;
  }
  return `낚시 ${entry.fishingScore.toLocaleString("ko-KR")}점`;
}
