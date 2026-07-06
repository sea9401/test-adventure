"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAdmin } from "../AdminContext";
import { adminGet, adminPost } from "../api";
import { economyItemKindLabel, economyItemLabel } from "../economyLabels";
import { Button } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";

type CountRow = { key: string; count: number };

type OpsNote = {
  id: string;
  userId: string;
  text: string;
  status: "open" | "resolved";
  workflowStatus: "needs_review" | "in_progress" | "done";
  createdByEmail: string;
  createdAt: string;
  updatedByEmail: string | null;
  updatedAt: string | null;
};

type OpsNoteTemplate = {
  id: string;
  label: string;
  text: string;
};

type HotTimeSchedule = {
  id: string;
  enabled: boolean;
  title: string;
  days: number[];
  startsAt: string;
  endsAt: string;
  bonuses: {
    goldPct: number;
    expPct: number;
    masteryPct: number;
    fishingCoinPct: number;
  };
  note: string;
};

type OpsSettings = {
  hotTime: {
    enabled: boolean;
    title: string;
    startsAt: string;
    endsAt: string;
  };
  hotTimeSchedules: HotTimeSchedule[];
  alertThresholds: Record<string, number>;
  rewardCompensationPresets: Array<{ id: string; label: string }>;
  opsNoteTemplates: OpsNoteTemplate[];
};

type DailyReport = {
  rewardFailures: number;
  rewardFailuresHandled: number;
  rewardCompensated: number;
  sanctionsChanged: number;
  abuseEvents: number;
  rateLimited: number;
  largeGoldEvents: number;
  adminChanges: number;
  goldNet: number;
};

type OpsDashboard = {
  opsSummary: string[];
  periodComparison: {
    current: DailyReport;
    previous: DailyReport;
    deltas: DailyReport;
  };
  compensationReport: {
    count: number;
    userCount: number;
    totalGold: number;
    totalQuantity: number;
    byKind: CountRow[];
    byAdmin: CountRow[];
    byUser: CountRow[];
    recent: Array<{
      id: number;
      userId: string | null;
      itemKind: string | null;
      itemId: string | null;
      quantity: number | null;
      goldDelta: number;
      reason: string | null;
      sourceEventId: number;
      createdAt: string;
    }>;
  };
  alertChannels: {
    default: boolean;
    reward: boolean;
    abuse: boolean;
    economy: boolean;
    deploy: boolean;
  };
  alertHistory: Array<{
    id: string;
    message: string;
    detail: Record<string, unknown> | null;
    status: "sent" | "failed" | "skipped";
    error: string | null;
    createdAt: string;
  }>;
};

const NOTE_STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "open", label: "열린 메모" },
  { value: "resolved", label: "처리됨" },
] as const;

const NOTE_WORKFLOW_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "needs_review", label: "확인 필요" },
  { value: "in_progress", label: "처리 중" },
  { value: "done", label: "완료" },
] as const;

type NoteWorkflowFilter = (typeof NOTE_WORKFLOW_OPTIONS)[number]["value"];

const ALERT_CHANNELS = [
  { key: "default", label: "기본" },
  { key: "reward", label: "보상" },
  { key: "abuse", label: "이상 행동" },
  { key: "economy", label: "경제" },
  { key: "deploy", label: "배포" },
] as const;

const ALERT_HISTORY_FILTERS = [
  { value: "all", label: "전체" },
  { value: "sent", label: "성공" },
  { value: "failed", label: "실패" },
  { value: "skipped", label: "스킵" },
] as const;

const REPORT_ROWS: Array<{ key: keyof DailyReport; label: string }> = [
  { key: "rewardFailures", label: "보상 실패" },
  { key: "rewardFailuresHandled", label: "처리된 실패" },
  { key: "rewardCompensated", label: "보정 완료" },
  { key: "sanctionsChanged", label: "제재 변경" },
  { key: "abuseEvents", label: "이상 행동" },
  { key: "rateLimited", label: "요청 제한" },
  { key: "largeGoldEvents", label: "대량 골드" },
  { key: "adminChanges", label: "관리자 변경" },
  { key: "goldNet", label: "골드 순변동" },
];

export function OpsWorkflowsTab() {
  const { showToast, readOnly, adminMe } = useAdmin();
  const [noteQueryDraft, setNoteQueryDraft] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
  const [noteStatus, setNoteStatus] = useState<(typeof NOTE_STATUS_OPTIONS)[number]["value"]>(
    "open",
  );
  const [noteWorkflowStatus, setNoteWorkflowStatus] =
    useState<NoteWorkflowFilter>("needs_review");
  const [dashboardHours, setDashboardHours] = useState(168);
  const [alertHistoryFilter, setAlertHistoryFilter] =
    useState<(typeof ALERT_HISTORY_FILTERS)[number]["value"]>("all");
  const [updatingNoteId, setUpdatingNoteId] = useState<string | null>(null);
  const notes = useAsyncData<{ notes: OpsNote[] }>(
    (signal) =>
      adminGet(
        `/api/admin/users/ops-notes?q=${encodeURIComponent(noteQuery)}&status=${noteStatus}&workflowStatus=${noteWorkflowStatus}&limit=120`,
        signal,
      ),
    [noteQuery, noteStatus, noteWorkflowStatus],
  );
  const dashboard = useAsyncData<OpsDashboard>((signal) =>
    adminGet(`/api/admin/ops-dashboard?hours=${dashboardHours}`, signal),
    [dashboardHours],
  );
  const settings = useAsyncData<OpsSettings>((signal) =>
    adminGet("/api/admin/ops-settings", signal),
  );
  const [templateDraft, setTemplateDraft] = useState<OpsNoteTemplate[] | null>(null);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const canEditSettings = Boolean(adminMe?.capabilities.super);
  const canWriteNotes = Boolean(adminMe?.capabilities.reward || adminMe?.capabilities.sanction);
  const templates = templateDraft ?? settings.data?.opsNoteTemplates ?? [];
  const filteredAlertHistory = useMemo(() => {
    const rows = dashboard.data?.alertHistory ?? [];
    return rows.filter((row) => alertHistoryFilter === "all" || row.status === alertHistoryFilter);
  }, [alertHistoryFilter, dashboard.data?.alertHistory]);

  const saveTemplates = async () => {
    setSavingTemplates(true);
    try {
      await adminPost("/api/admin/ops-settings", { opsNoteTemplates: templates });
      showToast("메모 템플릿 저장됨");
      setTemplateDraft(null);
      settings.refetch();
    } catch (e) {
      showToast(`템플릿 저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSavingTemplates(false);
    }
  };

  const addTemplate = () => {
    setTemplateDraft((prev) => {
      const base = prev ?? settings.data?.opsNoteTemplates ?? [];
      return [
        ...base,
        {
          id: `template-${base.length + 1}`,
          label: "새 템플릿",
          text: "문의 내용 확인.",
        },
      ];
    });
  };

  const refreshAll = () => {
    notes.refetch();
    dashboard.refetch();
    settings.refetch();
  };

  const updateNoteWorkflow = async (
    note: OpsNote,
    workflowStatus: Exclude<NoteWorkflowFilter, "all">,
  ) => {
    setUpdatingNoteId(note.id);
    try {
      await adminPost("/api/admin/users/ops-notes", {
        userId: note.userId,
        noteId: note.id,
        action: "set-workflow-status",
        workflowStatus,
      });
      showToast("문의 상태 저장됨");
      notes.refetch();
    } catch (e) {
      showToast(`문의 상태 저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setUpdatingNoteId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">운영 워크플로</h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              반복 문의 처리, 지급 리포트, 운영 설정 점검을 한 화면에서 확인합니다.
            </p>
          </div>
          <Button onClick={refreshAll}>전체 새로고침</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <RolePermissionPanel
          readOnly={readOnly}
          role={adminMe?.role ?? null}
          canWriteNotes={canWriteNotes}
          canEditSettings={canEditSettings}
        />
        <OpsSummaryPanel dashboard={dashboard.data} />
      </div>

      <GlobalNotesPanel
        q={noteQueryDraft}
        onQChange={setNoteQueryDraft}
        status={noteStatus}
        onStatusChange={setNoteStatus}
        workflowStatus={noteWorkflowStatus}
        onWorkflowStatusChange={setNoteWorkflowStatus}
        notes={notes.data?.notes ?? []}
        loading={notes.loading}
        error={notes.error}
        canWrite={canWriteNotes}
        updatingNoteId={updatingNoteId}
        onSearch={() => setNoteQuery(noteQueryDraft.trim())}
        onWorkflowChange={updateNoteWorkflow}
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <CompensationReportPanel
          report={dashboard.data?.compensationReport ?? null}
          hours={dashboardHours}
          onHoursChange={setDashboardHours}
        />
        <PeriodComparisonPanel comparison={dashboard.data?.periodComparison ?? null} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <TemplatePanel
          templates={templates}
          disabled={readOnly || savingTemplates || !canEditSettings}
          onChange={setTemplateDraft}
          onAdd={addTemplate}
          onSave={saveTemplates}
          saving={savingTemplates}
        />
        <OpsDialsPanel settings={settings.data} dashboard={dashboard.data} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <AlertTestPanel
          channels={dashboard.data?.alertChannels ?? null}
          disabled={readOnly}
          onDone={() => {
            dashboard.refetch();
          }}
        />
        <AlertHistoryPanel
          rows={filteredAlertHistory}
          value={alertHistoryFilter}
          onChange={setAlertHistoryFilter}
        />
      </div>

      <HotTimeCalendarPanel schedules={settings.data?.hotTimeSchedules ?? []} />

      <RollbackGuidePanel />
    </section>
  );
}

function RolePermissionPanel({
  readOnly,
  role,
  canWriteNotes,
  canEditSettings,
}: {
  readOnly: boolean;
  role: string | null;
  canWriteNotes: boolean;
  canEditSettings: boolean;
}) {
  const rows = [
    ["현재 역할", role ?? "no-role"],
    ["운영 메모", canWriteNotes ? "작성·상태 변경 가능" : "조회만 가능"],
    ["설정 변경", canEditSettings ? "템플릿·다이얼 변경 가능" : "super 권한 필요"],
    ["읽기 전용", readOnly ? "변경 버튼 비활성" : "변경 가능"],
  ];
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold">권한별 작업 상태</h3>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="mt-0.5 font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OpsSummaryPanel({ dashboard }: { dashboard: OpsDashboard | null }) {
  const summary = dashboard?.opsSummary ?? [];
  const report = dashboard?.compensationReport;
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold">오늘 운영 요약</h3>
      {summary.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">불러오는 중...</p>
      ) : (
        <div className="mt-3 space-y-2">
          {summary.slice(0, 4).map((line) => (
            <div
              key={line}
              className="rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-950"
            >
              {line}
            </div>
          ))}
          {report ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <Metric label="보정 지급" value={report.count} />
              <Metric label="대상 유저" value={report.userCount} />
              <Metric label="알림 이력" value={dashboard.alertHistory.length} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function GlobalNotesPanel({
  q,
  onQChange,
  status,
  onStatusChange,
  workflowStatus,
  onWorkflowStatusChange,
  notes,
  loading,
  error,
  canWrite,
  updatingNoteId,
  onSearch,
  onWorkflowChange,
}: {
  q: string;
  onQChange: (value: string) => void;
  status: (typeof NOTE_STATUS_OPTIONS)[number]["value"];
  onStatusChange: (value: (typeof NOTE_STATUS_OPTIONS)[number]["value"]) => void;
  workflowStatus: NoteWorkflowFilter;
  onWorkflowStatusChange: (value: NoteWorkflowFilter) => void;
  notes: OpsNote[];
  loading: boolean;
  error: string | null;
  canWrite: boolean;
  updatingNoteId: string | null;
  onSearch: () => void;
  onWorkflowChange: (
    note: OpsNote,
    workflowStatus: Exclude<NoteWorkflowFilter, "all">,
  ) => void | Promise<void>;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">운영 메모 검색·필터</h3>
        <span className="text-xs text-zinc-500">
          {loading ? "조회 중..." : `${notes.length.toLocaleString()}건`}
        </span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_150px_150px_auto]">
        <input
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
          placeholder="유저 ID, 메모 내용, 작성자 검색"
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={status}
          onChange={(e) =>
            onStatusChange(e.target.value as (typeof NOTE_STATUS_OPTIONS)[number]["value"])
          }
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          {NOTE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={workflowStatus}
          onChange={(e) => onWorkflowStatusChange(e.target.value as NoteWorkflowFilter)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          {NOTE_WORKFLOW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button onClick={onSearch}>검색</Button>
      </div>
      {!canWrite ? (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
          현재 계정은 메모 작성 권한이 없어 조회 중심으로 사용합니다.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">조회 실패: {error}</p>
      ) : notes.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">검색 결과 없음</p>
      ) : (
        <div className="mt-3 max-h-80 overflow-y-auto rounded-md border border-zinc-100 dark:border-zinc-800">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-zinc-50 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5">상태</th>
                <th className="px-2 py-1.5">처리</th>
                <th className="px-2 py-1.5">유저</th>
                <th className="px-2 py-1.5">메모</th>
                <th className="px-2 py-1.5">작성</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr
                  key={`${note.userId}:${note.id}`}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <StatusBadge status={note.status} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <select
                      value={note.workflowStatus}
                      disabled={!canWrite || updatingNoteId === note.id}
                      onChange={(e) =>
                        void onWorkflowChange(
                          note,
                          e.target.value as Exclude<NoteWorkflowFilter, "all">,
                        )
                      }
                      className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {NOTE_WORKFLOW_OPTIONS.filter((option) => option.value !== "all").map(
                        (option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                    <Link
                      href={`/admin?tab=users&q=${encodeURIComponent(note.userId)}`}
                      className="text-sky-700 hover:underline dark:text-sky-300"
                    >
                      {note.userId}
                    </Link>
                  </td>
                  <td className="max-w-[520px] px-2 py-1.5">
                    <p className="line-clamp-3 whitespace-pre-wrap break-words">{note.text}</p>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">
                    <div>{note.createdByEmail}</div>
                    <div>{new Date(note.createdAt).toLocaleString("ko-KR")}</div>
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

function CompensationReportPanel({
  report,
  hours,
  onHoursChange,
}: {
  report: OpsDashboard["compensationReport"] | null;
  hours: number;
  onHoursChange: (hours: number) => void;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">보상 지급 내역 리포트</h3>
        <div className="flex flex-wrap gap-1">
          {[24, 168].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onHoursChange(value)}
              className={
                hours === value
                  ? "rounded border border-zinc-900 bg-zinc-900 px-2 py-1 text-xs text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }
            >
              {value === 24 ? "24시간" : "7일"}
            </button>
          ))}
          <Button
            disabled={!report || report.recent.length === 0}
            onClick={() => report && downloadCompensationCsv(report)}
          >
            CSV
          </Button>
        </div>
      </div>
      {!report ? (
        <p className="mt-2 text-xs text-zinc-500">불러오는 중...</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <Metric label="지급 건수" value={report.count} />
            <Metric label="대상 유저" value={report.userCount} />
            <Metric label="골드 총액" value={report.totalGold} />
            <Metric label="아이템 수량" value={report.totalQuantity} />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <CountBox title="품목별" rows={report.byKind} labelKey={economyItemKindLabel} />
            <CountBox title="운영자별" rows={report.byAdmin} />
            <CountBox title="유저별" rows={report.byUser} linkUsers />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border border-zinc-100 dark:border-zinc-800">
            <table className="w-full text-left text-[11px]">
              <tbody>
                {report.recent.length === 0 ? (
                  <tr>
                    <td className="px-2 py-2 text-zinc-500">최근 지급 없음</td>
                  </tr>
                ) : (
                  report.recent.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-zinc-100 first:border-t-0 dark:border-zinc-800"
                    >
                      <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">
                        {new Date(row.createdAt).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-2 py-1.5 font-mono">
                        {row.userId ? (
                          <Link
                            href={`/admin?tab=users&q=${encodeURIComponent(row.userId)}`}
                            className="text-sky-700 hover:underline dark:text-sky-300"
                          >
                            {row.userId}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {economyItemLabel(row.itemKind, row.itemId)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {row.goldDelta > 0
                          ? `${row.goldDelta.toLocaleString()}G`
                          : (row.quantity ?? 0).toLocaleString()}
                      </td>
                      <td className="max-w-[220px] truncate px-2 py-1.5 text-zinc-500">
                        {row.reason ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">
                        {row.userId ? (
                          <Link
                            href={compensationDraftHref(row)}
                            className="rounded border border-zinc-300 px-2 py-0.5 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            정정 초안
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function PeriodComparisonPanel({
  comparison,
}: {
  comparison: OpsDashboard["periodComparison"] | null;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold">운영 대시보드 기간 비교</h3>
      {!comparison ? (
        <p className="mt-2 text-xs text-zinc-500">불러오는 중...</p>
      ) : (
        <div className="mt-3 max-h-72 overflow-y-auto rounded-md border border-zinc-100 dark:border-zinc-800">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-zinc-50 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5">항목</th>
                <th className="px-2 py-1.5 text-right">현재 24h</th>
                <th className="px-2 py-1.5 text-right">이전 24h</th>
                <th className="px-2 py-1.5 text-right">증감</th>
                <th className="px-2 py-1.5 text-right">증감률</th>
              </tr>
            </thead>
            <tbody>
              {REPORT_ROWS.map((row) => (
                <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-1.5">{row.label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {comparison.current[row.key].toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {comparison.previous[row.key].toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatSigned(comparison.deltas[row.key])}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatPct(comparison.current[row.key], comparison.previous[row.key])}
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

function TemplatePanel({
  templates,
  disabled,
  onChange,
  onAdd,
  onSave,
  saving,
}: {
  templates: OpsNoteTemplate[];
  disabled: boolean;
  onChange: (templates: OpsNoteTemplate[]) => void;
  onAdd: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const patchTemplate = (index: number, patch: Partial<OpsNoteTemplate>) => {
    onChange(templates.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">운영 메모 템플릿</h3>
        <div className="flex gap-1">
          <Button onClick={onAdd} disabled={disabled}>추가</Button>
          <Button variant="primary" onClick={onSave} disabled={disabled}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {templates.map((template, index) => (
          <div
            key={`${template.id}:${index}`}
            className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800"
          >
            <div className="grid gap-2 md:grid-cols-[140px_1fr_auto]">
              <input
                value={template.label}
                disabled={disabled}
                onChange={(e) => patchTemplate(index, { label: e.target.value })}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
              <input
                value={template.id}
                disabled={disabled}
                onChange={(e) => patchTemplate(index, { id: e.target.value })}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-mono dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(templates.filter((_, i) => i !== index))}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300"
              >
                삭제
              </button>
            </div>
            <textarea
              value={template.text}
              disabled={disabled}
              rows={3}
              maxLength={1_000}
              onChange={(e) => patchTemplate(index, { text: e.target.value })}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function OpsDialsPanel({
  settings,
  dashboard,
}: {
  settings: OpsSettings | null;
  dashboard: OpsDashboard | null;
}) {
  const thresholdRows = Object.entries(settings?.alertThresholds ?? {}).slice(0, 8);
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold">운영용 콘텐츠 다이얼</h3>
      {!settings ? (
        <p className="mt-2 text-xs text-zinc-500">불러오는 중...</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Metric label="단발 핫타임" value={settings.hotTime.enabled ? 1 : 0} suffix={settings.hotTime.enabled ? " ON" : " OFF"} />
            <Metric label="반복 핫타임" value={settings.hotTimeSchedules.filter((row) => row.enabled).length} />
            <Metric label="보상 프리셋" value={settings.rewardCompensationPresets.length} />
            <Metric label="메모 템플릿" value={settings.opsNoteTemplates.length} />
            <Metric label="알림 채널" value={dashboard ? Object.values(dashboard.alertChannels).filter(Boolean).length : 0} />
            <Metric label="임계치 항목" value={thresholdRows.length} />
          </div>
          <CountBox
            title="주요 알림 임계치"
            rows={thresholdRows.map(([key, count]) => ({ key, count }))}
          />
        </div>
      )}
    </section>
  );
}

function AlertTestPanel({
  channels,
  disabled,
  onDone,
}: {
  channels: OpsDashboard["alertChannels"] | null;
  disabled: boolean;
  onDone: () => void;
}) {
  const { showToast } = useAdmin();
  const [testing, setTesting] = useState<string | null>(null);
  const run = async (channel: (typeof ALERT_CHANNELS)[number]["key"]) => {
    setTesting(channel);
    try {
      await adminPost("/api/admin/ops-alert-test", { channel });
      showToast(`${channel} 알림 테스트 전송`);
      onDone();
    } catch (e) {
      showToast(`알림 테스트 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setTesting(null);
    }
  };
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold">운영 알림 테스트 상세</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ALERT_CHANNELS.map((channel) => {
          const configured = channels?.[channel.key] ?? false;
          return (
            <div
              key={channel.key}
              className="rounded-md border border-zinc-100 p-2 text-xs dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{channel.label}</span>
                <span className={configured ? "text-emerald-600" : "text-zinc-400"}>
                  {configured ? "설정됨" : "기본 fallback"}
                </span>
              </div>
              <Button
                className="mt-2 w-full"
                disabled={disabled || testing === channel.key}
                onClick={() => void run(channel.key)}
              >
                {testing === channel.key ? "전송 중..." : "테스트"}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AlertHistoryPanel({
  rows,
  value,
  onChange,
}: {
  rows: OpsDashboard["alertHistory"];
  value: (typeof ALERT_HISTORY_FILTERS)[number]["value"];
  onChange: (value: (typeof ALERT_HISTORY_FILTERS)[number]["value"]) => void;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">운영 알림 이력</h3>
        <select
          value={value}
          onChange={(e) =>
            onChange(e.target.value as (typeof ALERT_HISTORY_FILTERS)[number]["value"])
          }
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
        >
          {ALERT_HISTORY_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">이력 없음</p>
      ) : (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-zinc-100 dark:border-zinc-800">
          <table className="w-full text-left text-[11px]">
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-zinc-100 first:border-t-0 dark:border-zinc-800"
                >
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <AlertStatusBadge status={row.status} />
                  </td>
                  <td className="max-w-[280px] px-2 py-1.5">
                    <div className="truncate">{row.message}</div>
                    <div className="font-mono text-zinc-400">
                      {String(row.detail?.channel ?? "default")}
                    </div>
                  </td>
                  <td className="max-w-[220px] truncate px-2 py-1.5 text-zinc-500">
                    {row.error ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-zinc-500">
                    {new Date(row.createdAt).toLocaleString("ko-KR")}
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

function HotTimeCalendarPanel({ schedules }: { schedules: HotTimeSchedule[] }) {
  const days = nextDays(7);
  const warnings = hotTimeWarnings(schedules);
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">핫타임 캘린더</h3>
        <span className={warnings.length ? "text-xs text-amber-600" : "text-xs text-emerald-600"}>
          {warnings.length ? `경고 ${warnings.length}건` : "예약 상태 정상"}
        </span>
      </div>
      {warnings.length ? (
        <div className="mt-2 grid gap-1">
          {warnings.slice(0, 6).map((warning) => (
            <div
              key={warning}
              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
            >
              {warning}
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {days.map((day) => {
          const rows = schedules.filter((row) => row.enabled && row.days.includes(day.weekday));
          return (
            <div
              key={day.key}
              className="rounded-md border border-zinc-100 p-2 text-xs dark:border-zinc-800"
            >
              <div className="font-medium">
                {day.label} · {WEEKDAY_LABELS[day.weekday]}
              </div>
              {rows.length === 0 ? (
                <p className="mt-1 text-zinc-500">예약 없음</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1">
                  {rows.map((row) => (
                    <span
                      key={row.id}
                      className="rounded bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                    >
                      {row.startsAt}-{row.endsAt} {row.title || row.id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RollbackGuidePanel() {
  const rows = [
    ["보상 보정", "유저 상세의 최근 보정과 감사 로그에서 원본 event id를 확인한 뒤 반대 방향 지급 또는 추가 메모로 처리합니다."],
    ["제재", "유저 상세 제재 영역에서 해제하고, 해제 사유를 감사 로그와 운영 메모에 남깁니다."],
    ["핫타임", "단발 설정은 비활성화, 반복 예약은 해당 슬롯 비활성화 후 대시보드 알림으로 확인합니다."],
    ["운영 메모", "잘못된 메모는 삭제보다 처리됨 전환 후 정정 메모를 추가하는 방식을 우선합니다."],
    ["템플릿·프리셋", "변경 직후 문의 처리 품질이 떨어지면 이전 문구를 새 항목으로 복구하고 기존 항목은 비활성 대신 삭제합니다."],
  ];
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold">관리자 액션 되돌리기 가이드</h3>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {rows.map(([title, text]) => (
          <div key={title} className="rounded-md border border-zinc-100 p-2 text-xs dark:border-zinc-800">
            <div className="font-medium">{title}</div>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: OpsNote["status"] }) {
  return (
    <span
      className={
        status === "open"
          ? "rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          : "rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      }
    >
      {status === "open" ? "열림" : "처리"}
    </span>
  );
}

function AlertStatusBadge({ status }: { status: OpsDashboard["alertHistory"][number]["status"] }) {
  const cls =
    status === "sent"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : status === "failed"
        ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`rounded px-1.5 py-0.5 ${cls}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: OpsDashboard["alertHistory"][number]["status"]) {
  if (status === "sent") return "성공";
  if (status === "failed") return "실패";
  return "스킵";
}

function Metric({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-md border border-zinc-100 px-2 py-1.5 dark:border-zinc-800">
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">
        {value.toLocaleString()}
        {suffix}
      </div>
    </div>
  );
}

function CountBox({
  title,
  rows,
  linkUsers = false,
  labelKey = (key) => key,
}: {
  title: string;
  rows: CountRow[];
  linkUsers?: boolean;
  labelKey?: (key: string) => string;
}) {
  return (
    <div className="rounded-md border border-zinc-100 p-2 text-xs dark:border-zinc-800">
      <div className="mb-1 font-medium text-zinc-500">{title}</div>
      {rows.length === 0 ? (
        <p className="text-zinc-500">없음</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2">
              {linkUsers ? (
                <Link
                  href={`/admin?tab=users&q=${encodeURIComponent(row.key)}`}
                  className="min-w-0 truncate font-mono text-sky-700 hover:underline dark:text-sky-300"
                >
                  {row.key}
                </Link>
              ) : (
                <span className="min-w-0 truncate">{labelKey(row.key)}</span>
              )}
              <span className="tabular-nums">{row.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}

function formatPct(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "0%" : "+100%";
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return `${pct > 0 ? "+" : ""}${pct.toLocaleString()}%`;
}

function compensationDraftHref(row: OpsDashboard["compensationReport"]["recent"][number]) {
  const sp = new URLSearchParams();
  sp.set("tab", "users");
  if (row.userId) sp.set("q", row.userId);
  if (row.sourceEventId > 0) sp.set("sourceEventId", String(row.sourceEventId));
  sp.set("draftItemKind", row.itemKind ?? "gold");
  sp.set("draftItemId", row.itemId ?? "");
  sp.set("draftQuantity", String(row.quantity ?? Math.max(0, row.goldDelta)));
  sp.set(
    "draftReason",
    `보정 지급 정정 검토 · 원 지급 event ${row.id}${row.reason ? ` · ${row.reason}` : ""}`,
  );
  return `/admin?${sp.toString()}`;
}

function downloadCompensationCsv(report: OpsDashboard["compensationReport"]) {
  const rows = [
    ["id", "createdAt", "userId", "itemKind", "itemId", "quantity", "goldDelta", "sourceEventId", "reason"],
    ...report.recent.map((row) => [
      row.id,
      row.createdAt,
      row.userId ?? "",
      row.itemKind ?? "",
      row.itemId ?? "",
      row.quantity ?? "",
      row.goldDelta,
      row.sourceEventId || "",
      row.reason ?? "",
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ops-compensations-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function nextDays(count: number) {
  const out: Array<{ key: string; label: string; weekday: number }> = [];
  const today = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }),
      weekday: d.getDay(),
    });
  }
  return out;
}

function hotTimeWarnings(schedules: HotTimeSchedule[]) {
  const active = schedules.filter((row) => row.enabled);
  const warnings: string[] = [];
  for (let day = 0; day <= 6; day += 1) {
    const rows = active
      .filter((row) => row.days.includes(day))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const totalBonus =
        row.bonuses.goldPct +
        row.bonuses.expPct +
        row.bonuses.masteryPct +
        row.bonuses.fishingCoinPct;
      if (totalBonus >= 300) {
        warnings.push(`${WEEKDAY_LABELS[day]} ${row.title || row.id}: 보너스 총합이 높습니다.`);
      }
      const duration = minutesOf(row.endsAt) - minutesOf(row.startsAt);
      if (duration >= 240) {
        warnings.push(`${WEEKDAY_LABELS[day]} ${row.title || row.id}: 4시간 이상 예약입니다.`);
      }
      const next = rows[i + 1];
      if (next && minutesOf(next.startsAt) < minutesOf(row.endsAt)) {
        warnings.push(
          `${WEEKDAY_LABELS[day]} ${row.title || row.id} / ${next.title || next.id}: 시간이 겹칩니다.`,
        );
      }
    }
    if (rows.length === 0) {
      warnings.push(`${WEEKDAY_LABELS[day]}: 반복 핫타임 예약이 없습니다.`);
    }
  }
  return warnings;
}

function minutesOf(value: string) {
  const [h, m] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}
