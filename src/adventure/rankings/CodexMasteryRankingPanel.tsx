"use client";

import { Trophy } from "@phosphor-icons/react";
import type {
  CodexMasteryRankingRow,
  CodexMasteryRankingScope,
} from "@/adventure/data/v2/codexMasteryRanking";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";
import { chatNameClass } from "@/components/chat/ChatCosmetics";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import type { CodexMasteryRankingLoadState } from "./useCodexMasteryRanking";

export const CODEX_MASTERY_RANKING_SCOPE_LABELS: Record<
  CodexMasteryRankingScope,
  string
> = {
  overall: "종합 숙련",
  equipment: "장비 연구",
  fish: "어류 연구",
  monster: "생태 연구",
  cooking: "미식 연구",
  life: "현장 연구",
  job: "직업 연구",
};

const CATEGORY_SCOPES = [
  "equipment",
  "fish",
  "monster",
  "cooking",
  "life",
  "job",
] as const;

const STAGE_LABELS = {
  bronze: "동",
  silver: "은",
  gold: "금",
  platinum: "백금",
  diamond: "다이아",
  legendary: "전설",
} as const;

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

function StateCard({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <Card as="section" padding="lg">
      <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const highlighted = rank <= 3;
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
        highlighted
          ? "bg-amber-500 text-white"
          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"
      }`}
    >
      {rank}
    </span>
  );
}

function RankingRow({
  row,
  scope,
  onSelectName,
}: {
  row: CodexMasteryRankingRow;
  scope: CodexMasteryRankingScope;
  onSelectName: (name: string) => void;
}) {
  return (
    <li
      className={`${row.mine ? SURFACE_ACCENT : SURFACE_INSET} p-3`}
      aria-current={row.mine ? "true" : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <RankBadge rank={row.rank} />
          <CosmeticAvatar
            avatar={row.avatar}
            name={row.name}
            profileBorder={row.profileBorder}
            width={44}
            height={44}
            sizes="44px"
            className="h-11 w-11 rounded-xl"
          />
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onSelectName(row.name)}
              className={chatNameClass(
                row.chatNameEffect,
                "block max-w-full truncate rounded-sm text-left text-sm font-semibold text-zinc-900 underline-offset-2 hover:text-sky-700 hover:underline dark:text-zinc-100 dark:hover:text-sky-300",
              )}
            >
              {row.name}
              {row.mine && (
                <span className="ml-1 text-[10px] font-normal text-emerald-700 dark:text-emerald-300">
                  (나)
                </span>
              )}
            </button>
            <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {row.rank.toLocaleString()}위 · 금 이상 {formatNumber(row.goldOrHigherCount)} · 특별 인장 {formatNumber(row.sealCount)}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold tabular-nums text-sky-700 dark:text-sky-300">
            {formatNumber(row.score)}점
          </div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            연구 분야 {row.scoredCategoryCount}/6
          </div>
        </div>
      </div>

      <details className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
        <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-300">
          상세 기록
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {CATEGORY_SCOPES.map((category) => (
            <div key={category} className={`${SURFACE_INSET} px-2 py-1.5`}>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                {CODEX_MASTERY_RANKING_SCOPE_LABELS[category]}
              </div>
              <div className="text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
                {formatNumber(row.categoryScores[category])}점
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
          {Object.entries(STAGE_LABELS).map(([stage, label]) => (
            <span key={stage}>
              {label} {formatNumber(
                row.stageCounts[stage as keyof CodexMasteryRankingRow["stageCounts"]],
              )}
            </span>
          ))}
          {scope !== "overall" && (
            <span>종합 {formatNumber(row.totalScore)}점</span>
          )}
        </div>
      </details>
    </li>
  );
}

function RankingList({
  rows,
  scope,
  onSelectName,
}: {
  rows: readonly CodexMasteryRankingRow[];
  scope: CodexMasteryRankingScope;
  onSelectName: (name: string) => void;
}) {
  return (
    <ol className="space-y-2">
      {rows.map((row) => (
        <RankingRow
          key={`${row.rank}-${row.name}`}
          row={row}
          scope={scope}
          onSelectName={onSelectName}
        />
      ))}
    </ol>
  );
}

export function CodexMasteryRankingPanel({
  scope,
  state,
  onRetry,
  onSelectName,
}: {
  scope: CodexMasteryRankingScope;
  state: CodexMasteryRankingLoadState;
  onRetry: () => void;
  onSelectName: (name: string) => void;
}) {
  const list = state.status === "ready" ? state.data.list : [];
  const pager = usePagination(list, 10);

  if (state.status === "loading") {
    return (
      <Card as="section" padding="md" aria-live="polite">
        <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">
          숙련 랭킹을 불러오는 중입니다
        </p>
        <Skeleton rows={5} />
      </Card>
    );
  }
  if (state.status === "disabled") {
    return (
      <StateCard
        title="도감 숙련 랭킹은 아직 공개 전입니다"
        message="기록과 검증이 충분히 쌓인 뒤 운영 스위치로 공개합니다."
      />
    );
  }
  if (state.status === "error") {
    return (
      <StateCard
        title="숙련 랭킹을 불러오지 못했습니다"
        message={state.message ?? "잠시 뒤 다시 시도해 주세요."}
        action={(
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            다시 시도
          </button>
        )}
      />
    );
  }
  if (state.data.list.length === 0) {
    return (
      <EmptyState
        icon={<Trophy size={40} weight="duotone" />}
        title={`아직 ${CODEX_MASTERY_RANKING_SCOPE_LABELS[scope]} 점수를 얻은 모험가가 없습니다`}
        message="도감 항목을 발견하고 단계에 도달하면 자동으로 순위에 반영됩니다."
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card as="section" padding="sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {CODEX_MASTERY_RANKING_SCOPE_LABELS[scope]} 상위 50명
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              점수 동률은 금 이상 항목·특별 인장·연구 분야·먼저 도달한 순으로 정합니다.
            </p>
          </div>
          {state.data.me && (
            <div className={`${SURFACE_ACCENT} px-3 py-2 text-right`}>
              <div className="text-[10px] text-amber-800 dark:text-amber-200">내 순위</div>
              <div className="text-sm font-bold tabular-nums text-amber-900 dark:text-amber-100">
                {state.data.me.rank.toLocaleString()}위 · {formatNumber(state.data.me.score)}점
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card as="section" padding="sm">
        <RankingList
          rows={pager.pageItems}
          scope={scope}
          onSelectName={onSelectName}
        />
        <Pagination
          page={pager.page}
          pageCount={pager.pageCount}
          setPage={pager.setPage}
        />
      </Card>

      {state.data.nearby.length > 0 && (
        <Card as="section" padding="sm">
          <h2 className="mb-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            내 주변 순위
          </h2>
          <RankingList
            rows={state.data.nearby}
            scope={scope}
            onSelectName={onSelectName}
          />
        </Card>
      )}
    </div>
  );
}
