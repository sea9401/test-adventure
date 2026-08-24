"use client";

import {
  CheckCircle,
  ClockCountdown,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";
import { StatusBanner } from "@/components/ui/StatusBanner";
import {
  sortAdventureActivities,
  type AdventureActivityView,
  type AdventureDashboardSummary,
} from "./adventureDashboard";

const GROUP_LABELS = {
  daily: "오늘",
  weekly: "이번 주",
  ready: "생활·작업",
} as const;

const STATE_LABELS = {
  actionable: "확인하기",
  in_progress: "진행 중",
  completed: "완료",
  unavailable: "확인 불가",
} as const;

function groupProgress(
  activities: readonly AdventureActivityView[],
  group: "daily" | "weekly",
) {
  const counted = activities.filter(
    (activity) =>
      activity.enabled &&
      activity.group === group &&
      activity.state !== "unavailable",
  );
  return {
    completed: counted.filter((activity) => activity.state === "completed")
      .length,
    total: counted.length,
  };
}

export function AdventureActivityChecklist({
  activities,
  summary,
  loading = false,
  error = null,
  onRetry,
}: {
  activities: readonly AdventureActivityView[];
  summary: AdventureDashboardSummary;
  loading?: boolean;
  error?: string | null;
  onRetry: () => void;
}) {
  const enabled = activities.filter((activity) => activity.enabled);
  const daily = groupProgress(activities, "daily");
  const weekly = groupProgress(activities, "weekly");
  return (
    <Card as="section" padding="md" aria-labelledby="adventure-check-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="adventure-check-title" className="font-semibold text-zinc-900 dark:text-zinc-100">
            오늘의 모험 체크
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            완료한 일과 지금 처리할 수 있는 일을 한눈에 확인합니다.
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-medium tabular-nums">
        <Inset data-testid="daily-summary" className="min-w-0 px-2 py-2">
          <span className="block text-zinc-500 dark:text-zinc-400">오늘</span>
          <strong className="mt-0.5 block text-sm text-zinc-800 dark:text-zinc-100">
            {daily.completed} / {daily.total}
          </strong>
        </Inset>
        <Inset data-testid="weekly-summary" className="min-w-0 px-2 py-2">
          <span className="block text-zinc-500 dark:text-zinc-400">이번 주</span>
          <strong className="mt-0.5 block text-sm text-zinc-800 dark:text-zinc-100">
            {weekly.completed} / {weekly.total}
          </strong>
        </Inset>
        <StatusBanner
          data-testid="actionable-summary"
          tone="actionable"
          className="min-w-0 px-2 py-2"
        >
          <span className="block">지금 가능</span>
          <strong className="mt-0.5 block text-sm">{summary.actionableCount}</strong>
        </StatusBanner>
      </div>

      {error ? (
        <Inset className="mt-3 flex items-center gap-2 p-3 text-sm">
          <WarningCircle size={20} className="shrink-0 text-amber-600" aria-hidden />
          <span className="min-w-0 flex-1 text-zinc-600 dark:text-zinc-300">{error}</span>
          <Button type="button" onClick={onRetry} variant="soft" size="sm">
            다시 시도
          </Button>
        </Inset>
      ) : loading && enabled.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">활동 상태를 확인하는 중…</p>
      ) : (
        <div className="mt-3 space-y-3">
          {(["daily", "weekly", "ready"] as const).map((group) => {
            const items = sortAdventureActivities(
              enabled.filter((activity) => activity.group === group),
            );
            if (items.length === 0) return null;
            return (
              <Inset as="details" padding="none" key={group} open className="overflow-hidden">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                  {GROUP_LABELS[group]} <span className="font-normal text-zinc-500">{items.length}</span>
                </summary>
                <div className="border-t border-zinc-200 dark:border-zinc-700">
                  {items.map((activity) => {
                    const actionable = activity.state === "actionable";
                    const completed = activity.state === "completed";
                    return (
                      <a
                        key={activity.id}
                        href={activity.href}
                        className="flex min-h-11 items-center gap-2 border-b border-zinc-200 px-3 py-2 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        aria-label={`${activity.title}, ${activity.detail}, ${STATE_LABELS[activity.state]}`}
                      >
                        {completed ? (
                          <CheckCircle size={19} weight="fill" className="shrink-0 text-emerald-600" aria-hidden />
                        ) : (
                          <ClockCountdown size={19} weight="duotone" className={`shrink-0 ${actionable ? "text-orange-600" : "text-zinc-400"}`} aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{activity.title}</span>
                          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{activity.detail}</span>
                        </span>
                        <span className={`shrink-0 text-xs font-medium ${actionable ? "text-orange-700 dark:text-orange-300" : completed ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-500"}`}>
                          {STATE_LABELS[activity.state]}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </Inset>
            );
          })}
        </div>
      )}
    </Card>
  );
}
