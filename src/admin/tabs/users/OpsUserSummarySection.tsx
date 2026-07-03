"use client";

import { useEffect } from "react";
import { adminGet } from "../../api";
import { Button } from "../../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";

type OpsEventRow = {
  id: number;
  eventType: string;
  goldDelta: number;
  itemKind: string | null;
  itemId: string | null;
  quantity: number | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

type OpsSummary = {
  summary: {
    gold: number;
    bankedGold: number;
    fishingCoins: number;
    treasureCoins: number;
    masteryCertificates: number;
    staminaPotions: number;
  };
  rewardHistory: OpsEventRow[];
  proficiencyHistory: OpsEventRow[];
  recentEconomy: OpsEventRow[];
};

export function OpsUserSummarySection({ userId }: { userId: string }) {
  const { data, loading, error, refetch } = useAsyncData<OpsSummary>(
    (signal) =>
      adminGet(
        `/api/admin/users/ops-summary?userId=${encodeURIComponent(userId)}`,
        signal,
      ),
    [userId],
  );

  useEffect(() => {
    if (error) console.warn("[admin] ops summary failed", error);
  }, [error]);

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">운영 요약</h2>
        <Button onClick={() => void refetch()} disabled={loading}>
          {loading ? "조회 중..." : "새로고침"}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">조회 실패: {error}</p>
      ) : !data ? (
        <p className="mt-2 text-xs text-zinc-500">
          {loading ? "불러오는 중..." : "데이터 없음"}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Metric label="보유 골드" value={data.summary.gold} />
            <Metric label="은행 골드" value={data.summary.bankedGold} />
            <Metric label="낚시 코인" value={data.summary.fishingCoins} />
            <Metric label="발굴 코인" value={data.summary.treasureCoins} />
            <Metric label="숙련 증서" value={data.summary.masteryCertificates} />
            <Metric label="스태미나 회복약" value={data.summary.staminaPotions} />
          </div>
          <EventList title="최근 보상 수령" rows={data.rewardHistory} />
          <EventList title="숙련/증서 이벤트" rows={data.proficiencyHistory} />
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-100 px-2 py-1.5 dark:border-zinc-800">
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function EventList({ title, rows }: { title: string; rows: OpsEventRow[] }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">기록 없음</p>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded-md border border-zinc-100 dark:border-zinc-800">
          <table className="w-full text-left text-[11px]">
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 first:border-t-0 dark:border-zinc-800">
                  <td className="whitespace-nowrap px-2 py-1 text-zinc-500">
                    {new Date(row.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-2 py-1 font-mono">{row.eventType}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {row.goldDelta !== 0
                      ? `${row.goldDelta > 0 ? "+" : ""}${row.goldDelta.toLocaleString()}G`
                      : row.quantity != null
                        ? `${row.quantity.toLocaleString()}`
                        : "-"}
                  </td>
                  <td className="max-w-[160px] truncate px-2 py-1 font-mono text-zinc-400">
                    {[row.itemKind, row.itemId].filter(Boolean).join(":") || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
