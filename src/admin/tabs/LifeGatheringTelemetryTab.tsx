"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAsyncData } from "@/lib/useAsyncData";
import { useAdmin } from "../AdminContext";
import { adminGet } from "../api";
import { Button } from "../ui/Field";

type Activity = {
  activity: "fishing" | "woodcutting" | "mining" | "farming";
  attempts: number;
  successes: number;
  failures: number;
  successRate: number;
  uniqueUsers: number;
  primaryQuantity: number;
  bonusQuantity: number;
  sources: Array<{
    sourceId: string;
    name: string;
    attempts: number;
    successes: number;
    failures: number;
    successRate: number;
  }>;
  materials: Array<{
    materialId: string;
    name: string;
    quantity: number;
    primary: boolean;
  }>;
  daily: Array<{
    day: string;
    attempts: number;
    successes: number;
    primaryQuantity: number;
    bonusQuantity: number;
  }>;
  topUsers: Array<{
    userId: string;
    gameName: string | null;
    attempts: number;
    successes: number;
    quantity: number;
    activeMinutes: number;
    avgIntervalSec: number;
    intervalStddevSec: number;
  }>;
};

type TelemetryResponse = {
  ok: true;
  hours: number;
  since: string;
  until: string;
  truncated: boolean;
  guardTruncated: boolean;
  totals: {
    attempts: number;
    successes: number;
    failures: number;
    primaryQuantity: number;
    bonusQuantity: number;
  };
  activities: Activity[];
  guard: {
    totals: {
      required: number;
      succeeded: number;
      failed: number;
      behaviorPatterns: number;
    };
    topUsers: Array<{
      userId: string;
      gameName: string | null;
      required: number;
      succeeded: number;
      failed: number;
      behaviorPatterns: number;
      lastAt: string;
    }>;
    recent: Array<{
      userId: string | null;
      gameName: string | null;
      activity: "fishing" | "woodcutting" | "mining" | "farming";
      reason:
        | "human_verification_required"
        | "human_verification_succeeded"
        | "human_verification_failed"
        | "activity_behavior_pattern";
      detail: Record<string, unknown> | null;
      createdAt: string;
    }>;
  };
};

const PERIODS = [
  { hours: 24, label: "24시간" },
  { hours: 24 * 7, label: "7일" },
  { hours: 24 * 30, label: "30일" },
] as const;

const number = new Intl.NumberFormat("ko-KR");

export function LifeGatheringTelemetryTab() {
  const { showToast } = useAdmin();
  const [hours, setHours] = useState(24 * 7);
  const url = useMemo(
    () => `/api/admin/life-gathering-telemetry?hours=${hours}`,
    [hours],
  );
  const { data, loading, error, refetch } = useAsyncData<TelemetryResponse>(
    (signal) => adminGet(url, signal),
    [url],
  );

  useEffect(() => {
    if (error) showToast(`생활 수급 조회 실패: ${error}`);
  }, [error, showToast]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">벌목·채광 수급 현황</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            성공·실패 시도와 실제 획득한 주 재료·부산물을 집계합니다. 배포 이후 기록만 표시됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
            {PERIODS.map((period) => (
              <button
                key={period.hours}
                type="button"
                onClick={() => setHours(period.hours)}
                className={
                  hours === period.hours
                    ? "rounded bg-zinc-900 px-2.5 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "rounded px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }
              >
                {period.label}
              </button>
            ))}
          </div>
          <Button onClick={() => void refetch()} disabled={loading}>
            {loading ? "조회 중..." : "새로고침"}
          </Button>
        </div>
      </div>

      {data?.truncated ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          조회 결과가 10만 건을 넘어 일부만 집계했습니다. 기간을 줄여 확인해 주세요.
        </p>
      ) : null}
      {data?.guardTruncated ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          사람 확인·행동 패턴 기록이 2만 건을 넘어 최신 기록만 표시합니다.
        </p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="전체 시도" value={data.totals.attempts} />
            <Metric label="성공" value={data.totals.successes} />
            <Metric label="실패" value={data.totals.failures} />
            <Metric label="주 재료" value={data.totals.primaryQuantity} />
            <Metric label="부산물" value={data.totals.bonusQuantity} />
          </div>
          <p className="text-[11px] text-zinc-400">
            조회 범위 {new Date(data.since).toLocaleString("ko-KR")} ~ {new Date(data.until).toLocaleString("ko-KR")}
          </p>
          <GuardTelemetrySection data={data.guard} />
          {data.activities.map((activity) => (
            <ActivitySection key={activity.activity} data={activity} />
          ))}
        </>
      ) : (
        <p className="text-xs text-zinc-500">{loading ? "불러오는 중..." : "기록 없음"}</p>
      )}
    </section>
  );
}

function GuardTelemetrySection({ data }: { data: TelemetryResponse["guard"] }) {
  return (
    <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900 dark:bg-amber-950/10">
      <div>
        <h4 className="font-semibold">매크로 방어·사람 확인 이력</h4>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          인증 요구·성공·실패와 약한 행동 패턴 신호입니다. 행동 패턴만으로 자동 제재하지 않습니다.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SmallMetric label="인증 요구" value={data.totals.required} />
        <SmallMetric label="인증 성공" value={data.totals.succeeded} />
        <SmallMetric label="인증 실패" value={data.totals.failed} />
        <SmallMetric label="행동 패턴 신호" value={data.totals.behaviorPatterns} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="확인 대상 상위 계정">
          <DataTable
            headers={["유저", "요구", "성공", "실패", "패턴", "최근"]}
            empty={data.topUsers.length === 0}
          >
            {data.topUsers.map((row) => (
              <tr key={row.userId} className="border-t border-zinc-100 dark:border-zinc-800">
                <Cell>
                  {row.gameName ? (
                    <Link className="underline decoration-zinc-300 underline-offset-2" href={`/character/${encodeURIComponent(row.gameName)}`}>
                      {row.gameName}
                    </Link>
                  ) : row.userId.slice(0, 8)}
                </Cell>
                <NumberCell>{row.required}</NumberCell>
                <NumberCell>{row.succeeded}</NumberCell>
                <NumberCell>{row.failed}</NumberCell>
                <NumberCell>{row.behaviorPatterns}</NumberCell>
                <NumberCell>{new Date(row.lastAt).toLocaleString("ko-KR")}</NumberCell>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="최근 인증·패턴 기록">
          <DataTable
            headers={["시각", "유저", "활동", "결과", "상세"]}
            empty={data.recent.length === 0}
          >
            {data.recent.slice(0, 20).map((row, index) => (
              <tr key={`${row.createdAt}-${row.userId ?? "anonymous"}-${index}`} className="border-t border-zinc-100 dark:border-zinc-800">
                <Cell>{new Date(row.createdAt).toLocaleString("ko-KR")}</Cell>
                <Cell>{row.gameName ?? row.userId?.slice(0, 8) ?? "-"}</Cell>
                <Cell>{activityLabel(row.activity)}</Cell>
                <Cell>{guardReasonLabel(row.reason)}</Cell>
                <Cell>{guardDetail(row.detail)}</Cell>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
    </section>
  );
}

function activityLabel(activity: Activity["activity"]): string {
  return activity === "fishing"
    ? "낚시"
    : activity === "woodcutting"
      ? "벌목"
      : activity === "mining"
        ? "채광"
        : "농장";
}

function guardReasonLabel(reason: TelemetryResponse["guard"]["recent"][number]["reason"]): string {
  if (reason === "human_verification_required") return "인증 요구";
  if (reason === "human_verification_succeeded") return "인증 성공";
  if (reason === "human_verification_failed") return "인증 실패";
  return "행동 패턴";
}

export function guardDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return "-";
  const manualTest = detail.manualTest === true;
  const mode = detail.mode === "captcha"
    ? "2단계 hCaptcha"
    : detail.mode === "standard"
      ? "일반 확인"
      : null;
  const signal = typeof detail.signal === "string" ? detail.signal : null;
  const risk = Number(detail.riskScore);
  const target = Number(detail.nextCheckpointTarget ?? detail.checkpointTarget);
  const passes = Number(detail.dailyVerifications);
  return [
    manualTest ? "운영 테스트" : null,
    manualTest ? mode : null,
    signal ? `신호 ${signal}` : null,
    Number.isFinite(risk) ? `위험 ${risk}` : null,
    Number.isFinite(target) ? `다음 ${target}회` : null,
    Number.isFinite(passes) ? `오늘 인증 ${passes}회` : null,
  ].filter(Boolean).join(" · ") || "-";
}

function ActivitySection({ data }: { data: Activity }) {
  const label =
    data.activity === "fishing"
      ? "낚시"
      : data.activity === "woodcutting"
        ? "벌목"
        : data.activity === "mining"
          ? "채광"
          : "농장";
  const maxDaily = Math.max(
    1,
    ...data.daily.map((row) => row.primaryQuantity + row.bonusQuantity),
  );

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{label}</h4>
        <p className="text-xs text-zinc-500">
          {number.format(data.attempts)}회 시도 · 성공률 {data.successRate.toFixed(2)}% · {number.format(data.uniqueUsers)}명
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SmallMetric label="시도" value={data.attempts} />
        <SmallMetric label="성공" value={data.successes} />
        <SmallMetric label="실패" value={data.failures} />
        <SmallMetric label="성공률" value={`${data.successRate.toFixed(2)}%`} />
        <SmallMetric label="주 재료" value={data.primaryQuantity} />
        <SmallMetric label="부산물" value={data.bonusQuantity} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="대상별 성공률">
          <DataTable
            headers={["대상", "시도", "성공", "실패", "성공률"]}
            empty={data.sources.length === 0}
          >
            {data.sources.map((row) => (
              <tr key={row.sourceId} className="border-t border-zinc-100 dark:border-zinc-800">
                <Cell>{row.name}</Cell><NumberCell>{row.attempts}</NumberCell>
                <NumberCell>{row.successes}</NumberCell><NumberCell>{row.failures}</NumberCell>
                <NumberCell>{row.successRate.toFixed(2)}%</NumberCell>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="재료별 획득량">
          <DataTable headers={["재료", "구분", "수량"]} empty={data.materials.length === 0}>
            {data.materials.map((row) => (
              <tr key={row.materialId} className="border-t border-zinc-100 dark:border-zinc-800">
                <Cell>{row.name}</Cell><Cell>{row.primary ? "주 재료" : "부산물"}</Cell>
                <NumberCell>{number.format(row.quantity)}</NumberCell>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title="일별 수급량">
          {data.daily.length === 0 ? <Empty /> : (
            <div className="space-y-2">
              {data.daily.map((row) => {
                const total = row.primaryQuantity + row.bonusQuantity;
                return (
                  <div key={row.day} className="grid grid-cols-[78px_1fr_auto] items-center gap-2 text-xs">
                    <span className="font-mono text-[10px] text-zinc-500">{row.day}</span>
                    <div className="h-2 rounded bg-zinc-100 dark:bg-zinc-800">
                      <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.max(total > 0 ? 3 : 0, total / maxDaily * 100)}%` }} />
                    </div>
                    <span className="text-right tabular-nums">{number.format(total)}</span>
                    <span className="col-start-2 col-span-2 text-[10px] text-zinc-400">
                      주 {number.format(row.primaryQuantity)} · 부산물 {number.format(row.bonusQuantity)} · 성공 {number.format(row.successes)}/{number.format(row.attempts)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel title="유저별 수급량 상위 10명">
          <DataTable
            headers={["유저", "시도", "성공", "획득량", "활동 분", "평균/편차"]}
            empty={data.topUsers.length === 0}
          >
            {data.topUsers.map((row) => (
              <tr key={row.userId} className="border-t border-zinc-100 dark:border-zinc-800">
                <Cell>{row.gameName ? <Link className="underline decoration-zinc-300 underline-offset-2" href={`/character/${encodeURIComponent(row.gameName)}`}>{row.gameName}</Link> : row.userId.slice(0, 8)}</Cell>
                <NumberCell>{row.attempts}</NumberCell><NumberCell>{row.successes}</NumberCell>
                <NumberCell>{number.format(row.quantity)}</NumberCell>
                <NumberCell>{number.format(row.activeMinutes)}</NumberCell>
                <NumberCell>
                  {row.avgIntervalSec.toFixed(1)}s/{row.intervalStddevSec.toFixed(1)}s
                </NumberCell>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"><div className="text-[11px] text-zinc-500">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{number.format(value)}</div></div>;
}

function SmallMetric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-md bg-zinc-50 px-2.5 py-2 dark:bg-zinc-950"><div className="text-[10px] text-zinc-500">{label}</div><div className="mt-0.5 text-sm font-medium tabular-nums">{typeof value === "number" ? number.format(value) : value}</div></div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"><h5 className="mb-2 text-xs font-semibold">{title}</h5>{children}</section>;
}

function DataTable({ headers, empty, children }: { headers: string[]; empty: boolean; children: ReactNode }) {
  if (empty) return <Empty />;
  return <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-zinc-500"><tr>{headers.map((header, index) => <th key={header} className={`${index > 0 ? "text-right " : ""}px-2 py-1 font-medium`}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="px-2 py-1.5">{children}</td>;
}

function NumberCell({ children }: { children: ReactNode }) {
  return <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{children}</td>;
}

function Empty() {
  return <p className="py-2 text-xs text-zinc-500">기록 없음</p>;
}
