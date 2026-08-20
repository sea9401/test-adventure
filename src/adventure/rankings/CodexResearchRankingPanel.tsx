"use client";

import { Flask, Trophy } from "@phosphor-icons/react";
import type { CodexResearchRankingRow } from "@/adventure/data/v2/codexResearchRanking";
import { chatNameClass } from "@/components/chat/ChatCosmetics";
import { Card } from "@/components/ui/Card";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import type { CodexResearchRankingLoadState } from "./useCodexResearchRanking";

const TIER_LABELS = {
  bronze: "동",
  silver: "은",
  gold: "금",
  platinum: "백금",
  diamond: "다이아",
  legendary: "전설",
} as const;

function format(value: number): string {
  return value.toLocaleString("ko-KR");
}

function StateCard({ title, message, onRetry }: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card as="section" padding="lg">
      <h2 className="font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          다시 시도
        </button>
      ) : null}
    </Card>
  );
}

function ResearchRow({ row, onSelectName }: {
  row: CodexResearchRankingRow;
  onSelectName: (name: string) => void;
}) {
  return (
    <li className={`${row.mine ? SURFACE_ACCENT : SURFACE_INSET} p-3`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${row.rank <= 3 ? "bg-violet-600 text-white" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"}`}>
            {row.rank}
          </span>
          <CosmeticAvatar
            avatar={row.avatar}
            name={row.name}
            profileBorder={row.profileBorder}
            width={44}
            height={44}
            sizes="44px"
            className="size-11 rounded-xl"
          />
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onSelectName(row.name)}
              className={chatNameClass(row.chatNameEffect, "block max-w-full truncate text-left text-sm font-semibold hover:underline")}
            >
              {row.name}{row.mine ? <span className="ml-1 text-[10px]">(나)</span> : null}
            </button>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              목표 {format(row.objectiveScore)} · 다양성 {format(row.diversityScore)} · 기록 {format(row.recordScore)}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-bold tabular-nums text-violet-700 dark:text-violet-300">
            {format(row.score)}점
          </div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {row.provisionalTier ? `${TIER_LABELS[row.provisionalTier]} 예상` : "등급권 밖"}
          </div>
        </div>
      </div>
    </li>
  );
}

export function CodexResearchRankingPanel({ state, onRetry, onSelectName }: {
  state: CodexResearchRankingLoadState;
  onRetry: () => void;
  onSelectName: (name: string) => void;
}) {
  const list = state.status === "ready" ? state.data.list : [];
  const pager = usePagination(list, 10);
  if (state.status === "loading") {
    return <Card as="section" padding="md"><Skeleton rows={5} /></Card>;
  }
  if (state.status === "disabled") {
    return <StateCard title="월간 연구 랭킹은 아직 공개 전입니다" message="운영 검증이 끝난 뒤 별도 공개 스위치로 열립니다." />;
  }
  if (state.status === "no_season") {
    return <StateCard title="준비 중인 월간 연구 시즌이 없습니다" message="다음 연구 주제가 확정되면 이곳에 기간과 순위가 표시됩니다." />;
  }
  if (state.status === "error") {
    return <StateCard title="월간 연구 랭킹을 불러오지 못했습니다" message={state.message ?? "잠시 뒤 다시 시도해 주세요."} onRetry={onRetry} />;
  }
  if (state.data.list.length === 0) {
    return <EmptyState icon={<Flask size={40} weight="duotone" />} title="아직 월간 연구 기록이 없습니다" message="이번 달 연구 목표를 진행하면 순위에 자동 반영됩니다." />;
  }
  return (
    <div className="space-y-3">
      <Card as="section" padding="sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">{state.data.themeName}</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {state.data.seasonId} · {new Date(state.data.endAt).toLocaleString("ko-KR")} 종료 · 결산 전 잠정 순위
            </p>
          </div>
          {state.data.me ? (
            <div className={`${SURFACE_ACCENT} px-3 py-2 text-right`}>
              <div className="text-[10px]">내 잠정 순위</div>
              <div className="text-sm font-bold">{format(state.data.me.rank)}위 · {format(state.data.me.score)}점</div>
            </div>
          ) : null}
        </div>
      </Card>
      <Card as="section" padding="sm">
        <ol className="space-y-2">
          {pager.pageItems.map((row) => (
            <ResearchRow key={`${row.rank}-${row.name}`} row={row} onSelectName={onSelectName} />
          ))}
        </ol>
        <Pagination page={pager.page} pageCount={pager.pageCount} setPage={pager.setPage} />
      </Card>
      {state.data.me && !state.data.list.some((row) => row.mine) ? (
        <Card as="section" padding="sm">
          <div className="mb-2 flex items-center gap-1 text-xs font-bold"><Trophy size={15} /> 내 주변 순위</div>
          <ol className="space-y-2">
            {state.data.nearby.map((row) => (
              <ResearchRow key={`${row.rank}-${row.name}`} row={row} onSelectName={onSelectName} />
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
