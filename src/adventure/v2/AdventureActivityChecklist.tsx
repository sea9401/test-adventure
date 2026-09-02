"use client";

import {
  Check,
  CheckSquare,
  ClockCountdown,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_ACCENT } from "@/components/ui/surfaces";
import {
  sortAdventureActivities,
  type AdventureActivityGroup,
  type AdventureActivityView,
  type AdventureDashboardSummary,
} from "./adventureDashboard";

const GROUP_LABELS = {
  daily: "오늘",
  weekly: "이번 주",
  ready: "생활·길드",
} as const;

const STATE_LABELS = {
  actionable: "이동",
  in_progress: "진행 중",
  completed: "완료",
  unavailable: "확인 불가",
} as const;

export function dailyResetRemainingLabel(now: number): string {
  const kstOffsetMs = 9 * 60 * 60 * 1_000;
  const kstNow = new Date(now + kstOffsetMs);
  const nextReset =
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate() + 1,
    ) - kstOffsetMs;
  const totalMinutes = Math.max(0, Math.ceil((nextReset - now) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0
    ? `초기화까지 ${hours}시간 ${minutes}분`
    : `초기화까지 ${minutes}분`;
}

function actionableLabel(activity: AdventureActivityView): string {
  if (activity.id === "farm_ready") return "수확";
  if (activity.tab === "guild") return "확인";
  return "이동";
}

function ActivityRow({ activity }: { activity: AdventureActivityView }) {
  const actionable = activity.state === "actionable";
  const completed = activity.state === "completed";
  const stateLabel =
    activity.countsTowardCompletion === false
      ? "반복"
      : actionable
        ? actionableLabel(activity)
        : STATE_LABELS[activity.state];

  return (
    <a
      href={activity.href}
      className="flex min-h-11 items-center gap-2 border-b border-zinc-200 px-3 py-2 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      aria-label={`${activity.title}, ${activity.detail}, ${stateLabel}`}
    >
      {completed ? (
        <CheckSquare size={19} weight="fill" className="shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <ClockCountdown
          size={19}
          weight="duotone"
          className={`shrink-0 ${actionable ? "text-amber-600" : "text-zinc-400"}`}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {activity.title}
        </span>
        <span className="block truncate text-[0.6875rem] text-zinc-500 dark:text-zinc-400">
          {activity.detail}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-md px-2 py-1 text-[0.6875rem] font-semibold ${
          actionable
            ? "bg-amber-500 text-white"
            : completed
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
      >
        {stateLabel}
      </span>
    </a>
  );
}

function ActivityGroup({
  group,
  activities,
}: {
  group: AdventureActivityGroup;
  activities: readonly AdventureActivityView[];
}) {
  const items = sortAdventureActivities(
    activities.filter((activity) => activity.group === group),
  );
  if (items.length === 0) return null;
  const tracked = items.filter(
    (item) => item.countsTowardCompletion !== false,
  );
  const completed = tracked.filter((item) => item.state === "completed").length;
  return (
    <Inset as="section" padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <h3 className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
          {GROUP_LABELS[group]}
        </h3>
        <span className="text-[0.6875rem] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
          {group === "ready" ? `준비 ${items.length}개` : `${completed} / ${tracked.length}`}
        </span>
      </div>
      <div>
        {items.map((activity) => (
          <ActivityRow key={activity.id} activity={activity} />
        ))}
      </div>
    </Inset>
  );
}

export function AdventureActivityChecklist({
  activities,
  summary,
  serverNow,
  loading = false,
  error = null,
  onRetry,
}: {
  activities: readonly AdventureActivityView[];
  summary: AdventureDashboardSummary;
  serverNow?: number;
  loading?: boolean;
  error?: string | null;
  onRetry: () => void;
}) {
  const enabled = activities.filter((activity) => activity.enabled);
  const daily = enabled.filter((activity) => activity.group === "daily");
  const secondary = enabled.filter((activity) => activity.group !== "daily");
  const resetLabel =
    serverNow == null
      ? "초기화 시간 확인 중"
      : dailyResetRemainingLabel(serverNow);

  return (
    <Card
      as="section"
      padding="none"
      aria-labelledby="adventure-check-title"
      className="overflow-hidden"
    >
      <div className={`${SURFACE_ACCENT} flex items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-3 py-3 shadow-none sm:px-4`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
            <Check size={22} weight="bold" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="adventure-check-title" className="truncate text-sm font-bold text-amber-950 dark:text-amber-100">
              오늘의 모험 체크
            </h2>
            <p className="mt-0.5 text-[0.6875rem] text-amber-800 dark:text-amber-300">
              {resetLabel}
            </p>
          </div>
        </div>
        <strong className="shrink-0 text-sm font-extrabold tabular-nums text-amber-800 dark:text-amber-200">
          {summary.completed} / {summary.total} 완료
        </strong>
      </div>

      <StatusBanner
        data-testid="actionable-summary"
        data-checklist-actionable-summary
        tone="actionable"
        className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 sm:mx-4"
      >
        <span className="size-2 shrink-0 rounded-full bg-rose-500" aria-hidden />
        <strong>지금 가능한 행동 {summary.actionableCount}개</strong>
        {summary.actionableCount > 0 ? (
          <span className="min-w-0 truncate text-orange-700 dark:text-orange-300">
            {enabled
              .filter((activity) => activity.state === "actionable")
              .map((activity) => activity.title)
              .join(" · ")}
          </span>
        ) : null}
      </StatusBanner>

      {error ? (
        <Inset className="m-3 flex items-center gap-2 p-3 text-sm sm:m-4">
          <WarningCircle size={20} className="shrink-0 text-amber-600" aria-hidden />
          <span className="min-w-0 flex-1 text-zinc-600 dark:text-zinc-300">{error}</span>
          <Button type="button" onClick={onRetry} variant="soft" size="sm">
            다시 시도
          </Button>
        </Inset>
      ) : loading && enabled.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">활동 상태를 확인하는 중…</p>
      ) : (
        <div
          data-testid="checklist-groups"
          className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4"
        >
          <div className="space-y-3">
            <ActivityGroup group="daily" activities={daily} />
          </div>
          <div className="space-y-3">
            <ActivityGroup group="weekly" activities={secondary} />
            <ActivityGroup group="ready" activities={secondary} />
          </div>
        </div>
      )}
    </Card>
  );
}
