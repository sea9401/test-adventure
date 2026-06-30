"use client";

import { useMemo } from "react";
import type { EnrichedRow } from "./useAdminStats";

// 상단 KPI 카드 그리드 — "유저 진척 통계" 섹션 안에 들어간다.
export function StatsKpiCards({ rows }: { rows: EnrichedRow[] }) {
  const summary = useMemo(() => buildSummary(rows), [rows]);
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
      <Card label="유저 수" value={`${summary.count}명`} />
      <Card label="평균 레벨" value={summary.avgLevel.toFixed(1)} />
      <Card
        label="평균 프론티어"
        value={summary.avgFrontier.toFixed(1)}
      />
      <Card
        label="최고 프론티어"
        value={summary.maxFrontier.toLocaleString()}
      />
      <Card label="평균 총 숙련도" value={summary.avgMastery.toLocaleString()} />
      <Card label="환생 유저" value={`${summary.reincarnatedCount}명`} />
      <Card label="평균 SP 사용" value={`${summary.avgSpUsed}/${summary.avgSpBudget}`} />
      <Card label="낚시 참여" value={`${summary.fishingPlayers}명`} />
      <Card label="최근 24h 활동" value={`${summary.activeIn24h}명`} />
      <Card label="최근 7d 활동" value={`${summary.activeIn7d}명`} />
    </div>
  );
}

// 현재 코어루프 진척 분포 — 프론티어·직업·SP·생활.
export function StatsDistributions({ rows }: { rows: EnrichedRow[] }) {
  const summary = useMemo(() => buildSummary(rows), [rows]);
  const frontierHistogram = useMemo(() => buildFrontierHistogram(rows), [rows]);
  const jobTierHistogram = useMemo(() => buildJobTierHistogram(rows), [rows]);
  const spPressure = useMemo(() => buildSpPressure(rows), [rows]);

  return (
    <>
      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">프론티어 분포</h2>
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          현재 사냥터 해금 깊이 기준입니다. 막대는 인원, 오른쪽은 해당 구간 평균 총 숙련도입니다.
        </p>
        <div className="mt-2 space-y-0.5">
          {frontierHistogram.map((b) => (
            <Bar
              key={b.bucket}
              label={b.label}
              count={b.count}
              max={summary.maxFrontierBucket}
              suffix={b.avgMastery ? ` · 숙련 ${b.avgMastery.toLocaleString()}` : ""}
            />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">현재 직업 티어</h2>
          <div className="mt-2 space-y-0.5">
            {jobTierHistogram.map((b) => (
              <Bar
                key={b.label}
                label={b.label}
                count={b.count}
                max={summary.maxJobTierBucket}
              />
            ))}
          </div>
        </section>

        <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold">SP 로드아웃 압박</h2>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            장착 SP / 예산 비율입니다. 80% 이상은 빌드 폭이 거의 찬 상태로 봅니다.
          </p>
          <div className="mt-2 space-y-0.5">
            {spPressure.map((b) => (
              <Bar
                key={b.label}
                label={b.label}
                count={b.count}
                max={summary.maxSpPressureBucket}
              />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function buildSummary(rows: EnrichedRow[]) {
  const count = rows.length;
  const levels = rows.map((r) => r.level ?? 0);
  const frontier = rows.map((r) => r.frontierDepth);
  const mastery = rows.map((r) => r.totalMastery);
  const spBudgets = rows.map((r) => r.spBudget);
  const spUsed = rows.map((r) => r.spUsed);
  const frontierBuckets = buildFrontierHistogram(rows).map((b) => b.count);
  const jobTierBuckets = buildJobTierHistogram(rows).map((b) => b.count);
  const spPressureBuckets = buildSpPressure(rows).map((b) => b.count);
  const avg = (values: number[]) =>
    values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;

  return {
    count,
    avgLevel: avg(levels),
    avgFrontier: avg(frontier),
    maxFrontier: frontier.length ? Math.max(...frontier) : 0,
    avgMastery: Math.round(avg(mastery)),
    reincarnatedCount: rows.filter((r) => r.reincarnations > 0).length,
    avgSpBudget: Math.round(avg(spBudgets)),
    avgSpUsed: Math.round(avg(spUsed)),
    fishingPlayers: rows.filter((r) => r.fishCaught > 0).length,
    activeIn24h: rows.filter(
      (r) => r.hoursSinceLastSeen != null && r.hoursSinceLastSeen <= 24,
    ).length,
    activeIn7d: rows.filter(
      (r) => r.hoursSinceLastSeen != null && r.hoursSinceLastSeen <= 24 * 7,
    ).length,
    maxFrontierBucket: Math.max(1, ...frontierBuckets),
    maxJobTierBucket: Math.max(1, ...jobTierBuckets),
    maxSpPressureBucket: Math.max(1, ...spPressureBuckets),
  };
}

function buildFrontierHistogram(rows: EnrichedRow[]) {
  const buckets = new Map<number, { count: number; mastery: number }>();
  for (const r of rows) {
    const depth = Math.max(0, r.frontierDepth);
    const b = Math.floor(depth / 6) * 6;
    const cur = buckets.get(b) ?? { count: 0, mastery: 0 };
    buckets.set(b, { count: cur.count + 1, mastery: cur.mastery + r.totalMastery });
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([b, v]) => ({
      bucket: b,
      label: b === 0 ? "미도달" : `${b}~${b + 5}층`,
      count: v.count,
      avgMastery: v.count ? Math.round(v.mastery / v.count) : 0,
    }));
}

function buildJobTierHistogram(rows: EnrichedRow[]) {
  const buckets = new Map<number, number>();
  for (const r of rows) {
    const tier = r.jobTier ?? 0;
    buckets.set(tier, (buckets.get(tier) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([tier, count]) => ({
      label: tier === 0 ? "모험가/미선택" : `T${tier}`,
      count,
    }));
}

function buildSpPressure(rows: EnrichedRow[]) {
  const buckets = [
    { label: "0%", min: 0, max: 0, count: 0 },
    { label: "1~49%", min: 0.00001, max: 0.49, count: 0 },
    { label: "50~79%", min: 0.5, max: 0.79, count: 0 },
    { label: "80~99%", min: 0.8, max: 0.99, count: 0 },
    { label: "100%+", min: 1, max: Infinity, count: 0 },
  ];
  for (const r of rows) {
    const ratio = r.spBudget > 0 ? r.spUsed / r.spBudget : 0;
    const b = buckets.find((x) => ratio >= x.min && ratio <= x.max);
    if (b) b.count++;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

function Bar({
  label,
  count,
  max,
  suffix,
}: {
  label: string;
  count: number;
  max: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-24 font-mono text-zinc-500">{label}</span>
      <div
        className="h-3 rounded bg-emerald-500/70 dark:bg-emerald-400/70"
        style={{ width: `${(count / max) * 100}%` }}
      />
      <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
        {count}
        {suffix ?? ""}
      </span>
    </div>
  );
}
