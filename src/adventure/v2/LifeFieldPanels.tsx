"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Compass, Medal, Sparkle } from "@phosphor-icons/react";
import {
  LIFE_FIELD_DISCOVERIES,
  LIFE_FIELD_TRACE_REQUIRED_SUCCESSES,
  lifeFieldTraceLocationText,
  type LifeFieldRecordView,
  type LifeFieldTrace,
} from "@/adventure/v2/lifeFieldRecords";
import type {
  LifeFieldActivity,
  LifeFieldEnvironmentSnapshot,
} from "@/adventure/data/v2/lifeFieldEnvironment";
import { SURFACE_ACCENT, SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { environmentRefreshDelay } from "./lifeFieldRefresh";
import { lifeFieldStatusPresentation } from "./lifeFieldStatusPresentation";

type DailyView = {
  evaluated: number;
  limit: number;
  found: boolean;
  pity: number;
  softPity: number;
  hardPity: number;
  paused: boolean;
  trace: LifeFieldTrace | null;
};

type LifeFieldFeatures = {
  environmentEnabled: boolean;
  discoveriesEnabled: boolean;
  discoveryRewardsEnabled: boolean;
  feedEnabled: boolean;
  milestonesEnabled: boolean;
};

type LifeFieldEnvironmentStatus = {
  ok: true;
  serverNow: number;
  features: LifeFieldFeatures;
  environment: {
    current: LifeFieldEnvironmentSnapshot;
    next: LifeFieldEnvironmentSnapshot;
  } | null;
  trace: LifeFieldTrace | null;
};

type LifeFieldCodexStatus = {
  ok: true;
  serverNow: number;
  features: LifeFieldFeatures;
  summary: {
    basic: { discovered: number; total: number };
    rare: { discovered: number; total: number };
    entries: LifeFieldRecordView[];
  };
  daily: Record<LifeFieldActivity, DailyView>;
  traces: Partial<Record<LifeFieldActivity, LifeFieldTrace>>;
};

type LifeFieldFullStatus = LifeFieldCodexStatus & {
  environments: Record<
    LifeFieldActivity,
    Record<
      string,
      {
        current: LifeFieldEnvironmentSnapshot;
        next: LifeFieldEnvironmentSnapshot;
      }
    >
  > | null;
};

const ACTIVITY_LABEL: Record<LifeFieldActivity, string> = {
  fishing: "낚시",
  woodcutting: "벌목",
  mining: "채광",
};

const MEDAL_LABEL = { bronze: "동", silver: "은", gold: "금" } as const;

function useLifeFieldStatus<T extends { ok: true; serverNow: number }>(
  url: string,
  refreshDelay?: (data: T) => number | null,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(url, { cache: "no-store" });
    const next = (await response.json().catch(() => null)) as T | null;
    if (!response.ok || !next?.ok) throw new Error("life field status failed");
    return next;
  }, [url]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const next = await load();
      setData(next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    let active = true;
    void load()
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void refresh();
    window.addEventListener("life-field:refresh", onRefresh);
    window.addEventListener("focus", onRefresh);
    return () => {
      window.removeEventListener("life-field:refresh", onRefresh);
      window.removeEventListener("focus", onRefresh);
    };
  }, [refresh]);

  useEffect(() => {
    if (!data || !refreshDelay) return;
    const delay = refreshDelay(data);
    if (delay == null) return;
    const timeout = window.setTimeout(() => void refresh(), delay);
    return () => window.clearTimeout(timeout);
  }, [data, refresh, refreshDelay]);

  return { data, loading, error, refresh };
}

export function useFullLifeFieldStatus() {
  return useLifeFieldStatus<LifeFieldFullStatus>("/api/v2/life-fields");
}

function environmentStatusRefreshDelay(
  data: LifeFieldEnvironmentStatus,
): number | null {
  return data.environment
    ? environmentRefreshDelay(data.serverNow, data.environment.current.endsAt)
    : null;
}

function useServerMinuteClock(
  serverNow: number | null,
): number {
  const [clock, setClock] = useState<{
    anchor: number | null;
    elapsed: number;
  }>({ anchor: null, elapsed: 0 });
  useEffect(() => {
    let elapsed = 0;
    const interval = window.setInterval(
      () => {
        elapsed += 60_000;
        setClock({ anchor: serverNow, elapsed });
      },
      60_000,
    );
    return () => window.clearInterval(interval);
  }, [serverNow]);
  if (serverNow == null) return 0;
  return serverNow + (clock.anchor === serverNow ? clock.elapsed : 0);
}

export function LifeFieldEnvironmentCard({
  activity,
  spotId,
}: {
  activity: LifeFieldActivity;
  spotId: string;
}) {
  const url = `/api/v2/life-fields?view=environment&activity=${encodeURIComponent(activity)}&spotId=${encodeURIComponent(spotId)}`;
  const { data, loading, error } =
    useLifeFieldStatus<LifeFieldEnvironmentStatus>(
      url,
      environmentStatusRefreshDelay,
    );
  const clock = useServerMinuteClock(data?.serverNow ?? null);
  const presentation = lifeFieldStatusPresentation({
    hasData: data !== null,
    loading,
    error,
  });
  if (presentation === "loading") {
    return <div className={`${SURFACE_INSET} p-3 text-xs text-zinc-500`}>현장 환경 확인 중…</div>;
  }
  if (presentation === "error" || !data) {
    return <div className={`${SURFACE_INSET} p-3 text-xs text-zinc-500`}>현장 정보를 불러오지 못했습니다.</div>;
  }
  if (!data.features.environmentEnabled || !data.environment) return null;
  const row = data.environment;
  if (!row) return null;
  const trace = data.trace;
  const remainingMinutes = Math.max(
    0,
    Math.ceil((row.current.endsAt - clock) / 60_000),
  );
  const remainingLabel = `${Math.floor(remainingMinutes / 60)}시간 ${remainingMinutes % 60}분 후 변경`;
  return (
    <div className={`${SURFACE_ACCENT} space-y-2 p-3`}>
      <div className="flex items-start gap-2">
        <Compass size={18} weight="duotone" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold">오늘의 현장 · {row.current.environment.label}</span>
            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-zinc-900 dark:text-emerald-300">
              {row.current.environment.effectLabel}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-zinc-600 dark:text-zinc-300">
            {row.current.environment.description}
          </p>
          <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
            {remainingLabel} · 다음 환경: {row.next.environment.label}
          </p>
        </div>
      </div>
      {trace ? (
        <div className={`${SURFACE_INSET} px-2.5 py-2 text-[11px]`}>
          흔적 조사 중 · {LIFE_FIELD_DISCOVERIES[trace.discoveryId].label} · {trace.progress}/{LIFE_FIELD_TRACE_REQUIRED_SUCCESSES}
          {` · ${lifeFieldTraceLocationText(trace, spotId)}`}
        </div>
      ) : null}
    </div>
  );
}

export function LifeFieldCodexPanel() {
  const { data, loading, error, refresh } =
    useLifeFieldStatus<LifeFieldCodexStatus>(
      "/api/v2/life-fields?view=codex",
    );
  const [abandoning, setAbandoning] = useState<LifeFieldActivity | null>(null);
  const grouped = useMemo(() => {
    if (!data) return null;
    return Object.fromEntries(
      (["fishing", "woodcutting", "mining"] as const).map((activity) => [
        activity,
        data.summary.entries.filter((entry) => entry.activity === activity),
      ]),
    ) as Record<LifeFieldActivity, LifeFieldRecordView[]>;
  }, [data]);
  const presentation = lifeFieldStatusPresentation({
    hasData: data !== null,
    loading,
    error,
  });

  const abandon = async (activity: LifeFieldActivity) => {
    if (!(await confirmGameAction("이 흔적을 포기할까요? 피티 수치는 복구되지 않습니다."))) return;
    setAbandoning(activity);
    try {
      await fetch("/api/v2/life-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "abandon_trace", activity }),
      });
      await refresh();
    } finally {
      setAbandoning(null);
    }
  };

  if (presentation === "loading") return <div className={`${SURFACE_CARD} p-6 text-center text-sm text-zinc-500`}>현장 기록을 불러오는 중…</div>;
  if (presentation === "error" || !data || !grouped) {
    return (
      <div className={`${SURFACE_CARD} p-6 text-center`}>
        <p className="text-sm text-zinc-500">현장 기록을 불러오지 못했습니다.</p>
        <button type="button" onClick={() => void refresh()} className="mt-3 rounded-md bg-zinc-900 px-3 py-2 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">다시 시도</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className={`${SURFACE_CARD} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">현장 기록</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              일반 {data.summary.basic.discovered}/{data.summary.basic.total} · 희귀 {data.summary.rare.discovered}/{data.summary.rare.total}
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            총 {data.summary.basic.discovered + data.summary.rare.discovered}/36
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {[
            ["5개", "5P · 배지"],
            ["15개", "10P · 현장 기록가"],
            ["30개", "20P · 배지"],
            ["33개", "30P · 생태 조사관"],
          ].map(([count, reward]) => (
            <div key={count} className={`${SURFACE_INSET} p-2`}><b>{count}</b><div className="mt-0.5 text-zinc-600 dark:text-zinc-300">{reward}</div></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">희귀 기록까지 36개를 모두 완성하면 히든 칭호 ‘대지의 목격자’를 획득합니다.</p>
      </section>

      {(["fishing", "woodcutting", "mining"] as const).map((activity) => {
        const trace = data.traces[activity];
        const daily = data.daily[activity];
        return (
          <section key={activity} className={`${SURFACE_CARD} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-bold">{ACTIVITY_LABEL[activity]} 기록</h3>
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">일일 흔적 탐색 {daily.evaluated}/{daily.limit}회{daily.paused ? " · 일시 정지" : ""}</p>
              </div>
              {trace ? (
                <button type="button" disabled={abandoning === activity} onClick={() => void abandon(activity)} className="rounded-md border border-rose-300 bg-white px-2 py-1 text-[11px] font-bold text-rose-600 disabled:opacity-50 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-300">흔적 포기</button>
              ) : null}
            </div>
            {trace ? (
              <div className="border-b border-zinc-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-zinc-800 dark:bg-amber-950 dark:text-amber-200">
                <Sparkle size={14} weight="fill" className="mr-1 inline" />
                {LIFE_FIELD_DISCOVERIES[trace.discoveryId].label} 흔적 · {trace.progress}/{LIFE_FIELD_TRACE_REQUIRED_SUCCESSES} · {lifeFieldTraceLocationText(trace)}
              </div>
            ) : null}
            <ul className="grid gap-2 p-3 sm:grid-cols-2">
              {grouped[activity].map((entry) => {
                const hidden = entry.rare && !entry.discovered;
                return (
                  <li key={entry.id} className={`${SURFACE_INSET} p-2.5`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold">{hidden ? "???" : entry.label}</div>
                        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{entry.discovered ? `${entry.count}회 관찰` : hidden ? "숨겨진 현장 기록" : entry.hint}</div>
                      </div>
                      {entry.medal ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-zinc-900 dark:text-amber-300"><Medal size={12} weight="fill" />{MEDAL_LABEL[entry.medal]}</span>
                      ) : (
                        <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">미등록</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
