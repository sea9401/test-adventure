"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Field, Select, TextInput } from "../ui/Field";
import type { GridDungeonRouteId } from "@/adventure/data/v2/gridDungeon";

type Outcome = "cleared" | "failed" | "abandoned";
type RouteFilter = GridDungeonRouteId | "all";
type OutcomeFilter = Outcome | "all";
type PeriodFilter = "1" | "7" | "30" | "90" | "all";
type BalanceRiskLevel = "ok" | "low_sample" | "too_hard" | "too_easy";
type BalanceSeverity = "danger" | "warning" | "info";
type TuningPriority = "high" | "medium" | "low";

type GridDungeonAnalytics = {
  filters: {
    sinceAt: number | null;
    query: string;
  };
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
    avgRemainingHp: number;
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
    failureRatePct: number;
    bossReachRatePct: number;
    avgRemainingHp: number;
    avgCombatTurns: number;
    avgCombatCount: number;
    avgPartySize: number;
    avgRewardGold: number;
    avgMaterials: number;
    avgDurationSec: number;
    riskLevel: BalanceRiskLevel;
    riskLabel: string;
    riskReason: string;
  }>;
  partySizes: Array<{
    partySize: number;
    runs: number;
    cleared: number;
    failed: number;
    clearRatePct: number;
    failureRatePct: number;
    bossReachRatePct: number;
    avgRemainingHp: number;
    avgCombatTurns: number;
    avgRewardGold: number;
  }>;
  routeParties: Array<{
    routeId: GridDungeonRouteId;
    routeName: string;
    partySize: number;
    runs: number;
    cleared: number;
    failed: number;
    abandoned: number;
    clearRatePct: number;
    failureRatePct: number;
    bossReachRatePct: number;
    avgRemainingHp: number;
    avgCombatTurns: number;
    avgRewardGold: number;
    avgMaterials: number;
    riskLevel: BalanceRiskLevel;
    riskLabel: string;
    riskReason: string;
  }>;
  balanceFlags: Array<{
    id: string;
    severity: BalanceSeverity;
    title: string;
    detail: string;
    action: string;
    routeId?: GridDungeonRouteId;
    partySize?: number;
  }>;
  tuningCandidates: Array<{
    id: string;
    priority: TuningPriority;
    title: string;
    detail: string;
    action: string;
    routeId?: GridDungeonRouteId;
    partySize?: number;
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

const RISK_TONE: Record<BalanceRiskLevel, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  low_sample:
    "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300",
  too_hard:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  too_easy:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
};

const SEVERITY_TONE: Record<BalanceSeverity, string> = {
  danger:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
};

const PRIORITY_TONE: Record<TuningPriority, string> = {
  high: SEVERITY_TONE.danger,
  medium: SEVERITY_TONE.warning,
  low: SEVERITY_TONE.info,
};

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "1", label: "최근 1일" },
  { value: "7", label: "최근 7일" },
  { value: "30", label: "최근 30일" },
  { value: "90", label: "최근 90일" },
  { value: "all", label: "전체" },
];

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

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildRecentRunsCsv(runs: GridDungeonAnalytics["recentRuns"]): string {
  const headers = [
    "time",
    "user",
    "outcome",
    "route",
    "partySize",
    "bossReached",
    "combatCount",
    "totalCombatTurns",
    "rewardGold",
    "materials",
    "durationSec",
  ];
  const rows = runs.map((run) => [
    new Date(run.at).toISOString(),
    run.userName,
    OUTCOME_LABEL[run.outcome],
    run.routeName,
    run.partySize,
    run.bossReached ? "Y" : "N",
    run.combatCount,
    run.totalCombatTurns,
    run.rewardGold,
    run.materialCount,
    Math.round(run.durationMs / 1000),
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
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

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: string;
}) {
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${tone}`}>
      {children}
    </span>
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
  const [period, setPeriod] = useState<PeriodFilter>("30");
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [expandedRoute, setExpandedRoute] = useState<RouteFilter>("all");
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ days: period });
    const q = appliedSearch.trim();
    if (q) params.set("q", q);
    fetch(`/api/admin/grid-dungeon-analytics?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<GridDungeonAnalytics>;
      })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [appliedSearch, period]);

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
  const expandedRouteData =
    expandedRoute === "all"
      ? null
      : (data?.routes.find((route) => route.routeId === expandedRoute) ?? null);
  const copyCsv = useCallback(async () => {
    const csv = buildRecentRunsCsv(filteredRecent);
    if (!csv) return;
    try {
      await navigator.clipboard.writeText(csv);
      setExportMessage(`${filteredRecent.length.toLocaleString()}건 CSV 복사 완료`);
    } catch {
      setExportMessage("브라우저가 클립보드 복사를 허용하지 않습니다.");
    }
  }, [filteredRecent]);
  const downloadCsv = useCallback(() => {
    const csv = buildRecentRunsCsv(filteredRecent);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `grid-dungeon-runs-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportMessage(`${filteredRecent.length.toLocaleString()}건 CSV 다운로드 시작`);
  }, [filteredRecent]);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">격자 던전 분석</h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              최근 탐험 이력 기준 루트·파티·보스 도달 집계
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="기간">
              <Select<PeriodFilter>
                value={period}
                onChange={setPeriod}
                disabled={loading}
                options={PERIOD_OPTIONS}
                className="min-w-32"
              />
            </Field>
            <Field label="유저 검색">
              <TextInput
                value={searchDraft}
                onChange={setSearchDraft}
                placeholder="닉네임 또는 user id"
                disabled={loading}
                className="min-w-44"
              />
            </Field>
            <Button
              onClick={() => setAppliedSearch(searchDraft.trim())}
              disabled={loading}
            >
              검색 적용
            </Button>
            <Button onClick={load} disabled={loading}>
              {loading ? "로딩…" : "새로고침"}
            </Button>
          </div>
        </div>
        {error ? (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}
        {data ? (
          <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            서버 필터:{" "}
            {data.filters.sinceAt
              ? `${formatRunTime(data.filters.sinceAt)} 이후`
              : "전체 기간"}
            {data.filters.query ? ` · 검색 "${data.filters.query}"` : ""}
          </div>
        ) : null}
        {data ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-9">
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
              label="잔여 HP"
              value={data.summary.avgRemainingHp.toLocaleString()}
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
                      <th className="py-1 pr-2 font-medium">위험</th>
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
                        <td className="py-1 pr-2 font-sans">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRoute((current) =>
                                current === route.routeId ? "all" : route.routeId,
                              )
                            }
                            className="text-left underline-offset-2 hover:underline"
                          >
                            {route.routeName}
                          </button>
                        </td>
                        <td className="py-1 pr-2 font-sans">
                          <Badge tone={RISK_TONE[route.riskLevel]}>
                            {route.riskLabel}
                          </Badge>
                        </td>
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
              {expandedRouteData ? (
                <div className="mt-3 grid grid-cols-2 gap-2 rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-4">
                  <StatCard
                    label="선택 루트"
                    value={expandedRouteData.routeName}
                  />
                  <StatCard
                    label="평균 전투 수"
                    value={`${expandedRouteData.avgCombatCount.toLocaleString()}회`}
                  />
                  <StatCard
                    label="위험 판단"
                    value={expandedRouteData.riskLabel}
                  />
                  <StatCard
                    label="평균 파티"
                    value={`${expandedRouteData.avgPartySize.toLocaleString()}명`}
                  />
                  <StatCard
                    label="평균 소요"
                    value={formatDurationSec(expandedRouteData.avgDurationSec)}
                  />
                  <StatCard
                    label="클리어/실패/포기"
                    value={`${expandedRouteData.cleared}/${expandedRouteData.failed}/${expandedRouteData.abandoned}`}
                  />
                  <StatCard
                    label="실패율"
                    value={`${expandedRouteData.failureRatePct}%`}
                  />
                  <StatCard
                    label="잔여 HP"
                    value={expandedRouteData.avgRemainingHp.toLocaleString()}
                  />
                  <StatCard
                    label="평균 재료"
                    value={expandedRouteData.avgMaterials.toLocaleString()}
                  />
                  <StatCard
                    label="보스 도달률"
                    value={`${expandedRouteData.bossReachRatePct}%`}
                  />
                  <StatCard
                    label="클리어율"
                    value={`${expandedRouteData.clearRatePct}%`}
                  />
                  <StatCard label="사유" value={expandedRouteData.riskReason} />
                </div>
              ) : null}
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
                          <th className="py-1 pr-2 text-right font-medium">
                            실패
                          </th>
                          <th className="py-1 pr-2 text-right font-medium">보스</th>
                          <th className="py-1 pr-2 text-right font-medium">
                            HP
                          </th>
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
                              {party.failureRatePct}%
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {party.bossReachRatePct}%
                            </td>
                            <td className="py-1 pr-2 text-right">
                              {party.avgRemainingHp}
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

          <Card title="루트×파티 규모">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="py-1 pr-2 font-medium">루트</th>
                    <th className="py-1 pr-2 text-right font-medium">파티</th>
                    <th className="py-1 pr-2 text-right font-medium">탐험</th>
                    <th className="py-1 pr-2 text-right font-medium">클리어</th>
                    <th className="py-1 pr-2 text-right font-medium">실패</th>
                    <th className="py-1 pr-2 text-right font-medium">보스</th>
                    <th className="py-1 pr-2 text-right font-medium">HP</th>
                    <th className="py-1 pr-2 font-medium">판정</th>
                    <th className="py-1 font-medium">사유</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {data.routeParties.map((row) => (
                    <tr
                      key={`${row.routeId}:${row.partySize}`}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-1 pr-2 font-sans">{row.routeName}</td>
                      <td className="py-1 pr-2 text-right">{row.partySize}명</td>
                      <td className="py-1 pr-2 text-right">{row.runs}</td>
                      <td className="py-1 pr-2 text-right">
                        {row.clearRatePct}%
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {row.failureRatePct}%
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {row.bossReachRatePct}%
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {row.avgRemainingHp}
                      </td>
                      <td className="py-1 pr-2 font-sans">
                        <Badge tone={RISK_TONE[row.riskLevel]}>
                          {row.riskLabel}
                        </Badge>
                      </td>
                      <td className="py-1 font-sans text-zinc-600 dark:text-zinc-300">
                        {row.riskReason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="위험 표시">
              {data.balanceFlags.length ? (
                <div className="space-y-2">
                  {data.balanceFlags.map((flag) => (
                    <div
                      key={flag.id}
                      className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={SEVERITY_TONE[flag.severity]}>
                          {flag.severity === "danger"
                            ? "위험"
                            : flag.severity === "warning"
                              ? "주의"
                              : "확인"}
                        </Badge>
                        <span className="font-semibold">{flag.title}</span>
                        {flag.partySize ? (
                          <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                            {flag.partySize}명
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-zinc-600 dark:text-zinc-300">
                        {flag.detail}
                      </div>
                      <div className="mt-1 text-zinc-500 dark:text-zinc-400">
                        {flag.action}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  과위험/과쉬움 신호 없음
                </div>
              )}
            </Card>

            <Card title="튜닝 후보">
              {data.tuningCandidates.length ? (
                <div className="space-y-2">
                  {data.tuningCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={PRIORITY_TONE[candidate.priority]}>
                          {candidate.priority === "high"
                            ? "높음"
                            : candidate.priority === "medium"
                              ? "중간"
                              : "낮음"}
                        </Badge>
                        <span className="font-semibold">{candidate.title}</span>
                      </div>
                      <div className="mt-1 text-zinc-600 dark:text-zinc-300">
                        {candidate.detail}
                      </div>
                      <div className="mt-1 text-zinc-500 dark:text-zinc-400">
                        {candidate.action}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  즉시 조정 후보 없음
                </div>
              )}
            </Card>
          </div>

          <Card title="최근 탐험 로그">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
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
              <div className="flex flex-wrap gap-2">
                <Button onClick={copyCsv} disabled={filteredRecent.length === 0}>
                  CSV 복사
                </Button>
                <Button
                  onClick={downloadCsv}
                  disabled={filteredRecent.length === 0}
                >
                  CSV 다운로드
                </Button>
              </div>
            </div>
            {exportMessage ? (
              <div className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                {exportMessage}
              </div>
            ) : null}
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
