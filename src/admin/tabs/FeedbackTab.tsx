"use client";

import { useEffect } from "react";
import { useAdmin } from "../AdminContext";
import { Button } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";

type FeedbackEntry = {
  id: number;
  userId: string;
  actorName: string;
  currentGameName: string | null;
  email: string | null;
  category: string;
  content: string;
  path: string | null;
  status: string;
  createdAt: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  suggestion: "건의",
  bug: "버그",
  balance: "밸런스",
  ui: "UI",
  other: "기타",
};

export function FeedbackTab() {
  const { showToast } = useAdmin();
  const {
    data,
    loading,
    error,
    refetch: refresh,
  } = useAsyncData<{ entries: FeedbackEntry[] }>(async (signal) => {
    const r = await fetch("/api/admin/feedback?limit=200", { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as { entries: FeedbackEntry[] };
  });

  useEffect(() => {
    if (error) showToast(`조회 실패: ${error}`);
  }, [error, showToast]);

  const entries = data?.entries ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">건의사항</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            설정 메뉴에서 접수된 유저 의견. 최근 200건.
          </p>
        </div>
        <Button onClick={() => void refresh()} disabled={loading}>
          {loading ? "조회 중…" : "새로고침"}
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중…" : "접수된 건의사항 없음"}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {entries.map((entry) => (
              <li key={entry.id} className="space-y-2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                    {CATEGORY_LABELS[entry.category] ?? entry.category}
                  </span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-100">
                    {entry.actorName}
                  </span>
                  {entry.currentGameName &&
                    entry.currentGameName !== entry.actorName && (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        현재 {entry.currentGameName}
                      </span>
                    )}
                  <span className="text-zinc-400">
                    {new Date(entry.createdAt).toLocaleString("ko-KR")}
                  </span>
                  {entry.path && (
                    <span className="font-mono text-[11px] text-zinc-400">
                      {entry.path}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-100">
                  {entry.content}
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
                  <span>{entry.email ?? entry.userId}</span>
                  <span>#{entry.id}</span>
                  <span>{entry.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
