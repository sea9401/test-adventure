"use client";

import { useEffect } from "react";
import { useAsyncData } from "@/lib/useAsyncData";

type FeedbackHistoryEntry = {
  id: number;
  category: string;
  content: string;
  status: string;
  adminReply: string | null;
  reviewedAt: string | null;
  repliedAt: string | null;
  createdAt: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  suggestion: "건의",
  bug: "버그",
  balance: "밸런스",
  ui: "UI",
  other: "기타",
};

const STATUS_LABELS: Record<string, string> = {
  open: "접수",
  reviewed: "관리자 확인",
  resolved: "답변 완료",
};

export function FeedbackHistory({ refreshToken }: { refreshToken: number }) {
  const { data, loading, error } = useAsyncData<{ entries: FeedbackHistoryEntry[] }>(
    async (signal) => {
      const response = await fetch("/api/feedback", { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as { entries: FeedbackHistoryEntry[] };
    },
    [refreshToken],
  );
  const entries = data?.entries ?? [];

  useEffect(() => {
    if (!data || !window.location.hash.startsWith("#feedback-")) return;
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [data]);

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">내 건의 내역</h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          관리자가 확인하거나 답변하면 이곳에 표시됩니다.
        </p>
      </div>
      {loading ? (
        <p className="rounded-md border border-zinc-200 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          불러오는 중…
        </p>
      ) : error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          건의 내역을 불러오지 못했습니다.
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-md border border-zinc-200 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          아직 접수한 건의가 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              id={`feedback-${entry.id}`}
              key={entry.id}
              className="scroll-mt-6 space-y-2 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                  {CATEGORY_LABELS[entry.category] ?? entry.category}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-medium ${
                    entry.status === "resolved"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : entry.status === "reviewed"
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </span>
                <span className="text-zinc-400">
                  {new Date(entry.createdAt).toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-100">
                {entry.content}
              </p>
              {entry.adminReply && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                    <span>관리자 답변</span>
                    {entry.repliedAt && (
                      <span className="font-normal text-emerald-600/80 dark:text-emerald-400/80">
                        {new Date(entry.repliedAt).toLocaleString("ko-KR")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-100">
                    {entry.adminReply}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
