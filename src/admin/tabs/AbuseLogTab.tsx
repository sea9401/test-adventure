"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "../AdminContext";
import { adminGet } from "../api";
import { Button } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";

type AbuseEntry = {
  id: number;
  userId: string | null;
  gameName: string | null;
  ip: string | null;
  action: string;
  reason: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

function compactDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return "-";
  return JSON.stringify(detail);
}

export function AbuseLogTab() {
  const { showToast } = useAdmin();
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [ip, setIp] = useState("");

  const url = useMemo(() => {
    const sp = new URLSearchParams({ limit: "300" });
    if (action.trim()) sp.set("action", action.trim());
    if (userId.trim()) sp.set("userId", userId.trim());
    if (ip.trim()) sp.set("ip", ip.trim());
    return `/api/admin/abuse-log?${sp.toString()}`;
  }, [action, ip, userId]);

  const {
    data,
    loading,
    error,
    refetch: refresh,
  } = useAsyncData<{ entries: AbuseEntry[] }>(
    (signal) => adminGet(url, signal),
    [url],
  );

  useEffect(() => {
    if (error) showToast(`조회 실패: ${error}`);
  }, [error, showToast]);

  const entries = data?.entries ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">이상 행동 로그</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            rate limit 초과와 반복 호출 후보를 최신순으로 확인합니다.
          </p>
        </div>
        <Button onClick={() => void refresh()} disabled={loading}>
          {loading ? "조회 중..." : "새로고침"}
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">action</span>
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="v2:fishing:cast"
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">userId</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">IP</span>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중..." : "기록 없음"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">시각</th>
                <th className="px-2 py-1.5 font-medium">유저</th>
                <th className="px-2 py-1.5 font-medium">IP</th>
                <th className="px-2 py-1.5 font-medium">action</th>
                <th className="px-2 py-1.5 font-medium">reason</th>
                <th className="px-2 py-1.5 font-medium">detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-zinc-500">
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-2 py-1.5 text-zinc-600 dark:text-zinc-300">
                    {e.userId ? (e.gameName ?? e.userId.slice(0, 8)) : "-"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-zinc-600 dark:text-zinc-300">
                    {e.ip ?? "-"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-zinc-800 dark:text-zinc-100">
                    {e.action}
                  </td>
                  <td className="px-2 py-1.5 text-zinc-700 dark:text-zinc-200">
                    {e.reason}
                  </td>
                  <td className="max-w-md truncate px-2 py-1.5 font-mono text-[10px] text-zinc-400">
                    {compactDetail(e.detail)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
