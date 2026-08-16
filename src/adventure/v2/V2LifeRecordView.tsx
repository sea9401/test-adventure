"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowClockwise,
  ArrowRight,
  CookingPot,
  Hammer,
  PottedPlant,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import { LifeActivityIcon } from "./LifeActivityIcons";
import type {
  LifeActivityId,
  LifeActivitySummary,
  LifeSummary,
} from "./lifeSummary";

type LifeSummaryResponse = {
  ok?: boolean;
  summary?: LifeSummary;
};

const ACTIVITY_META: Record<
  LifeActivityId,
  {
    label: string;
    href: string;
    actionLabel: string;
    icon: ReactNode;
    color: string;
  }
> = {
  farming: {
    label: "농사",
    href: "/town/farm",
    actionLabel: "농장으로 이동",
    icon: <PottedPlant size={27} weight="duotone" aria-hidden />,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  woodcutting: {
    label: "벌목",
    href: "/town/logging",
    actionLabel: "벌목장으로 이동",
    icon: <LifeActivityIcon kind="woodcutting" className="size-8" />,
    color: "text-lime-700 dark:text-lime-400",
  },
  mining: {
    label: "채광",
    href: "/town/mining",
    actionLabel: "채광장으로 이동",
    icon: <LifeActivityIcon kind="mining" className="size-8" />,
    color: "text-slate-600 dark:text-slate-300",
  },
  fishing: {
    label: "낚시",
    href: "/town/fishing",
    actionLabel: "낚시터로 이동",
    icon: <LifeActivityIcon kind="fishing" className="size-8" />,
    color: "text-sky-600 dark:text-sky-400",
  },
  cooking: {
    label: "요리",
    href: "/town/kitchen",
    actionLabel: "주방으로 이동",
    icon: <CookingPot size={27} weight="duotone" aria-hidden />,
    color: "text-orange-600 dark:text-orange-400",
  },
  blacksmith: {
    label: "대장장이",
    href: "/guild?tab=facilities&facility=guild_smithy",
    actionLabel: "길드 제작소로 이동",
    icon: <Hammer size={27} weight="duotone" aria-hidden />,
    color: "text-amber-700 dark:text-amber-400",
  },
};

export function V2LifeRecordView({
  onBack,
  initialSummary,
  preview = false,
}: {
  onBack?: () => void;
  initialSummary?: LifeSummary;
  preview?: boolean;
}) {
  const [summary, setSummary] = useState<LifeSummary | null>(
    initialSummary ?? null,
  );
  const [loading, setLoading] = useState(initialSummary == null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/v2/me/life-summary");
      const json = (await response.json().catch(() => null)) as
        | LifeSummaryResponse
        | null;
      if (!response.ok || !json?.ok || !json.summary) {
        throw new Error("life_summary_failed");
      }
      setSummary(json.summary);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialSummary) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 화면 진입 시 서버 집계를 한 번 불러온다.
    void refresh();
  }, [initialSummary, refresh]);

  return (
    <PageShell spacing="normal">
      <SubViewHeader title="생활 기록" onBack={onBack} />

      {preview ? (
        <Card padding="sm">
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            <strong className="font-semibold text-emerald-700 dark:text-emerald-400">
              DEV 미리보기
            </strong>
            {" · "}실제 계정 대신 화면 확인용 샘플 생활 기록을 표시합니다.
          </p>
        </Card>
      ) : null}

      {loading && !summary ? <LifeRecordLoading /> : null}

      {error && !summary ? (
        <Card padding="md" className="text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            생활 기록을 불러오지 못했어요.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <ArrowClockwise size={16} aria-hidden />
            다시 불러오기
          </button>
        </Card>
      ) : null}

      {summary ? (
        <>
          <LifeMasteryOverview summary={summary} />

          <section aria-labelledby="life-mastery-heading" className="space-y-2">
            <div>
              <h2 id="life-mastery-heading" className="text-sm font-bold">
                생활 숙련
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                현재 효과와 누적 기록, 다음 성장 목표를 모아봅니다.
              </p>
            </div>
            {summary.activities.map((activity) => (
              <LifeActivityCard key={activity.id} activity={activity} />
            ))}
          </section>

          <section aria-labelledby="artisan-heading" className="space-y-2">
            <div>
              <h2 id="artisan-heading" className="text-sm font-bold">
                장인 기술
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                대장장이는 생활 숙련도 합산과 별도로 성장합니다.
              </p>
            </div>
            <LifeActivityCard activity={summary.artisan} />
          </section>
        </>
      ) : null}
    </PageShell>
  );
}

function LifeMasteryOverview({ summary }: { summary: LifeSummary }) {
  const progress = Math.min(
    100,
    (summary.lifeMastery.level / Math.max(1, summary.lifeMastery.maxLevel)) * 100,
  );

  return (
    <section className={`${SURFACE_ACCENT} p-4`} aria-labelledby="life-total-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2
            id="life-total-heading"
            className="text-sm font-semibold text-amber-900 dark:text-amber-100"
          >
            생활 숙련도
          </h2>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            농사·벌목·채광·낚시·요리 레벨 합계
          </p>
        </div>
        <div className="shrink-0 text-right font-bold tabular-nums text-amber-800 dark:text-amber-200">
          <span className="text-2xl">{summary.lifeMastery.level}</span>
          <span className="text-sm"> / {summary.lifeMastery.maxLevel}</span>
        </div>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900"
        role="progressbar"
        aria-label="생활 숙련도"
        aria-valuemin={0}
        aria-valuemax={summary.lifeMastery.maxLevel}
        aria-valuenow={summary.lifeMastery.level}
      >
        <div
          className="h-full rounded-full bg-amber-600 dark:bg-amber-400"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {summary.activities.map((activity) => {
          const meta = ACTIVITY_META[activity.id];
          return (
            <div
              key={activity.id}
              className={`${SURFACE_INSET} min-w-0 px-1 py-2 text-center`}
            >
              <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                {meta.label}
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                Lv.{activity.level}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LifeActivityCard({
  activity,
}: {
  activity: LifeActivitySummary;
}) {
  const meta = ACTIVITY_META[activity.id];
  const maxLevel =
    activity.levelCap != null && activity.level >= activity.levelCap;
  const progress = maxLevel
    ? 100
    : Math.min(
        100,
        (activity.xpIntoLevel / Math.max(1, activity.xpForNext)) * 100,
      );

  return (
    <Card as="article" padding="md">
      <div className="flex items-start gap-3">
        <div
          className={`${SURFACE_INSET} ${meta.color} flex size-11 shrink-0 items-center justify-center`}
        >
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
              {meta.label}
            </h3>
            <div className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
              Lv.{activity.level}
              {activity.levelCap != null ? (
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  {" "}/ {activity.levelCap}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-2">
            <div className="mb-1 flex justify-between gap-2 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
              <span>{maxLevel ? "최종 숙련 달성 · MAX" : "숙련도"}</span>
              <span>
                {maxLevel
                  ? `${activity.xp.toLocaleString()} 누적 XP`
                  : `${activity.xpIntoLevel.toLocaleString()} / ${activity.xpForNext.toLocaleString()} XP`}
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
              role="progressbar"
              aria-label={`${meta.label} 숙련도`}
              aria-valuemin={0}
              aria-valuemax={maxLevel ? 100 : activity.xpForNext}
              aria-valuenow={maxLevel ? 100 : activity.xpIntoLevel}
            >
              <div
                className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {activity.records.map((record) => (
          <div key={record.label} className={`${SURFACE_INSET} px-2.5 py-2`}>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
              {record.label}
            </div>
            <div className="mt-0.5 font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
              {record.value.toLocaleString()}
              {record.suffix ?? ""}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
        {activity.effects.map((effect) => (
          <p key={effect}>현재 효과 · {effect}</p>
        ))}
        <p>
          다음 목표 · {activity.nextGoal ?? "현재 성장 목표를 모두 달성했습니다"}
        </p>
      </div>

      <Link
        href={meta.href}
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {meta.actionLabel}
        <ArrowRight size={16} aria-hidden />
      </Link>
    </Card>
  );
}

function LifeRecordLoading() {
  return (
    <div role="status" aria-label="생활 기록 불러오는 중" className="space-y-3">
      <Card padding="md">
        <div className="h-5 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="mt-3 h-2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      </Card>
      {[0, 1, 2].map((index) => (
        <Card key={index} padding="md">
          <div className="h-5 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="mt-3 h-16 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
        </Card>
      ))}
    </div>
  );
}
