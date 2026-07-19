"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, UsersThree } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { avatarImageSrc } from "@/adventure/profile/avatars";
import { GuildEmblemImage } from "@/adventure/v2/guild/GuildEmblemImage";
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
  { key: "combatPower", label: "전투력" },
  { key: "lifeMastery", label: "생활 숙련도" },
  { key: "codexCompletion", label: "도감 완성도" },
  { key: "masteryTower", label: "숙련의 탑" },
  { key: "guild", label: "길드 랭킹" },
];

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
      {metric === "lifeMastery" && <LifeMasteryMetricPill />}
      {metric === "codexCompletion" && <CodexMetricPill />}
      {metric === "masteryTower" && <MasteryTowerMetricPill />}

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

function LifeMasteryMetricPill() {
  return (
    <Card as="section" padding="sm">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
          생활 숙련도
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          농사·벌목·채광·낚시 레벨을 합산하며 각 생활은 Lv.50까지 반영합니다.
        </span>
      </div>
    </Card>
  );
}

function CodexMetricPill() {
  return (
    <Card as="section" padding="sm">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 font-medium text-sky-700 dark:text-sky-300">
          도감 완성도
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          직업 해금·장비 등록·어보 발견 수를 전체 수집 항목과 비교합니다.
        </span>
      </div>
    </Card>
  );
}

function MasteryTowerMetricPill() {
  return (
    <Card as="section" padding="sm">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
          숙련의 탑
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          매일 초기화되지 않는 역대 최고 도달 층을 기준으로 합니다.
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
              className="rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60"
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
          <div className="border-t border-zinc-200 dark:border-zinc-700">
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
              className="rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60"
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
          <div className="border-t border-zinc-200 dark:border-zinc-700">
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
        <Image
          src={avatarImageSrc(entry.avatar)}
          alt={`${entry.name} 프로필`}
          width={36}
          height={36}
          sizes="36px"
          className="h-9 w-9 shrink-0 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
        />
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
        ) : metric === "combatPower" ? (
          <>전투력 {entry.combatPower.toLocaleString()}</>
        ) : metric === "lifeMastery" ? (
          <>생활 Lv.{entry.lifeMastery.toLocaleString()}</>
        ) : metric === "codexCompletion" ? (
          <>
            도감 {codexCompletionPercent(entry.codexCollected, entry.codexTotal)}%
            <span className="ml-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              ({entry.codexCollected}/{entry.codexTotal})
            </span>
          </>
        ) : (
          <>최고 {entry.masteryTowerFloor.toLocaleString()}층</>
        )}
      </span>
    </button>
  );
}

function codexCompletionPercent(collected: number, total: number): string {
  if (total <= 0) return "0.0";
  return ((collected / total) * 100).toFixed(1);
}

function GuildRankingRow({
  entry,
}: {
  entry: GuildRankingEntry | (GuildRankingMe & { mine: true });
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 ${
        entry.mine ? "bg-emerald-50 dark:bg-emerald-950" : ""
      }`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <RankBadge rank={entry.rank} />
        <GuildEmblemImage
          emblem={entry.emblem}
          guildName={entry.name}
          className="h-9 w-9"
        />
        <span className="min-w-0 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {entry.name}
          <span className="ml-1.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
            Lv.{entry.level}
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
