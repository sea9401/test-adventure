"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "../AdminContext";
import { adminGet } from "../api";
import { Button } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";

type OpsSearchEntry = {
  id: string;
  log: "abuse" | "economy" | "audit";
  eventId: number;
  userId: string | null;
  gameName: string | null;
  title: string;
  subtitle: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
  href: string;
};

export function OpsSearchTab() {
  const { showToast } = useAdmin();
  const [q, setQ] = useState("");
  const url = useMemo(() => {
    const sp = new URLSearchParams({ limit: "80" });
    if (q.trim().length >= 2) sp.set("q", q.trim());
    return `/api/admin/ops-search?${sp.toString()}`;
  }, [q]);
  const { data, loading, error, refetch } = useAsyncData<{ entries: OpsSearchEntry[] }>(
    (signal) => adminGet(url, signal),
    [url],
  );

  useEffect(() => {
    if (error) showToast(`통합 검색 실패: ${error}`);
  }, [error, showToast]);

  const entries = q.trim().length >= 2 ? (data?.entries ?? []) : [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">운영 로그 통합 검색</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            userId, 캐릭터명, IP, event id, action, item id를 이상 행동·경제·감사 로그에서 함께 찾습니다.
          </p>
        </div>
        <Button onClick={() => void refetch()} disabled={loading || q.trim().length < 2}>
          {loading ? "조회 중..." : "새로고침"}
        </Button>
      </div>

      <label className="block space-y-1 text-xs">
        <span className="text-zinc-500 dark:text-zinc-400">검색어</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="2글자 이상 입력"
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      {q.trim().length < 2 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">검색어를 입력하세요.</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중..." : "검색 결과 없음"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">시각</th>
                <th className="px-2 py-1.5 font-medium">로그</th>
                <th className="px-2 py-1.5 font-medium">event</th>
                <th className="px-2 py-1.5 font-medium">대상</th>
                <th className="px-2 py-1.5 font-medium">내용</th>
                <th className="px-2 py-1.5 font-medium">상세</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">
                    {new Date(entry.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{entry.log}</td>
                  <td className="px-2 py-1.5 font-mono">
                    <Link
                      href={entry.href}
                      className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                    >
                      {entry.eventId}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">
                    {entry.gameName ?? entry.userId?.slice(0, 10) ?? "-"}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-mono text-zinc-800 dark:text-zinc-100">
                      {entry.title}
                    </div>
                    {entry.subtitle ? (
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {entry.subtitle}
                      </div>
                    ) : null}
                  </td>
                  <td className="max-w-[260px] truncate px-2 py-1.5 font-mono text-[10px] text-zinc-400">
                    {entry.detail ? JSON.stringify(entry.detail) : "-"}
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
