"use client";

import { Crown, Scroll, Trophy } from "@phosphor-icons/react";
import type { CodexResearchArchiveRow } from "@/adventure/data/v2/codexResearchArchive";
import { chatNameClass } from "@/components/chat/ChatCosmetics";
import { Card } from "@/components/ui/Card";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import type { CodexResearchArchiveLoadState } from "./useCodexResearchArchive";

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
  return <Card as="section" padding="lg">
    <h2 className="font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
    {onRetry ? <button type="button" onClick={onRetry} className="mt-4 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">다시 시도</button> : null}
  </Card>;
}

function ArchiveRow({ row, onSelectName }: {
  row: CodexResearchArchiveRow;
  onSelectName: (name: string) => void;
}) {
  return <li className={`${row.mine || row.rank === 1 ? SURFACE_ACCENT : SURFACE_INSET} p-3`}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-700 text-xs font-bold text-white">{row.rank}</span>
        <CosmeticAvatar avatar={row.avatar} name={row.name} profileBorder={row.profileBorder} width={44} height={44} sizes="44px" className="size-11 rounded-xl" />
        <div className="min-w-0">
          <button type="button" onClick={() => onSelectName(row.name)} className={chatNameClass(row.chatNameEffect, "block max-w-full truncate text-left text-sm font-semibold hover:underline")}>
            {row.name}{row.mine ? <span className="ml-1 text-[10px]">(나)</span> : null}
          </button>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">목표 {format(row.objectiveScore)} · 다양성 {format(row.diversityScore)} · 기록 {format(row.recordScore)}</p>
          {row.firstPlaceEngraving ? <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300"><Crown size={12} /> 초대 우승자 각인</p> : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-bold tabular-nums text-violet-700 dark:text-violet-300">{format(row.score)}점</div>
        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{row.finalTier ? `${TIER_LABELS[row.finalTier]} 트로피` : "트로피 없음"}</div>
      </div>
    </div>
  </li>;
}

export function CodexResearchArchivePanel({ state, onRetry, onSeasonChange, onSelectName }: {
  state: CodexResearchArchiveLoadState;
  onRetry: () => void;
  onSeasonChange: (seasonId: string) => void;
  onSelectName: (name: string) => void;
}) {
  const list = state.status === "ready" ? state.data.list : [];
  const pager = usePagination(list, 10);
  if (state.status === "loading") return <Card as="section" padding="md"><Skeleton rows={5} /></Card>;
  if (state.status === "disabled") return <StateCard title="명예의 전당은 아직 공개 전입니다" message="결산과 트로피 검증을 마친 시즌만 별도 공개됩니다." />;
  if (state.status === "no_season") return <StateCard title="공개된 종료 시즌이 없습니다" message="공개 절차를 마친 시즌의 확정 결과가 이곳에 보존됩니다." />;
  if (state.status === "error") return <StateCard title="명예의 전당을 불러오지 못했습니다" message={state.message ?? "잠시 뒤 다시 시도해 주세요."} onRetry={onRetry} />;
  const selected = state.data.seasons.find(({ seasonId }) => seasonId === state.data.selectedSeasonId)!;
  if (state.data.list.length === 0) return <EmptyState icon={<Scroll size={40} weight="duotone" />} title="공개된 순위 기록이 없습니다" message="참가자 없이 종료된 시즌입니다." />;
  return <div className="space-y-3">
    <Card as="section" padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">{selected.themeName}</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{selected.seasonId} · 확정 결과 · 참가 {format(selected.participantCount)}명</p>
        </div>
        <label className="text-xs font-medium">종료 시즌 <select value={selected.seasonId} onChange={(event) => onSeasonChange(event.target.value)} className={`${SURFACE_INSET} ml-2 px-2 py-1.5 text-xs`}>
          {state.data.seasons.map((season) => <option key={season.seasonId} value={season.seasonId}>{season.seasonId} · {season.themeName}</option>)}
        </select></label>
      </div>
      {state.data.me ? <div className={`${SURFACE_ACCENT} mt-3 px-3 py-2`}><div className="text-[10px]">내 확정 결과</div><div className="text-sm font-bold">확정 {format(state.data.me.rank)}위 · {format(state.data.me.score)}점</div></div> : null}
    </Card>
    <Card as="section" padding="sm"><ol className="space-y-2">{pager.pageItems.map((row) => <ArchiveRow key={`${row.rank}-${row.name}`} row={row} onSelectName={onSelectName} />)}</ol><Pagination page={pager.page} pageCount={pager.pageCount} setPage={pager.setPage} /></Card>
    {state.data.me && !state.data.list.some((row) => row.mine) ? <Card as="section" padding="sm"><div className="mb-2 flex items-center gap-1 text-xs font-bold"><Trophy size={15} /> 내 주변 확정 순위</div><ol className="space-y-2">{state.data.nearby.map((row) => <ArchiveRow key={`${row.rank}-${row.name}`} row={row} onSelectName={onSelectName} />)}</ol></Card> : null}
  </div>;
}
