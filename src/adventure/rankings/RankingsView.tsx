"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, UsersThree } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import {
  useGuildRankings,
  useRankings,
  type GuildRankingEntry,
  type GuildRankingMe,
  type RankingMetric,
  type RankingEntry,
  type RankingMe,
} from "./useRankings";

const TABS: { key: RankingMetric; label: string }[] = [
  { key: "level", label: "총 숙련도" },
  { key: "battleCount", label: "전투 횟수" },
  { key: "fishingScore", label: "낚시 점수" },
  { key: "guild", label: "길드 랭킹" },
];

const GRADE_COLOR: Record<string, string> = {
  G: "text-zinc-500 dark:text-zinc-400",
  F: "text-zinc-600 dark:text-zinc-300",
  E: "text-emerald-600 dark:text-emerald-400",
  D: "text-sky-600 dark:text-sky-400",
  C: "text-blue-600 dark:text-blue-400",
  B: "text-violet-600 dark:text-violet-400",
  A: "text-amber-600 dark:text-amber-400",
  S: "text-rose-600 dark:text-rose-400",
};

export function RankingsView() {
  const router = useRouter();
  const [metric, setMetric] = useState<RankingMetric>("level");
  return (
    <div className="space-y-3">
      <Card as="section" padding="sm">
        <TabBar
          tabs={TABS}
          active={metric}
          onChange={(k) => setMetric(k)}
          ariaLabel="랭킹 지표"
          scrollable
        />
      </Card>

      {metric === "level" && <LevelMetricPill />}
      {metric === "fishingScore" && <FishingMetricPill />}

      {metric === "guild" ? (
        <GuildRankingsBody />
      ) : (
        <UserRankingsBody
          metric={metric}
          onSelectName={(n) => router.push(`/profile/${encodeURIComponent(n)}`)}
        />
      )}
    </div>
  );
}

function LevelMetricPill() {
  return (
    <Card as="section" padding="sm">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-medium text-violet-700 dark:text-violet-300">
          총 숙련도
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          환생·전직으로 리셋되지 않는 직업 숙련도 합계 순으로 매깁니다.
        </span>
      </div>
    </Card>
  );
}

function FishingMetricPill() {
  return (
    <Card as="section" padding="sm">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 font-medium text-sky-700 dark:text-sky-300">
          낚시 점수
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          어종 등급별 누적 어획과 개인 최대어 보너스를 합산합니다.
        </span>
      </div>
    </Card>
  );
}

function UserRankingsBody({
  metric,
  onSelectName,
}: {
  metric: Exclude<RankingMetric, "guild">;
  onSelectName: (name: string) => void;
}) {
  const { list, me, loading, error } = useRankings(metric);
  const meInList = !!me && !!list?.some((e) => e.mine);
  const pager = usePagination(list ?? [], 10);

  return (
    <>
      {error && (
        <Card as="section" padding="md">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </Card>
      )}

      {loading && list === null ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={i}
              className="rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60"
            >
              <Skeleton rows={2} />
            </li>
          ))}
        </ul>
      ) : !list || list.length === 0 ? (
        <EmptyState
          icon={<Trophy size={40} weight="duotone" />}
          title="아직 등록된 모험가가 없습니다"
          message="닉네임을 가진 모험가가 자동으로 명부에 오릅니다."
        />
      ) : (
        <>
          <Card as="section" padding="none">
            <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {pager.pageItems.map((e) => (
                <RankingRow
                  key={`${e.rank}-${e.name}`}
                  entry={e}
                  metric={metric}
                  onSelectName={onSelectName}
                />
              ))}
            </ol>
          </Card>
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
          />
        </>
      )}

      {me && !meInList && (
        <Card as="section" padding="none">
          <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            내 순위
          </div>
          <div className="border-t border-zinc-200 dark:border-zinc-800">
            <RankingRow
              entry={{ ...me, mine: true }}
              metric={metric}
              onSelectName={onSelectName}
            />
          </div>
        </Card>
      )}
    </>
  );
}

function GuildRankingsBody() {
  const { list, me, loading, error } = useGuildRankings(true);
  const meInList = !!me && !!list?.some((e) => e.mine);
  const pager = usePagination(list ?? [], 10);

  return (
    <>
      {error && (
        <Card as="section" padding="md">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </Card>
      )}

      {loading && list === null ? (
        <ul className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={i}
              className="rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60"
            >
              <Skeleton rows={2} />
            </li>
          ))}
        </ul>
      ) : !list || list.length === 0 ? (
        <EmptyState
          icon={<UsersThree size={40} weight="duotone" />}
          title="아직 등록된 길드가 없습니다"
          message="새 길드를 만들거나 기존 길드에 가입해 보세요."
        />
      ) : (
        <>
          <Card as="section" padding="none">
            <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {pager.pageItems.map((e) => (
                <GuildRankingRow key={`${e.rank}-${e.name}`} entry={e} />
              ))}
            </ol>
          </Card>
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
          />
        </>
      )}

      {me && !meInList && (
        <Card as="section" padding="none">
          <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            내 길드
          </div>
          <div className="border-t border-zinc-200 dark:border-zinc-800">
            <GuildRankingRow entry={{ ...me, mine: true }} />
          </div>
        </Card>
      )}
    </>
  );
}

function RankingRow({
  entry,
  metric,
  onSelectName,
}: {
  entry: RankingEntry | (RankingMe & { mine: true });
  metric: Exclude<RankingMetric, "guild">;
  onSelectName: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectName(entry.name)}
      className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
        entry.mine ? "bg-emerald-50 dark:bg-emerald-950/40" : ""
      }`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <RankBadge rank={entry.rank} />
        <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {entry.name}
          {entry.mine && (
            <span className="ml-1 text-[10px] font-normal text-emerald-700 dark:text-emerald-400">
              (나)
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
        {metric === "level" ? (
          <>숙련도 {entry.cumLevel.toLocaleString()}</>
        ) : metric === "fishingScore" ? (
          <>낚시 {entry.fishingScore.toLocaleString()}점</>
        ) : (
          <>전투 {entry.battleCount.toLocaleString()}</>
        )}
      </span>
    </button>
  );
}

function GuildRankingRow({
  entry,
}: {
  entry: GuildRankingEntry | (GuildRankingMe & { mine: true });
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 ${
        entry.mine ? "bg-emerald-50 dark:bg-emerald-950/40" : ""
      }`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <RankBadge rank={entry.rank} />
        <span className="min-w-0 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {entry.name}
          <span
            className={`ml-1.5 text-[11px] font-bold ${GRADE_COLOR[entry.grade] ?? ""}`}
          >
            [{entry.grade}]
          </span>
          {entry.mine && (
            <span className="ml-1 text-[10px] font-normal text-emerald-700 dark:text-emerald-400">
              (내 길드)
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
        <span>명성 {entry.fameTotal.toLocaleString()}</span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {entry.memberCount}명
        </span>
      </span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colorCls =
    rank === 1
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      : rank === 2
        ? "bg-zinc-400/15 text-zinc-600 dark:text-zinc-300"
        : rank === 3
          ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
          : "bg-zinc-200/40 text-zinc-500 dark:bg-zinc-800/40 dark:text-zinc-400";
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${colorCls}`}
    >
      {rank}
    </span>
  );
}
