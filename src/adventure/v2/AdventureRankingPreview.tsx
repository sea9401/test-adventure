"use client";

import Image from "next/image";
import Link from "next/link";
import { CaretLeft, CaretRight, Crown, Trophy } from "@phosphor-icons/react";
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
  { key: "battleCount", title: "전투 횟수" },
  { key: "fishingScore", title: "낚시 점수" },
];

const RANK_BADGE: Record<number, string> = {
  1: "bg-amber-400 text-amber-950 dark:bg-amber-500 dark:text-amber-950",
  2: "bg-zinc-300 text-zinc-700 dark:bg-zinc-600 dark:text-zinc-100",
  3: "bg-orange-300 text-orange-900 dark:bg-orange-700 dark:text-orange-100",
};

export function AdventureRankingPreview() {
  const [metricIndex, setMetricIndex] = useState(0);
  const metric = PREVIEW_METRICS[metricIndex];
  const { list, loading, error } = useRankings(metric.key);
  const topThree = list?.slice(0, 3) ?? [];

  const move = (delta: number) => {
    setMetricIndex(
      (current) =>
        (current + delta + PREVIEW_METRICS.length) % PREVIEW_METRICS.length,
    );
  };

  return (
    <Card as="section" padding="md" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Trophy
            size={18}
            weight="duotone"
            aria-hidden
            className="shrink-0 text-violet-600 dark:text-violet-400"
          />
          <h2 className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {metric.title} TOP 3
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="이전 랭킹"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <CaretLeft size={15} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="다음 랭킹"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <CaretRight size={15} weight="bold" aria-hidden />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className={`${SURFACE_INSET} space-y-3 p-3`}>
              <Skeleton className="h-10 w-10" />
              <Skeleton rows={2} />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : topThree.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          아직 표시할 랭킹 기록이 없습니다.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3 sm:items-end">
          {topThree.map((entry) => (
            <RankingPreviewCard key={entry.rank} entry={entry} metric={metric.key} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 justify-center gap-1.5" aria-label="랭킹 지표 선택">
          {PREVIEW_METRICS.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMetricIndex(index)}
              aria-label={`${item.title} 랭킹 보기`}
              aria-current={index === metricIndex ? "true" : undefined}
              className={`h-2 rounded-full transition-all ${
                index === metricIndex
                  ? "w-5 bg-violet-600 dark:bg-violet-400"
                  : "w-2 bg-zinc-300 hover:bg-zinc-400 dark:bg-zinc-700 dark:hover:bg-zinc-600"
              }`}
            />
          ))}
        </div>
        <Link
          href="/plaza/rankings"
          className="shrink-0 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
        >
          전체 보기
        </Link>
      </div>
    </Card>
  );
}

function RankingPreviewCard({
  entry,
  metric,
}: {
  entry: RankingEntry;
  metric: PreviewMetric;
}) {
  const desktopOrder =
    entry.rank === 1
      ? "sm:order-2 sm:-translate-y-2"
      : entry.rank === 2
        ? "sm:order-1"
        : "sm:order-3";

  return (
    <article
      className={`${SURFACE_INSET} ${desktopOrder} min-w-0 p-3 transition-transform ${
        entry.mine ? "ring-2 ring-emerald-500" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full ${
            RANK_BADGE[entry.rank] ?? RANK_BADGE[3]
          }`}
          aria-label={`${entry.rank}위`}
        >
          <Crown size={15} weight="fill" aria-hidden />
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
          {entry.rank}위
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <Image
          src={avatarImageSrc(entry.avatar)}
          alt={`${entry.name} 프로필`}
          width={40}
          height={40}
          sizes="40px"
          className="h-10 w-10 shrink-0 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
        />
        <div className="min-w-0">
          <PlayerNameLink
            name={entry.name}
            className="block truncate text-sm font-bold text-zinc-900 dark:text-zinc-100"
          />
          <div className="mt-0.5 truncate text-xs font-medium tabular-nums text-violet-600 dark:text-violet-400">
            {rankingValue(entry, metric)}
          </div>
        </div>
      </div>
    </article>
  );
}

function rankingValue(entry: RankingEntry, metric: PreviewMetric): string {
  if (metric === "level") return `숙련 ${entry.cumLevel.toLocaleString("ko-KR")}`;
  if (metric === "battleCount") {
    return `전투 ${entry.battleCount.toLocaleString("ko-KR")}회`;
  }
  return `낚시 ${entry.fishingScore.toLocaleString("ko-KR")}점`;
}
