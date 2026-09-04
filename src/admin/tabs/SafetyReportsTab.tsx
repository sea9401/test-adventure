"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "../AdminContext";
import { AdminUserLink } from "../ui/AdminUserLink";
import { Button } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { UGC_REPORT_REASON_LABELS, type UgcReportReason } from "@/lib/ugc-safety";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";
import { GuildEmblemImage } from "@/adventure/v2/guild/GuildEmblemImage";
import { confirmGameAction } from "@/components/ui/gameDialog";

export type SafetyReport = {
  id: number;
  reporterUserId: string | null;
  reporterName: string;
  subjectType: "content" | "user";
  sourceType: string;
  sourceId: string;
  targetUserId: string | null;
  targetName: string;
  reason: UgcReportReason;
  details: string | null;
  contentSnapshot: string;
  contextSnapshot: Record<string, unknown>;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const STATUS_LABELS: Record<SafetyReport["status"], string> = {
  open: "미확인",
  reviewing: "검토 중",
  resolved: "처리 완료",
  dismissed: "기각",
};

const SOURCE_LABELS: Record<string, string> = {
  bulletin_post: "게시글",
  bulletin_comment: "댓글",
  chat_message: "채팅",
  inbox_message: "쪽지",
  profile: "프로필",
  guild_profile: "길드 정보",
  chat_room: "채팅방 정보",
  marketplace_trade: "거래소 체결",
  marketplace_listing: "거래소 매물",
};

export function SafetyReportsTab() {
  const { adminMe, readOnly, showToast } = useAdmin();
  const [view, setView] = useState<"active" | "closed">("active");
  const { data, loading, error, refetch } = useAsyncData<{ reports: SafetyReport[] }>(
    async (signal) => {
      const response = await fetch("/api/admin/safety-reports", { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<{ reports: SafetyReport[] }>;
    },
  );
  useEffect(() => {
    if (error) showToast(`신고 조회 실패: ${error}`);
  }, [error, showToast]);

  const visible = useMemo(
    () =>
      (data?.reports ?? []).filter((report) =>
        view === "active"
          ? report.status === "open" || report.status === "reviewing"
          : report.status === "resolved" || report.status === "dismissed",
      ),
    [data?.reports, view],
  );
  const canModerate = Boolean(!readOnly && adminMe?.capabilities.sanction);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">콘텐츠·사용자·거래 신고</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            신고 당시 기록을 확인하고 콘텐츠 삭제 또는 유저 제재로 연결합니다.
          </p>
        </div>
        <Button onClick={() => void refetch()} disabled={loading}>
          {loading ? "조회 중…" : "새로고침"}
        </Button>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="신고 처리 상태">
        {(["active", "closed"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={
              view === key
                ? "rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900"
            }
          >
            {key === "active" ? "처리 필요" : "처리 기록"}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-zinc-500">표시할 신고가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((report) => (
            <SafetyReportItem
              key={`${report.id}:${report.status}:${report.reviewedAt ?? ""}`}
              report={report}
              canModerate={canModerate}
              onSaved={() => void refetch()}
              showToast={showToast}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function SafetyReportItem({
  report,
  canModerate,
  onSaved,
  showToast,
}: {
  report: SafetyReport;
  canModerate: boolean;
  onSaved: () => void;
  showToast: (message: string) => void;
}) {
  const [status, setStatus] = useState(report.status);
  const [adminNote, setAdminNote] = useState(report.adminNote ?? "");
  const [busy, setBusy] = useState(false);
  const relatedAccounts = Array.isArray(report.contextSnapshot.relatedAccounts)
    ? report.contextSnapshot.relatedAccounts.filter(
        (account): account is { userId: string; name: string } =>
          typeof account === "object" &&
          account !== null &&
          typeof (account as { userId?: unknown }).userId === "string" &&
          typeof (account as { name?: unknown }).name === "string",
      )
    : [];
  const isMarketplaceReport =
    report.sourceType === "marketplace_trade" ||
    report.sourceType === "marketplace_listing";

  const save = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/safety-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: report.id, status, adminNote }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? `HTTP ${response.status}`);
      showToast("신고 처리 상태를 저장했습니다.");
      onSaved();
    } catch (error) {
      showToast(`저장 실패: ${error instanceof Error ? error.message : "오류"}`);
    } finally {
      setBusy(false);
    }
  };

  const removeContent = async () => {
    const confirmation =
      report.sourceType === "profile"
        ? "신고된 프로필의 이름과 이미지를 안전한 기본값으로 바꾸고 처리 완료로 바꿀까요?"
        : report.sourceType === "guild_profile"
          ? "신고된 길드의 이름·소개·엠블럼 등 공개 정보를 안전한 기본값으로 바꾸고 처리 완료로 바꿀까요?"
          : report.sourceType === "chat_room"
            ? "신고된 채팅방 이름을 안전한 기본값으로 바꾸고 처리 완료로 바꿀까요?"
            : "신고된 원본 콘텐츠를 삭제하고 처리 완료로 바꿀까요?";
    if (!(await confirmGameAction(confirmation))) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/safety-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: report.id, action: "remove_content" }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; removed?: boolean } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? `HTTP ${response.status}`);
      showToast(result.removed ? "콘텐츠를 삭제했습니다." : "원본은 이미 없으며 신고를 처리 완료했습니다.");
      onSaved();
    } catch (error) {
      showToast(`삭제 실패: ${error instanceof Error ? error.message : "오류"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-rose-50 px-2 py-1 font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {report.subjectType === "user" ? "사용자 신고" : `${SOURCE_LABELS[report.sourceType] ?? report.sourceType} 신고`}
        </span>
        <span>{UGC_REPORT_REASON_LABELS[report.reason] ?? report.reason}</span>
        <span className="text-zinc-400">#{report.id}</span>
        <span className="text-zinc-400">{new Date(report.createdAt).toLocaleString("ko-KR")}</span>
        <span className="ml-auto font-semibold">{STATUS_LABELS[report.status]}</span>
      </div>

      {isMarketplaceReport && relatedAccounts.length > 0 ? (
        <div className={`${SURFACE_INSET} mt-3 p-3`}>
          <p className="text-[11px] font-semibold text-zinc-500">
            관련 거래 계정
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {relatedAccounts.map((account) => (
              <AdminUserLink
                key={account.userId}
                userId={account.userId}
                gameName={account.name}
                compact
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className={`${SURFACE_INSET} p-3`}>
          <p className="text-[11px] font-semibold text-zinc-500">신고 대상</p>
          <div className="mt-1 text-sm">
            {report.targetUserId ? (
              <AdminUserLink userId={report.targetUserId} gameName={report.targetName} />
            ) : (
              <span>{report.targetName} (탈퇴 계정)</span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            {SOURCE_LABELS[report.sourceType] ?? report.sourceType} #{report.sourceId}
          </p>
        </div>
        <div className={`${SURFACE_INSET} p-3`}>
          <p className="text-[11px] font-semibold text-zinc-500">신고자</p>
          <div className="mt-1 text-sm">
            {report.reporterUserId ? (
              <AdminUserLink userId={report.reporterUserId} gameName={report.reporterName} />
            ) : (
              <span>{report.reporterName} (탈퇴 계정)</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold text-zinc-500">신고 당시 원문</p>
        {report.sourceType === "profile" &&
        typeof report.contextSnapshot.avatar === "string" ? (
          <CosmeticAvatar
            avatar={report.contextSnapshot.avatar}
            name={report.targetName}
            width={96}
            sizes="96px"
            className="mt-2 h-24 w-24"
          />
        ) : null}
        {report.sourceType === "guild_profile" ? (
          <GuildEmblemImage
            emblem={
              typeof report.contextSnapshot.emblem === "string"
                ? report.contextSnapshot.emblem
                : null
            }
            guildName={report.targetName}
            className="mt-2 h-24 w-24"
          />
        ) : null}
        <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 p-3 font-sans text-sm leading-6 dark:border-zinc-700 dark:bg-zinc-950">
          {report.contentSnapshot}
        </pre>
      </div>
      {report.details && (
        <p className="mt-3 whitespace-pre-wrap text-sm"><strong>추가 설명:</strong> {report.details}</p>
      )}

      <div className={`${SURFACE_INSET} mt-3 grid gap-2 p-3 sm:grid-cols-[10rem_1fr_auto]`}>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as SafetyReport["status"])}
          disabled={!canModerate || busy}
          className="min-h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input
          value={adminNote}
          onChange={(event) => setAdminNote(event.target.value)}
          maxLength={2_000}
          disabled={!canModerate || busy}
          placeholder="운영 메모"
          className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <Button variant="primary" onClick={() => void save()} disabled={!canModerate || busy}>저장</Button>
        <div className="sm:col-span-3 flex flex-wrap justify-end gap-2">
          {!isMarketplaceReport ? (
            <Button variant="danger" onClick={() => void removeContent()} disabled={!canModerate || busy}>
              신고 콘텐츠 제거
            </Button>
          ) : null}
          {report.targetUserId && (
            <a
              href={`/admin?tab=users&q=${encodeURIComponent(report.targetUserId)}`}
              className="inline-flex min-h-9 items-center rounded-md border border-amber-400 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950"
            >
              제재 화면 열기
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
