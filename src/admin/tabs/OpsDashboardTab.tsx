"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAdmin } from "../AdminContext";
import { adminGet } from "../api";
import { Button } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";

type CountRow = { key: string; count: number };

type Dashboard = {
  generatedAt: string;
  abuse: {
    last5m: number;
    last1h: number;
    last24h: number;
    rateLimited24h: number;
    topActions: CountRow[];
    topIps: CountRow[];
    topUsers: CountRow[];
  };
  economy: {
    last1h: number;
    last24h: number;
    goldIn24h: number;
    goldOut24h: number;
    topEvents: CountRow[];
    topItems: CountRow[];
  };
  audit: {
    last24h: number;
    latest: Array<{
      id: number;
      adminEmail: string;
      action: string;
      targetUserId: string | null;
      createdAt: string;
    }>;
  };
  slowQueryCandidates: Array<{
    key: string;
    status: string;
    cacheTtlSec: number;
    note: string;
  }>;
};

export function OpsDashboardTab() {
  const { showToast } = useAdmin();
  const { data, loading, error, refetch } = useAsyncData<{ ok: true } & Dashboard>(
    (signal) => adminGet("/api/admin/ops-dashboard", signal),
  );

  useEffect(() => {
    if (error) showToast(`조회 실패: ${error}`);
  }, [error, showToast]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">운영 현황판</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            최근 24시간 기준 이상 행동, 경제 이벤트, 관리자 변경 흐름을 봅니다.
          </p>
        </div>
        <Button onClick={() => void refetch()} disabled={loading}>
          {loading ? "조회 중..." : "새로고침"}
        </Button>
      </div>

      {!data ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중..." : "데이터 없음"}
        </p>
      ) : (
        <>
          <div className="grid gap-2 md:grid-cols-4">
            <Metric label="제한 초과 5분" value={data.abuse.last5m} />
            <Metric label="제한 초과 1시간" value={data.abuse.last1h} />
            <Metric label="경제 이벤트 1시간" value={data.economy.last1h} />
            <Metric label="관리자 변경 24시간" value={data.audit.last24h} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="이상 행동 Top">
              <CountList rows={data.abuse.topActions} empty="action 없음" />
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <MiniList title="IP" rows={data.abuse.topIps} />
                <MiniList title="유저" rows={data.abuse.topUsers} />
              </div>
            </Panel>
            <Panel title="경제 이벤트">
              <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
                <Metric label="골드 유입 24시간" value={data.economy.goldIn24h} />
                <Metric label="골드 유출 24시간" value={data.economy.goldOut24h} />
              </div>
              <CountList rows={data.economy.topEvents} empty="event 없음" />
            </Panel>
          </div>

          <Panel title="느린 쿼리 후보">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-1 pr-3 font-medium">key</th>
                    <th className="py-1 pr-3 font-medium">상태</th>
                    <th className="py-1 pr-3 font-medium">TTL</th>
                    <th className="py-1 pr-3 font-medium">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slowQueryCandidates.map((row) => (
                    <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1 pr-3 font-mono">{row.key}</td>
                      <td className="py-1 pr-3">{row.status}</td>
                      <td className="py-1 pr-3 tabular-nums">{row.cacheTtlSec}s</td>
                      <td className="py-1 pr-3 text-zinc-500">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h4 className="mb-2 text-xs font-semibold">{title}</h4>
      {children}
    </section>
  );
}

function CountList({ rows, empty }: { rows: CountRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">{empty}</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-mono">{row.key}</span>
          <span className="shrink-0 tabular-nums text-zinc-500">{row.count.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function MiniList({ title, rows }: { title: string; rows: CountRow[] }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-zinc-500">{title}</div>
      <CountList rows={rows} empty="없음" />
    </div>
  );
}
