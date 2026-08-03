"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { Button } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";
import { TabBar } from "@/components/ui/TabBar";
import { SURFACE_INSET } from "@/components/ui/surfaces";

export type FeedbackEntry = {
  id: number;
  userId: string;
  actorName: string;
  currentGameName: string | null;
  email: string | null;
  category: string;
  content: string;
  hasImage: boolean;
  path: string | null;
  status: string;
  adminReply: string | null;
  reviewedAt: string | null;
  repliedAt: string | null;
  createdAt: string;
};

export type FeedbackReviewTab = "unreviewed" | "reviewed";

export function feedbackEntriesForTab(
  entries: readonly FeedbackEntry[],
  tab: FeedbackReviewTab,
): FeedbackEntry[] {
  return entries.filter((entry) =>
    tab === "reviewed" ? Boolean(entry.reviewedAt) : !entry.reviewedAt,
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  suggestion: "건의",
  bug: "버그",
  balance: "밸런스",
  ui: "UI",
  other: "기타",
};

const STATUS_LABELS: Record<string, string> = {
  open: "접수",
  reviewed: "검토 완료",
  resolved: "처리 완료",
};

export function FeedbackTab() {
  const { adminMe, readOnly, showToast } = useAdmin();
  const [activeReviewTab, setActiveReviewTab] =
    useState<FeedbackReviewTab>("unreviewed");
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
  const unreviewedCount = feedbackEntriesForTab(entries, "unreviewed").length;
  const reviewedCount = entries.length - unreviewedCount;
  const visibleEntries = feedbackEntriesForTab(entries, activeReviewTab);
  const canRespond = Boolean(
    !readOnly &&
      (adminMe?.capabilities.reward || adminMe?.capabilities.sanction),
  );

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

      <TabBar
        tabs={[
          {
            key: "unreviewed",
            label: "미확인",
            badge: unreviewedCount,
            badgeLabel: `미확인 건의사항 ${unreviewedCount}건`,
          },
          {
            key: "reviewed",
            label: "확인함",
            badge: reviewedCount,
            badgeLabel: `확인한 건의사항 ${reviewedCount}건`,
          },
        ]}
        active={activeReviewTab}
        onChange={setActiveReviewTab}
        ariaLabel="건의사항 확인 상태"
        badgeVariant="subtle"
      />

      {visibleEntries.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading
            ? "불러오는 중…"
            : activeReviewTab === "unreviewed"
              ? "미확인 건의사항 없음"
              : "확인한 건의사항 없음"}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {visibleEntries.map((entry) => (
              <FeedbackEntryItem
                key={`${entry.id}:${entry.reviewedAt ?? ""}:${entry.repliedAt ?? ""}`}
                entry={entry}
                canRespond={canRespond}
                onSaved={() => void refresh()}
                showToast={showToast}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function FeedbackEntryItem({
  entry,
  canRespond,
  onSaved,
  showToast,
}: {
  entry: FeedbackEntry;
  canRespond: boolean;
  onSaved: () => void;
  showToast: (message: string) => void;
}) {
  const [reply, setReply] = useState(entry.adminReply ?? "");
  const [saving, setSaving] = useState<"review" | "reply" | null>(null);
  const reviewed = Boolean(entry.reviewedAt);
  const replyChanged = reply.trim() !== (entry.adminReply ?? "");

  async function save(patch: { reviewed?: boolean; reply?: string }, kind: "review" | "reply") {
    setSaving(kind);
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id, ...patch }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !data?.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
      showToast(kind === "reply" ? "답변 저장됨" : patch.reviewed ? "확인 처리됨" : "확인 해제됨");
      onSaved();
    } catch (error) {
      showToast(`저장 실패: ${error instanceof Error ? error.message : "오류"}`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <li className="space-y-3 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
          {CATEGORY_LABELS[entry.category] ?? entry.category}
        </span>
        <span className="font-medium text-zinc-800 dark:text-zinc-100">
          {entry.actorName}
        </span>
        {entry.currentGameName && entry.currentGameName !== entry.actorName && (
          <span className="text-zinc-500 dark:text-zinc-400">
            현재 {entry.currentGameName}
          </span>
        )}
        <span className="text-zinc-400">
          {new Date(entry.createdAt).toLocaleString("ko-KR")}
        </span>
        {entry.path && (
          <span className="font-mono text-[11px] text-zinc-400">{entry.path}</span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800 dark:text-zinc-100">
        {entry.content}
      </p>
      {entry.hasImage && (
        <a
          href={`/api/admin/feedback/${entry.id}/image`}
          target="_blank"
          rel="noreferrer"
          className="block w-fit"
        >
          <Image
            src={`/api/admin/feedback/${entry.id}/image`}
            alt={`건의 #${entry.id} 첨부 이미지`}
            width={1200}
            height={900}
            unoptimized
            className="max-h-96 w-auto max-w-full rounded-md border border-zinc-200 object-contain dark:border-zinc-700"
          />
        </a>
      )}
      <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
        <span>{entry.email ?? entry.userId}</span>
        <span>#{entry.id}</span>
        <span>{STATUS_LABELS[entry.status] ?? entry.status}</span>
      </div>

      <div className={`${SURFACE_INSET} space-y-2 p-2.5`}>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-200">
          <input
            type="checkbox"
            checked={reviewed}
            disabled={!canRespond || saving !== null}
            onChange={(event) => void save({ reviewed: event.target.checked }, "review")}
            className="h-4 w-4 rounded border-zinc-300"
          />
          확인함
          {entry.reviewedAt && (
            <span className="font-normal text-zinc-400">
              {new Date(entry.reviewedAt).toLocaleString("ko-KR")}
            </span>
          )}
        </label>
        <textarea
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          maxLength={2_000}
          rows={3}
          disabled={!canRespond || saving !== null}
          placeholder="유저에게 공개할 답변을 작성하세요."
          className="w-full resize-y rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-zinc-400">
            {reply.length.toLocaleString("ko-KR")} / 2,000
          </span>
          <Button
            variant="primary"
            disabled={!canRespond || saving !== null || !reply.trim() || !replyChanged}
            onClick={() => void save({ reply }, "reply")}
          >
            {saving === "reply"
              ? "저장 중…"
              : entry.adminReply
                ? "답변 수정"
                : "답변 저장"}
          </Button>
        </div>
      </div>
    </li>
  );
}
