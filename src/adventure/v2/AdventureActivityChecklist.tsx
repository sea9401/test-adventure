"use client";

import { useEffect, useState } from "react";
import {
  CaretDown,
  CaretRight,
  CheckSquare,
  ClockCountdown,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  sortAdventureActivities,
  type AdventureActivityGroup,
  type AdventureActivityView,
  type AdventureDashboardSummary,
} from "./adventureDashboard";

const CHECKLIST_VISIBLE_PER_GROUP = 3;

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
  if (activity.id === "peddler_ready") return "받기";
  if (activity.tab === "guild") return "확인";
  return "이동";
}

function ActivityRow({ activity }: { activity: AdventureActivityView }) {
  const actionable = activity.state === "actionable";
  // 생활·길드 묶음의 completed는 "걸어 둔 작업이 없음"이다. 끝낸 일처럼 보이지 않게 대기로 표시한다.
  const idle = activity.group === "ready" && activity.state === "completed";
  const completed = activity.state === "completed" && !idle;
  const stateLabel =
    activity.countsTowardCompletion === false && !completed
      ? "반복"
      : idle
        ? "대기"
        : actionable
        ? actionableLabel(activity)
        : STATE_LABELS[activity.state];

  // 횟수를 채워 가는 활동은 "진행 중" 글자 대신 얼마나 찼는지를 막대로 보여 준다.
  const progress =
    activity.state === "in_progress" &&
    activity.countsTowardCompletion !== false &&
    typeof activity.current === "number" &&
    typeof activity.target === "number" &&
    activity.target > 0
      ? { current: activity.current, target: activity.target }
      : null;

  return (
    <a
      href={activity.href}
      className="flex min-h-11 items-center gap-2 px-3 py-2 hover:bg-zinc-50 sm:px-4 dark:hover:bg-zinc-800"
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
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
          {activity.detail}
        </span>
      </span>
      {actionable ? (
        <span className="shrink-0 rounded-md bg-amber-500 px-2 py-1 text-xs font-semibold text-white">
          {stateLabel}
        </span>
      ) : progress ? (
        <span
          role="progressbar"
          aria-label="진행도"
          aria-valuemin={0}
          aria-valuenow={progress.current}
          aria-valuemax={progress.target}
          className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
        >
          <span
            className="block h-full bg-primary"
            style={{
              width: `${Math.min(100, (progress.current / progress.target) * 100)}%`,
            }}
          />
        </span>
      ) : (
        <span
          className={`shrink-0 text-xs font-semibold ${
            completed
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {stateLabel}
        </span>
      )}
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
  const [expanded, setExpanded] = useState(false);
  const items = sortAdventureActivities(
    activities.filter((activity) => activity.group === group),
  );
  if (items.length === 0) return null;
  // 지금 할 수 있는 것부터 정렬돼 있으니 앞의 몇 개만 보이고 나머지는 펼쳐서 본다.
  const hiddenCount = Math.max(0, items.length - CHECKLIST_VISIBLE_PER_GROUP);
  const visible = expanded ? items : items.slice(0, CHECKLIST_VISIBLE_PER_GROUP);
  const tracked = items.filter(
    (item) => item.countsTowardCompletion !== false,
  );
  const completed = tracked.filter((item) => item.state === "completed").length;
  return (
    <section className="border-t border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center justify-between px-3 pb-1 pt-3 sm:px-4">
        <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
          {GROUP_LABELS[group]}
        </h3>
        <span className="text-xs font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
          {group === "ready" ? `준비 ${items.length}개` : `${completed} / ${tracked.length}`}
        </span>
      </div>
      <div className="pb-1">
        {visible.map((activity) => (
          <ActivityRow key={activity.id} activity={activity} />
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="flex min-h-10 w-full items-center justify-center gap-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {expanded ? "접기" : `나머지 ${hiddenCount}개 보기`}
          <CaretDown size={14} aria-hidden className={expanded ? "rotate-180" : ""} />
        </button>
      )}
    </section>
  );
}

const TILE_COUNT = 3;
const EXPANDED_STORAGE_KEY = "adventure-home.checklist-expanded";

function readStoredExpanded(): boolean {
  try {
    return window.localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** 오늘·이번 주에 횟수를 채워 가는 활동 하나를 크게 보여 주는 타일. */
function ActivityTile({ activity }: { activity: AdventureActivityView }) {
  const completed = activity.state === "completed";
  const counted =
    typeof activity.current === "number" &&
    typeof activity.target === "number" &&
    activity.target > 0
      ? { current: activity.current, target: activity.target }
      : null;
  const stateLabel =
    activity.state === "actionable"
      ? actionableLabel(activity)
      : STATE_LABELS[activity.state];

  return (
    <a
      href={activity.href}
      aria-label={`${activity.title}, ${activity.detail}, ${stateLabel}`}
      className={`${SURFACE_INSET} flex min-h-20 min-w-0 flex-col gap-1 p-2.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900`}
    >
      <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
        {activity.title}
        {activity.group === "weekly" ? " · 주간" : ""}
      </span>
      {counted ? (
        <span className="text-xl font-extrabold tabular-nums leading-tight text-zinc-900 dark:text-zinc-100">
          {counted.current.toLocaleString()}
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {" "}
            / {counted.target.toLocaleString()}
          </span>
        </span>
      ) : (
        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {activity.detail}
        </span>
      )}
      {completed ? (
        <span className="mt-auto text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          완료
        </span>
      ) : counted ? (
        <span
          role="progressbar"
          aria-label="진행도"
          aria-valuemin={0}
          aria-valuenow={counted.current}
          aria-valuemax={counted.target}
          className="mt-auto h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
        >
          <span
            className="block h-full bg-primary"
            style={{
              width: `${Math.min(100, (counted.current / counted.target) * 100)}%`,
            }}
          />
        </span>
      ) : (
        <span className="mt-auto text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          {stateLabel}
        </span>
      )}
    </a>
  );
}

export function AdventureActivityChecklist({
  activities,
  summary,
  serverNow,
  loading = false,
  error = null,
  onRetry,
  defaultExpanded = false,
}: {
  activities: readonly AdventureActivityView[];
  summary: AdventureDashboardSummary;
  serverNow?: number;
  loading?: boolean;
  error?: string | null;
  onRetry: () => void;
  /** 전체 목록을 처음부터 펼쳐 둘지. 사용자가 펼친 적이 있으면 그 선택을 기억한다. */
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저에 기억해 둔 펼침 상태를 마운트 뒤 한 번 읽는다
    if (readStoredExpanded()) setExpanded(true);
  }, []);
  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    try {
      window.localStorage.setItem(EXPANDED_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // 저장하지 못해도 화면 동작에는 영향이 없다.
    }
  };

  const enabled = activities.filter((activity) => activity.enabled);
  const daily = enabled.filter((activity) => activity.group === "daily");
  const secondary = enabled.filter((activity) => activity.group !== "daily");
  // 타일: 오늘·이번 주에 진행도를 채워 가는 활동. 진행 중인 것이 먼저 온다.
  const tiles = sortAdventureActivities(
    enabled.filter(
      (activity) =>
        activity.group !== "ready" && activity.countsTowardCompletion !== false,
    ),
  ).slice(0, TILE_COUNT);
  const actionable = sortAdventureActivities(
    enabled.filter((activity) => activity.state === "actionable"),
  );
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
      <div className="flex items-baseline justify-between gap-3 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="min-w-0">
          <h2
            id="adventure-check-title"
            className="truncate text-base font-bold text-zinc-900 dark:text-zinc-100"
          >
            오늘의 모험 체크
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {resetLabel}
          </p>
        </div>
        <strong className="shrink-0 text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
          {summary.completed} / {summary.total} 완료
        </strong>
      </div>

      {actionable[0] ? (
        <a
          href={actionable[0].href}
          data-testid="actionable-summary"
          data-checklist-actionable-summary
          className={`${SURFACE_ACCENT} mx-3 mt-3 flex min-h-11 items-center gap-2 px-3 py-2 text-sm shadow-none sm:mx-4`}
        >
          <span className="size-2 shrink-0 rounded-full bg-orange-500" aria-hidden />
          <span className="shrink-0 text-amber-900 dark:text-amber-200">
            지금 가능한 행동
          </span>
          <strong className="min-w-0 flex-1 truncate text-amber-950 dark:text-amber-100">
            {actionable[0].title}
            {actionable.length > 1 ? ` 외 ${actionable.length - 1}개` : ""}
          </strong>
          <CaretRight
            size={14}
            weight="bold"
            aria-hidden
            className="shrink-0 text-amber-800 dark:text-amber-300"
          />
        </a>
      ) : null}

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
        <>
          {tiles.length > 0 && (
            <div
              data-testid="checklist-tiles"
              className="grid grid-cols-3 gap-2 px-3 pt-3 sm:px-4"
            >
              {tiles.map((activity) => (
                <ActivityTile key={activity.id} activity={activity} />
              ))}
            </div>
          )}
          {enabled.length > 0 && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={toggleExpanded}
              className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {expanded ? "전체 접기" : "전체 보기"}
              <CaretDown size={14} aria-hidden className={expanded ? "rotate-180" : ""} />
            </button>
          )}
          {expanded && (
            <div
              data-testid="checklist-groups"
              className="grid sm:grid-cols-2 sm:divide-x sm:divide-zinc-200 dark:sm:divide-zinc-700"
            >
              <div>
                <ActivityGroup group="daily" activities={daily} />
              </div>
              <div>
                <ActivityGroup group="weekly" activities={secondary} />
                <ActivityGroup group="ready" activities={secondary} />
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
