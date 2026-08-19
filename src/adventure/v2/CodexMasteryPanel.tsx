"use client";

import { useState } from "react";
import { MagnifyingGlass, Star } from "@phosphor-icons/react";
import type {
  CodexMasteryCategory,
  CodexMasteryCountStage,
  CodexMasteryStage,
  CodexMasteryTier,
} from "@/adventure/data/v2/codexMasteryTypes";
import type {
  CodexMasteryEntryView,
  CodexMasteryPinnedGoal,
  CodexMasterySnapshot,
} from "@/adventure/data/v2/codexMasteryView";
import { Card } from "@/components/ui/Card";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";

export const CODEX_MASTERY_PAGE_SIZE = 30;

export const CODEX_MASTERY_CATEGORY_LABELS: Record<CodexMasteryCategory, string> = {
  equipment: "장비 연구",
  fish: "어류 연구",
  monster: "생태 연구",
  cooking: "미식 연구",
  life: "현장 연구",
  job: "직업 연구",
};

export const CODEX_MASTERY_STAGE_LABELS: Record<CodexMasteryTier, string> = {
  none: "미발견",
  discovered: "발견",
  bronze: "동",
  silver: "은",
  gold: "금",
  platinum: "백금",
  diamond: "다이아",
  legendary: "전설",
};

const COUNT_STAGES: readonly CodexMasteryCountStage[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "legendary",
];

export type CodexMasteryEntryFilter =
  | "all"
  | "undiscovered"
  | "near_next"
  | "below_gold"
  | "platinum_plus"
  | "pinned"
  | "missing_seal";

export type CodexMasteryPanelState =
  | { status: "loading" }
  | { status: "disabled" }
  | { status: "error"; message?: string }
  | { status: "ready"; snapshot: CodexMasterySnapshot };

const tierOrder: Record<CodexMasteryTier, number> = {
  none: -1,
  discovered: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
  diamond: 5,
  legendary: 6,
};

export function filterCodexMasteryEntries(
  entries: readonly CodexMasteryEntryView[],
  options: {
    category: "all" | CodexMasteryCategory;
    filter: CodexMasteryEntryFilter;
    query: string;
    sealsEnabled: boolean;
  },
): CodexMasteryEntryView[] {
  const query = options.query.trim().toLocaleLowerCase("ko-KR");
  return entries.filter((entry) => {
    if (options.category !== "all" && entry.category !== options.category) {
      return false;
    }
    if (
      query &&
      !entry.label.toLocaleLowerCase("ko-KR").includes(query) &&
      !entry.entryId.toLocaleLowerCase("en-US").includes(query)
    ) {
      return false;
    }
    if (options.filter === "all") return true;
    if (options.filter === "undiscovered") return entry.currentTier === "none";
    if (options.filter === "near_next") {
      return entry.currentTier !== "legendary" &&
        entry.nextThreshold !== null &&
        entry.nextProgressPercent >= 70;
    }
    if (options.filter === "below_gold") {
      return tierOrder[entry.currentTier] < tierOrder.gold;
    }
    if (options.filter === "platinum_plus") {
      return tierOrder[entry.currentTier] >= tierOrder.platinum;
    }
    if (options.filter === "pinned") return entry.pinned;
    if (!options.sealsEnabled) return true;
    return entry.availableSealIds.some((sealId) => !entry.sealIds.includes(sealId));
  });
}

export function paginateCodexMasteryEntries(
  entries: readonly CodexMasteryEntryView[],
  requestedPage: number,
  pageSize = CODEX_MASTERY_PAGE_SIZE,
): {
  entries: CodexMasteryEntryView[];
  page: number;
  pageCount: number;
  total: number;
} {
  const normalizedSize = Math.max(1, Math.trunc(pageSize));
  const pageCount = Math.max(1, Math.ceil(entries.length / normalizedSize));
  const page = Math.min(pageCount, Math.max(1, Math.trunc(requestedPage) || 1));
  const start = (page - 1) * normalizedSize;
  return {
    entries: entries.slice(start, start + normalizedSize),
    page,
    pageCount,
    total: entries.length,
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
    >
      <div className="h-full rounded-full bg-amber-500" style={{ width: `${percent}%` }} />
    </div>
  );
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
    <Card padding="lg">
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

function GoalCard({
  entry,
  title,
}: {
  entry: CodexMasteryEntryView;
  title?: string;
}) {
  return (
    <div className={`${SURFACE_INSET} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          {title && <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">{title}</div>}
          <div className="text-sm font-bold">{entry.label}</div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {CODEX_MASTERY_CATEGORY_LABELS[entry.category]} · {CODEX_MASTERY_STAGE_LABELS[entry.currentTier]}
          </div>
        </div>
        <span className="text-xs font-semibold tabular-nums">
          {entry.nextProgressPercent}%
        </span>
      </div>
      {entry.nextStage && entry.nextThreshold !== null && (
        <>
          <div className="mt-2">
            <ProgressBar value={entry.nextProgressPercent} label={`${entry.label} 다음 승급 진행`} />
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            {CODEX_MASTERY_STAGE_LABELS[entry.nextStage]}까지 {formatNumber(entry.count)}/{formatNumber(entry.nextThreshold)}
          </div>
        </>
      )}
    </div>
  );
}

function EntryDetail({ entry, sealsEnabled }: {
  entry: CodexMasteryEntryView;
  sealsEnabled: boolean;
}) {
  const stages: Array<{ stage: CodexMasteryStage; threshold: number | null }> = [
    { stage: "discovered", threshold: null },
    ...COUNT_STAGES.map((stage) => ({ stage, threshold: entry.thresholds[stage] })),
  ];
  return (
    <Card padding="md" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            {CODEX_MASTERY_CATEGORY_LABELS[entry.category]} · {entry.entryId}
          </div>
          <h3 className="text-base font-bold">{entry.label}</h3>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold">{CODEX_MASTERY_STAGE_LABELS[entry.currentTier]}</div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">항목 점수 {formatNumber(entry.score)}</div>
        </div>
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <div className={`${SURFACE_INSET} p-2.5`}>누적 {formatNumber(entry.count)}회</div>
        <div className={`${SURFACE_INSET} p-2.5`}>
          개인 최고 {entry.bestValue === null ? "기록 없음" : formatNumber(entry.bestValue)}
        </div>
        <div className={`${SURFACE_INSET} p-2.5`}>
          {sealsEnabled
            ? `특별 인장 ${entry.sealIds.length}/${entry.availableSealIds.length}`
            : "특별 인장 준비 중"}
        </div>
      </div>
      {entry.nextStage && (
        <div className={`${SURFACE_ACCENT} p-3`}>
          <div className="flex items-baseline justify-between gap-2 text-xs font-semibold">
            <span>다음 목표 · {CODEX_MASTERY_STAGE_LABELS[entry.nextStage]}</span>
            <span className="tabular-nums">{entry.nextProgressPercent}%</span>
          </div>
          {entry.nextThreshold !== null && (
            <div className="mt-2">
              <ProgressBar value={entry.nextProgressPercent} label={`${entry.label} 상세 승급 진행`} />
            </div>
          )}
        </div>
      )}
      <div>
        <h4 className="text-xs font-bold">단계 연혁</h4>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {stages.map(({ stage, threshold }) => {
            const achievedAt = entry.tierAchievedAt[stage];
            return (
              <div key={stage} className={`${SURFACE_INSET} flex items-center justify-between gap-2 p-2 text-xs`}>
                <span className="font-semibold">
                  {CODEX_MASTERY_STAGE_LABELS[stage]}
                  {threshold === null ? "" : ` · ${formatNumber(threshold)}회`}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {achievedAt ? formatDate(achievedAt) : "미달성"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export function CodexMasteryPanel({
  state,
  onRetry,
  onReplacePinnedGoals,
}: {
  state: CodexMasteryPanelState;
  onRetry: () => void;
  onReplacePinnedGoals: (entries: CodexMasteryPinnedGoal[]) => Promise<void> | void;
}) {
  const [category, setCategory] = useState<"all" | CodexMasteryCategory>("all");
  const [filter, setFilter] = useState<CodexMasteryEntryFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pinBusyKey, setPinBusyKey] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  if (state.status === "loading") {
    return <StateCard title="도감 숙련을 불러오는 중…" message="수집 기록과 장기 연구 목표를 정리하고 있어요." />;
  }
  if (state.status === "disabled") {
    return <StateCard title="도감 숙련 공개를 준비하고 있어요" message="백필과 운영 점검이 끝난 뒤 안전하게 열립니다. 기존 도감과 SP에는 영향이 없습니다." />;
  }
  if (state.status === "error") {
    return (
      <StateCard
        title="도감 숙련을 불러오지 못했어요"
        message={state.message ?? "잠시 뒤 다시 시도해 주세요."}
        action={(
          <button type="button" onClick={onRetry} className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
            다시 불러오기
          </button>
        )}
      />
    );
  }

  const { snapshot } = state;
  const filtered = filterCodexMasteryEntries(snapshot.entries, {
    category,
    filter,
    query,
    sealsEnabled: snapshot.features.sealsEnabled,
  });
  const paged = paginateCodexMasteryEntries(filtered, page);
  const selected = snapshot.entries.find((entry) => entry.key === selectedKey) ??
    paged.entries[0] ?? null;
  const pinnedEntries = snapshot.pinnedGoals
    .map((goal) => snapshot.entries.find(
      (entry) => entry.category === goal.category && entry.entryId === goal.entryId,
    ))
    .filter((entry): entry is CodexMasteryEntryView => entry !== undefined);
  const futureFeatures = [
    !snapshot.features.rankingVisible ? "서버 랭킹" : null,
    !snapshot.features.trophiesEnabled ? "트로피" : null,
    !snapshot.features.monthlyProgressEnabled ? "월간 연구전" : null,
  ].filter((label): label is string => label !== null);

  const replacePin = async (entry: CodexMasteryEntryView) => {
    const current = snapshot.pinnedGoals;
    const exists = current.some(
      (goal) => goal.category === entry.category && goal.entryId === entry.entryId,
    );
    if (!exists && current.length >= 5) {
      setPinError("고정 연구 목표는 최대 5개까지 선택할 수 있어요.");
      return;
    }
    const next = exists
      ? current.filter((goal) =>
          goal.category !== entry.category || goal.entryId !== entry.entryId
        )
      : [...current, { category: entry.category, entryId: entry.entryId }];
    setPinBusyKey(entry.key);
    setPinError(null);
    try {
      await onReplacePinnedGoals(next);
    } catch (error) {
      setPinError(error instanceof Error ? error.message : "고정 목표를 저장하지 못했어요.");
    } finally {
      setPinBusyKey(null);
    }
  };

  const changeCategory = (next: "all" | CodexMasteryCategory) => {
    setCategory(next);
    setPage(1);
  };
  const changeFilter = (next: CodexMasteryEntryFilter) => {
    setFilter(next);
    setPage(1);
  };

  return (
    <section className={`${SURFACE_INSET} space-y-3 p-2.5 sm:p-3`} aria-label="도감 숙련">
      <div className={`${SURFACE_ACCENT} p-4`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-amber-800 dark:text-amber-200">종합 숙련 점수</div>
            <div className="mt-1 text-3xl font-black tabular-nums">{formatNumber(snapshot.summary.totalScore)}</div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              발견 {snapshot.summary.discoveredCount}/{snapshot.summary.totalEntries}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
            {(["gold", "platinum", "diamond", "legendary"] as const).map((stage) => (
              <div key={stage} className={`${SURFACE_CARD} min-w-14 px-2 py-1.5`}>
                <div className="font-bold tabular-nums">{snapshot.summary.stageCounts[stage]}</div>
                <div className="text-zinc-500 dark:text-zinc-400">{CODEX_MASTERY_STAGE_LABELS[stage]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {futureFeatures.length > 0 && (
        <div className={`${SURFACE_CARD} p-3 text-xs text-zinc-600 dark:text-zinc-300`}>
          {futureFeatures.join(" · ")}은 다음 단계에서 연결됩니다
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {snapshot.categories.map((summary) => (
          <button
            key={summary.category}
            type="button"
            aria-pressed={category === summary.category}
            onClick={() => changeCategory(summary.category)}
            className={`${SURFACE_CARD} p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-amber-500`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-bold">{CODEX_MASTERY_CATEGORY_LABELS[summary.category]}</span>
              <span className="text-sm font-black tabular-nums">{formatNumber(summary.score)}</span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              발견 {summary.discoveredCount}/{summary.totalEntries} · 금 이상 {summary.goldOrHigherCount}
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <Card padding="md">
          <h3 className="text-sm font-bold">고정 연구 목표</h3>
          <div className="mt-2 space-y-2">
            {pinnedEntries.length > 0
              ? pinnedEntries.map((entry) => <GoalCard key={entry.key} entry={entry} />)
              : <p className="text-xs text-zinc-500 dark:text-zinc-400">항목의 별을 눌러 최대 5개까지 고정하세요.</p>}
          </div>
        </Card>
        <Card padding="md">
          <h3 className="text-sm font-bold">최근 승급</h3>
          <div className="mt-2 space-y-1.5">
            {snapshot.recentPromotions.length > 0
              ? snapshot.recentPromotions.map((promotion) => (
                  <div key={`${promotion.key}:${promotion.stage}`} className={`${SURFACE_INSET} p-2 text-xs`}>
                    <span className="font-semibold">{promotion.label}</span>
                    <span className="text-zinc-500 dark:text-zinc-400"> · {CODEX_MASTERY_STAGE_LABELS[promotion.stage]} · {formatDate(promotion.achievedAt)}</span>
                  </div>
                ))
              : <p className="text-xs text-zinc-500 dark:text-zinc-400">아직 승급 기록이 없습니다.</p>}
          </div>
        </Card>
        <Card padding="md">
          <h3 className="text-sm font-bold">승급 임박 목표</h3>
          <div className="mt-2 space-y-2">
            {snapshot.nearGoals.length > 0
              ? snapshot.nearGoals.map((goal) => {
                  const full = snapshot.entries.find((entry) => entry.key === goal.key);
                  return full ? <GoalCard key={goal.key} entry={full} /> : null;
                })
              : <p className="text-xs text-zinc-500 dark:text-zinc-400">진행을 시작하면 가까운 목표를 찾아드려요.</p>}
          </div>
        </Card>
      </div>

      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 text-xs font-semibold">
            항목 검색
            <span className="relative mt-1 block">
              <MagnifyingGlass size={15} aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 text-zinc-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="이름 또는 항목 ID"
                className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => changeCategory("all")}
            aria-pressed={category === "all"}
            className="h-9 rounded-md border border-zinc-300 bg-zinc-100 px-3 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-800"
          >
            모든 분야
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="숙련 진행 필터">
          {([
            ["all", "전체"],
            ["undiscovered", "미발견"],
            ["near_next", "승급 임박"],
            ["below_gold", "금 미만"],
            ["platinum_plus", "백금 이상"],
            ["pinned", "고정 목표"],
            ...(snapshot.features.sealsEnabled ? [["missing_seal", "인장 미획득"]] : []),
          ] as Array<[CodexMasteryEntryFilter, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => changeFilter(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                filter === value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>검색 결과 {paged.total}개</span>
          <span>{paged.page}/{paged.pageCount}쪽</span>
        </div>
        {paged.entries.length === 0 ? (
          <Card padding="md"><p className="text-sm text-zinc-500 dark:text-zinc-400">현재 조건에 맞는 항목이 없습니다. 필터를 완화해 보세요.</p></Card>
        ) : paged.entries.map((entry) => (
          <div key={entry.key} data-mastery-entry={entry.key} className={`${SURFACE_CARD} flex items-center gap-2 p-2.5`}>
            <button type="button" onClick={() => setSelectedKey(entry.key)} className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="truncate text-sm font-bold">{entry.label}</span>
                <span className="text-xs font-semibold">{CODEX_MASTERY_STAGE_LABELS[entry.currentTier]}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                {CODEX_MASTERY_CATEGORY_LABELS[entry.category]} · 누적 {formatNumber(entry.count)}회 · 점수 {formatNumber(entry.score)}
              </div>
              {entry.nextThreshold !== null && (
                <div className="mt-2"><ProgressBar value={entry.nextProgressPercent} label={`${entry.label} 목록 승급 진행`} /></div>
              )}
            </button>
            <button
              type="button"
              aria-label={`${entry.label} ${entry.pinned ? "고정 해제" : "목표 고정"}`}
              aria-pressed={entry.pinned}
              disabled={pinBusyKey !== null}
              onClick={() => void replacePin(entry)}
              className="rounded-md border border-zinc-300 bg-white p-2 text-amber-600 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-amber-300"
            >
              <Star size={18} weight={entry.pinned ? "fill" : "regular"} aria-hidden />
            </button>
          </div>
        ))}
        {pinError && <div className={`${SURFACE_CARD} p-3 text-xs text-rose-700 dark:text-rose-300`}>{pinError}</div>}
        <div className="flex items-center justify-center gap-2">
          <button type="button" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)} className="rounded-md bg-zinc-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:bg-zinc-800">이전</button>
          <span className="text-xs tabular-nums">{paged.page}/{paged.pageCount}</span>
          <button type="button" disabled={paged.page >= paged.pageCount} onClick={() => setPage(paged.page + 1)} className="rounded-md bg-zinc-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:bg-zinc-800">다음</button>
        </div>
      </div>

      {selected && <EntryDetail entry={selected} sealsEnabled={snapshot.features.sealsEnabled} />}
    </section>
  );
}
