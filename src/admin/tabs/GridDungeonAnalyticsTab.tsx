"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Field, Select } from "../ui/Field";
import type { GridDungeonRouteId } from "@/adventure/data/v2/gridDungeon";

type Outcome = "cleared" | "failed" | "abandoned";
type RouteFilter = GridDungeonRouteId | "all";
type OutcomeFilter = Outcome | "all";

type GridDungeonAnalytics = {
  summary: {
    users: number;
    usersWithHistory: number;
    runs: number;
    cleared: number;
    failed: number;
    abandoned: number;
    clearRatePct: number;
    bossReachRatePct: number;
    avgCombatTurns: number;
    avgPartySize: number;
    avgRewardGold: number;
    avgMaterials: number;
    avgDurationSec: number;
    adminExcluded: number;
  };
  routes: Array<{
    routeId: GridDungeonRouteId;
    routeName: string;
    runs: number;
    cleared: number;
    failed: number;
    abandoned: number;
    clearRatePct: number;
    bossReachRatePct: number;
    avgCombatTurns: number;
    avgCombatCount: number;
    avgPartySize: number;
    avgRewardGold: number;
    avgMaterials: number;
    avgDurationSec: number;
  }>;
  partySizes: Array<{
    partySize: number;
    runs: number;
    cleared: number;
    clearRatePct: number;
    bossReachRatePct: number;
    avgCombatTurns: number;
    avgRewardGold: number;
  }>;
  recentRuns: Array<{
    id: string;
    userId: string;
    userName: string;
    outcome: Outcome;
    routeId: GridDungeonRouteId;
    routeName: string;
    at: number;
    rewardGold: number;
    materialCount: number;
    exploredTiles: number;
    hp: number;
    partySize: number;
    bossReached: boolean;
    combatCount: number;
    totalCombatTurns: number;
    durationMs: number;
  }>;
};

const OUTCOME_LABEL: Record<Outcome, string> = {
  cleared: "클리어",
  failed: "실패",
  abandoned: "포기",
};

const OUTCOME_TONE: Record<Outcome, string> = {
  cleared:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  abandoned:
    "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
};

function formatDurationSec(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}분 ${r}초` : `${m}분`;
}

function formatRunTime(at: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(at));
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="font-mono text-base tabular-nums">{value}</div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function BarRow({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <div className="w-32 shrink-0 truncate text-zinc-600 dark:text-zinc-300">
        {label}
      </div>
      <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
        <div
          className="h-full rounded bg-cyan-500/70 dark:bg-cyan-400/60"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-24 shrink-0 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-200">
        {value.toLocaleString()}
        {suffix ?? ""}
      </div>
    </div>
  );
}

export function GridDungeonAnalyticsTab() {
  const [data, setData] = useState<GridDungeonAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/grid-dungeon-analytics")
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<GridDungeonAnalytics>;
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch
    load();
  }, [load]);

  const routeMax = Math.max(1, ...(data?.routes ?? []).map((r) => r.runs));
  const partyMax = Math.max(1, ...(data?.partySizes ?? []).map((p) => p.runs));
  const filteredRecent = useMemo(() => {
    return (data?.recentRuns ?? []).filter((run) => {
      if (routeFilter !== "all" && run.routeId !== routeFilter) return false;
      if (outcomeFilter !== "all" && run.outcome !== outcomeFilter) return false;
      return true;
    });
  }, [data?.recentRuns, outcomeFilter, routeFilter]);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">격자 던전 분석</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              최근 탐험 이력 기준 루트·파티·보스 도달 집계
            </p>
          </div>
          <Button onClick={load} disabled={loading}>
            {loading ? "로딩…" : "새로고침"}
          </Button>
        </div>
        {error ? (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}
        {data ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <StatCard label="탐험 수" value={data.summary.runs.toLocaleString()} />
            <StatCard
              label="클리어율"
              value={`${data.summary.clearRatePct.toLocaleString()}%`}
            />
            <StatCard
              label="보스 도달"
              value={`${data.summary.bossReachRatePct.toLocaleString()}%`}
            />
            <StatCard
              label="평균 턴"
              value={data.summary.avgCombatTurns.toLocaleString()}
            />
            <StatCard
              label="평균 파티"
              value={`${data.summary.avgPartySize.toLocaleString()}명`}
            />
            <StatCard
              label="평균 골드"
              value={`${data.summary.avgRewardGold.toLocaleString()}G`}
            />
            <StatCard
              label="평균 재료"
              value={data.summary.avgMaterials.toLocaleString()}
            />
            <StatCard
              label="기록 유저"
              value={`${data.summary.usersWithHistory.toLocaleString()} / ${data.summary.users.toLocaleString()}`}
            />
          </div>
        ) : null}
      </section>

      {data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="루트별 결과">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-zinc-500 dark:text-zinc-400">
                      <th className="py-1 pr-2 font-medium">루트</th>
                      <th className="py-1 pr-2 text-right font-medium">탐험</th>
                      <th className="py-1 pr-2 text-right font-medium">클리어</th>
                      <th className="py-1 pr-2 text-right font-medium">실패</th>
                      <th className="py-1 pr-2 text-right font-medium">보스</th>
                      <th className="py-1 pr-2 text-right font-medium">턴</th>
                      <th className="py-1 text-right font-medium">골드</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular-nums">
                    {data.routes.map((route) => (
                      <tr
                        key={route.routeId}
                        className="border-t border-zinc-100 dark:border-zinc-800"
                      >
                        <td className="py-1 pr-2 font-sans">{route.routeName}</td>
                        <td className="py-1 pr-2 text-right">{route.runs}</td>
                        <td className="py-1 pr-2 text-right">
                          {route.clearRatePct}%
                        </td>
                        <td className="py-1 pr-2 text-right">
                          {route.failed} / {route.abandoned}
                        </td>
                        <td className="py-1 pr-2 text-right">
                          {route.bossReachRatePct}%
                        </td>
                        <td className="py-1 pr-2 text-right">
                          {route.avgCombatTurns}
                        </td>
                        <td className="py-1 text-right">
                          {route.avgRewardGold.toLocaleString()}G
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2">
                {data.routes.map((route) => (
                  <BarRow
                    key={`bar-${route.routeId}`}
                    label={route.routeName}
                    value={route.runs}
                    max={routeMax}
                    suffix={` · ${route.clearRatePct}%`}
                  />
                ))}
              </div>
            </Card>

            <Card title="파티 인원별 결과">
              {data.partySizes.length ? (
                <>
                  {data.partySizes.map((party) => (
                    <BarRow
                      key={party.partySize}
                      label={`${party.partySize}명`}
                      value={party.runs}
                      max={partyMax}
                      suffix={` · ${party.clearRatePct}%`}
                    />
                  ))}
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-zinc-500 dark:text-zinc-400">
                          <th className="py-1 pr-2 font-medium">파티</th>
                          <th className="py-1 pr-2 text-right font-medium">탐험</th>
                          <th className="py-1 pr-2 text-right font-medium">
                            클리어
                          </th>
                          <th className="py-1 pr-2 text-right font-medium">보스</th>
                          <th className="py-1 pr-2 text-right font-medium">턴</th>
                          <th className="py-1 text-right font-medium">골드</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono tabular-nums">
                        {data.partySizes.map((party) => (
                          <tr
                            key={`row-${party.partySize}`}
                            className="border-t border-zinc-100 dark:border-zinc-800"
                          >
                            <td className="py-1 pr-2 font-sans">
                              {party.partySize}명
                            </td>
                            <td className="py-1 pr-2 text-right">{party.runs}</td>
                            <td className="py-1 pr-2 text-right">
                              {party.clearRatePct}%
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {party.bossReachRatePct}%
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {party.avgCombatTurns}
                            </td>
                            <td className="py-1 text-right">
                              {party.avgRewardGold.toLocaleString()}G
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  파티 집계 없음
                </div>
              )}
            </Card>
          </div>

          <Card title="최근 탐험 로그">
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <Field label="루트">
                <Select<RouteFilter>
                  value={routeFilter}
                  onChange={setRouteFilter}
                  options={[
                    { value: "all", label: "전체" },
                    ...data.routes.map((route) => ({
                      value: route.routeId,
                      label: route.routeName,
                    })),
                  ]}
                />
              </Field>
              <Field label="결과">
                <Select<OutcomeFilter>
                  value={outcomeFilter}
                  onChange={setOutcomeFilter}
                  options={[
                    { value: "all", label: "전체" },
                    { value: "cleared", label: "클리어" },
                    { value: "failed", label: "실패" },
                    { value: "abandoned", label: "포기" },
                  ]}
                />
              </Field>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="py-1 pr-2 font-medium">시간</th>
                    <th className="py-1 pr-2 font-medium">유저</th>
                    <th className="py-1 pr-2 font-medium">결과</th>
                    <th className="py-1 pr-2 font-medium">루트</th>
                    <th className="py-1 pr-2 text-right font-medium">파티</th>
                    <th className="py-1 pr-2 text-right font-medium">보스</th>
                    <th className="py-1 pr-2 text-right font-medium">전투</th>
                    <th className="py-1 pr-2 text-right font-medium">보상</th>
                    <th className="py-1 text-right font-medium">소요</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecent.map((run) => (
                    <tr
                      key={`${run.userId}:${run.id}`}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-1 pr-2 whitespace-nowrap font-mono tabular-nums">
                        {formatRunTime(run.at)}
                      </td>
                      <td className="py-1 pr-2">{run.userName}</td>
                      <td className="py-1 pr-2">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] ${OUTCOME_TONE[run.outcome]}`}
                        >
                          {OUTCOME_LABEL[run.outcome]}
                        </span>
                      </td>
                      <td className="py-1 pr-2">{run.routeName}</td>
                      <td className="py-1 pr-2 text-right font-mono tabular-nums">
                        {run.partySize}명
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {run.bossReached ? "도달" : "미도달"}
                      </td>
                      <td className="py-1 pr-2 text-right font-mono tabular-nums">
                        {run.combatCount}회 · {run.totalCombatTurns}턴
                      </td>
                      <td className="py-1 pr-2 text-right font-mono tabular-nums">
                        {run.rewardGold.toLocaleString()}G · {run.materialCount}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums">
                        {formatDurationSec(Math.round(run.durationMs / 1000))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredRecent.length === 0 ? (
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                조건에 맞는 기록이 없습니다.
              </div>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
