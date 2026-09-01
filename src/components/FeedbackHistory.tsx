"use client";

import Image from "next/image";
import { CaretDown, CaretUp, ImageSquare } from "@phosphor-icons/react";
import { Fragment, useEffect, useState } from "react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  feedbackHistoryApiHref,
  feedbackSelectionFromHash,
  isFeedbackTargetMissing,
} from "@/lib/feedbackNavigation";
import { useAsyncData } from "@/lib/useAsyncData";

type FeedbackHistoryEntry = {
  id: number;
  category: string;
  content: string;
  hasImage: boolean;
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
const EMPTY_ENTRIES: FeedbackHistoryEntry[] = [];

function feedbackTitle(content: string) {
  return content.split(/\r?\n/, 1)[0]?.trim() || "제목 없음";
}

export function FeedbackHistory({ refreshToken }: { refreshToken: number }) {
  const initialSelection =
    typeof window === "undefined"
      ? { targetId: null, expandedId: null }
      : feedbackSelectionFromHash(window.location.hash);
  const [targetId, setTargetId] = useState<number | null>(
    initialSelection.targetId,
  );
  const [expandedId, setExpandedId] = useState<number | null>(
    initialSelection.expandedId,
  );
  const { data, loading, error } = useAsyncData<{ entries: FeedbackHistoryEntry[] }>(
    async (signal) => {
      const response = await fetch(feedbackHistoryApiHref(targetId), { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as { entries: FeedbackHistoryEntry[] };
    },
    [refreshToken, targetId],
  );
  const entries = data?.entries ?? EMPTY_ENTRIES;
  const targetMissing = isFeedbackTargetMissing(targetId, entries);

  useEffect(() => {
    const syncHash = () => {
      const next = feedbackSelectionFromHash(window.location.hash);
      setTargetId(next.targetId);
      setExpandedId(next.expandedId);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!data || !expandedId) return;
    if (!entries.some((entry) => entry.id === expandedId)) return;
    requestAnimationFrame(() => {
      document.getElementById(`feedback-${expandedId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [data, entries, expandedId]);

  function toggleEntry(id: number) {
    const nextId = expandedId === id ? null : id;
    setTargetId(null);
    setExpandedId(nextId);
    const url = new URL(window.location.href);
    url.hash = nextId ? `feedback-${nextId}` : "";
    window.history.replaceState(null, "", url);
  }

  return (
    <section className="space-y-3" aria-labelledby="feedback-history-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="feedback-history-heading" className="text-sm font-semibold">
            내 건의 내역
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            제목을 누르면 접수 내용과 관리자 답변을 확인할 수 있어요.
          </p>
        </div>
        {!loading && !error && (
          <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {entries.length}건
          </span>
        )}
      </div>

      {loading ? (
        <p className={`${SURFACE_CARD} px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400`}>
          불러오는 중…
        </p>
      ) : error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-6 text-center text-sm text-rose-700 shadow-sm dark:border-rose-900 dark:bg-zinc-950 dark:text-rose-300">
          건의 내역을 불러오지 못했습니다.
        </p>
      ) : targetMissing ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-6 text-center text-sm text-amber-800 dark:border-amber-900 dark:bg-zinc-950 dark:text-amber-200">
          해당 건의를 찾을 수 없습니다.
        </p>
      ) : entries.length === 0 ? (
        <p className={`${SURFACE_CARD} px-3 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400`}>
          아직 접수한 건의가 없습니다.
        </p>
      ) : (
        <div className={`${SURFACE_CARD} overflow-x-auto`}>
            <table className="w-full min-w-[620px] table-fixed border-collapse text-sm">
            <caption className="sr-only">내 건의사항 게시판 목록</caption>
            <colgroup>
              <col className="w-16" />
              <col className="w-20" />
              <col />
              <col className="w-24" />
              <col className="w-28" />
            </colgroup>
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-center font-medium">번호</th>
                <th scope="col" className="px-3 py-2.5 text-center font-medium">분류</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">내용</th>
                <th scope="col" className="px-3 py-2.5 text-center font-medium">상태</th>
                <th scope="col" className="px-3 py-2.5 text-center font-medium">작성일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {entries.map((entry) => {
                const expanded = expandedId === entry.id;
                return (
                  <Fragment key={entry.id}>
                    <tr
                      id={`feedback-${entry.id}`}
                      className="scroll-mt-6 bg-white dark:bg-zinc-900"
                    >
                      <td className="px-3 py-3 text-center text-xs tabular-nums text-zinc-400">
                        {entry.id}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-zinc-600 dark:text-zinc-300">
                        {CATEGORY_LABELS[entry.category] ?? entry.category}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => toggleEntry(entry.id)}
                          aria-expanded={expanded}
                          aria-controls={`feedback-detail-${entry.id}`}
                          className="flex w-full items-center gap-2 text-left font-medium text-zinc-800 hover:text-sky-700 dark:text-zinc-100 dark:hover:text-sky-300"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {feedbackTitle(entry.content)}
                          </span>
                          {entry.hasImage && (
                            <ImageSquare
                              size={16}
                              className="shrink-0 text-zinc-400"
                              aria-label="이미지 첨부됨"
                            />
                          )}
                          {expanded ? (
                            <CaretUp size={14} className="shrink-0 text-zinc-400" />
                          ) : (
                            <CaretDown size={14} className="shrink-0 text-zinc-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            entry.status === "resolved"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : entry.status === "reviewed"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          }`}
                        >
                          {STATUS_LABELS[entry.status] ?? entry.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                        {new Date(entry.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={`feedback-detail-${entry.id}`}>
                        <td colSpan={5} className="bg-zinc-50 p-3 dark:bg-zinc-950">
                          <div className="space-y-3">
                            <div className={`${SURFACE_INSET} p-3`}>
                              <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-100">
                                {entry.content}
                              </p>
                              {entry.hasImage && (
                                <a
                                  href={`/api/feedback/${entry.id}/image`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-3 block w-fit"
                                >
                                  <Image
                                    src={`/api/feedback/${entry.id}/image`}
                                    alt={`건의 #${entry.id} 첨부 이미지`}
                                    width={1200}
                                    height={900}
                                    unoptimized
                                    className="max-h-[480px] w-auto max-w-full rounded-md border border-zinc-200 object-contain dark:border-zinc-700"
                                  />
                                </a>
                              )}
                            </div>
                            {entry.adminReply ? (
                              <div className={`${SURFACE_INSET} p-3`}>
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                  <span>관리자 답변</span>
                                  {entry.repliedAt && (
                                    <span className="font-normal text-zinc-500 dark:text-zinc-400">
                                      {new Date(entry.repliedAt).toLocaleString("ko-KR")}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-100">
                                  {entry.adminReply}
                                </p>
                              </div>
                            ) : (
                              <p className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
                                관리자가 확인하거나 답변하면 이곳에 표시됩니다.
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            </table>
        </div>
      )}
    </section>
  );
}
