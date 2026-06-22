"use client";

import { useEffect } from "react";
import { useAdmin } from "../AdminContext";
import { useAsyncData } from "@/lib/useAsyncData";
import { Button } from "../ui/Field";

type Entry = {
  id: number;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  targetGameName: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

// 관리자 감사 로그 — 모든 admin 변경 행동의 최신순 기록(읽기 전용).
export function AuditLogTab() {
  const { showToast } = useAdmin();
  const {
    data,
    loading,
    error,
    refetch: refresh,
  } = useAsyncData<{ entries: Entry[] }>(async (signal) => {
    const r = await fetch("/api/admin/audit-log?limit=200", { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as { entries: Entry[] };
  });

  useEffect(() => {
    if (error) showToast(`조회 실패: ${error}`);
  }, [error, showToast]);

  const entries = data?.entries ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">감사 로그</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            관리자 변경 행동(제재·지급·초기화·시즌 운영 등)의 기록. 최근 200건.
          </p>
        </div>
        <Button onClick={() => void refresh()} disabled={loading}>
          {loading ? "조회 중…" : "새로고침"}
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중…" : "기록 없음"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">시각</th>
                <th className="px-2 py-1.5 font-medium">관리자</th>
                <th className="px-2 py-1.5 font-medium">행동</th>
                <th className="px-2 py-1.5 font-medium">대상</th>
                <th className="px-2 py-1.5 font-medium">상세</th>
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
                    {e.adminEmail}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-zinc-800 dark:text-zinc-100">
                    {e.action}
                  </td>
                  <td className="px-2 py-1.5 text-zinc-600 dark:text-zinc-300">
                    {e.targetUserId
                      ? (e.targetGameName ?? e.targetUserId.slice(0, 8))
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-400">
                    {e.detail ? JSON.stringify(e.detail) : "—"}
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
