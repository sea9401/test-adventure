"use client";

import { useAdmin } from "@/admin/AdminContext";
import { adminGet, adminPost } from "@/admin/api";
import {
  economyEventLabel,
  economyItemKindLabel,
  economyKnownItemName,
} from "@/admin/economyLabels";
import {
  type Dashboard,
  type RewardCompensationPreset,
  type RewardFailureStatus,
  type RewardFailureStatusEntry,
} from "./opsDashboardTypes";
import {
  classificationClass,
  Metric,
  MiniList,
  Panel,
  statusLabel,
  TextField,
} from "./OpsDashboardUi";
import { AdminUserLink } from "@/admin/ui/AdminUserLink";
import { Button, InlineInput } from "@/admin/ui/Field";
import { type AdminUserIdentity } from "@/admin/useAdminUserDirectory";
import { useAsyncData } from "@/lib/useAsyncData";
import Link from "next/link";
import { useEffect, useState } from "react";

export const COMP_KIND_OPTIONS: RewardCompensationPreset["itemKind"][] = [
  "gold",
  "fishing_coin",
  "mastery_certificate",
  "stamina_potion",
  "material",
];


export function CompensationOverviewPanel({
  overview,
}: {
  overview: Dashboard["compensationOverview"];
}) {
  return (
    <Panel title="보정 지급 안전 요약">
      <div className="grid gap-2 md:grid-cols-3">
        <Metric label="24시간 보정" value={overview.count} />
        <Metric label="대상 유저" value={overview.userCount} />
        <Metric label="총 수량" value={overview.totalQuantity} />
      </div>
      {overview.byKind.length > 0 ? (
        <div className="mt-2">
          <MiniList title="품목별" rows={overview.byKind} labelKey={economyItemKindLabel} />
        </div>
      ) : null}
    </Panel>
  );
}


export function RewardFailurePanel({
  rows,
  onDone,
  userDirectory,
}: {
  rows: Dashboard["rewardFailureCandidates"];
  onDone: () => void;
  userDirectory: Record<string, AdminUserIdentity>;
}) {
  const { showToast } = useAdmin();
  const [selected, setSelected] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<RewardFailureStatus>("reviewed");
  const [saving, setSaving] = useState(false);
  const selectedSet = new Set(selected);

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const markReviewed = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      await adminPost("/api/admin/reward-failures/resolve", {
        eventIds: selected,
        note,
        status,
      });
      setSelected([]);
      setNote("");
      showToast("선택 보상 실패 상태 저장됨");
      onDone();
    } catch (e) {
      showToast(`처리 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="보상 실패 보정 후보">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">후보 없음</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <TextField
              label="처리 메모"
              value={note}
              onChange={setNote}
            />
            <label className="space-y-1 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">상태</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RewardFailureStatus)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="reviewed">검토 완료</option>
                <option value="compensated">보정 완료</option>
                <option value="ignored">제외</option>
              </select>
            </label>
            <Button
              onClick={() => void markReviewed()}
              disabled={saving || selected.length === 0}
            >
              {saving ? "처리 중..." : `선택 ${selected.length}건 검토 처리`}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">선택</th>
                  <th className="py-1 pr-3 font-medium">event id</th>
                  <th className="py-1 pr-3 font-medium">유저</th>
                  <th className="py-1 pr-3 font-medium">추정</th>
                  <th className="hidden py-1 pr-3 font-medium md:table-cell">유형</th>
                  <th className="hidden py-1 pr-3 font-medium md:table-cell">시각</th>
                  <th className="py-1 pr-3 font-medium">조치</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td className="py-1 pr-3 font-mono">{row.id}</td>
                    <td className="py-1 pr-3">
                      {row.userId ? (
                        <AdminUserLink
                          userId={row.userId}
                          gameName={userDirectory[row.userId]?.gameName}
                          email={userDirectory[row.userId]?.email}
                        />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-1 pr-3">
                      <div className={classificationClass(row.classification.tone)}>
                        {row.classification.label}
                      </div>
                      <div className="mt-0.5 hidden max-w-[240px] text-[11px] text-zinc-500 md:block">
                        {row.classification.action}
                      </div>
                    </td>
                    <td className="hidden py-1 pr-3 md:table-cell">
                      {row.itemId ? economyKnownItemName(row.itemId) : economyEventLabel(row.eventType)}
                    </td>
                    <td className="hidden py-1 pr-3 text-zinc-500 md:table-cell">
                      {new Date(row.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="py-1 pr-3">
                      {row.userId ? (
                        <Link
                          href={`/admin?tab=users&q=${encodeURIComponent(row.userId)}&sourceEventId=${row.id}`}
                          className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                        >
                          유저 보정
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}


export function RewardFailureStatusPanel({
  rows,
  onDone,
}: {
  rows: RewardFailureStatusEntry[];
  onDone: () => void;
}) {
  const { showToast } = useAdmin();
  const [filter, setFilter] = useState<RewardFailureStatus | "all">("all");
  const [savingId, setSavingId] = useState<number | null>(null);
  const filtered = filter === "all" ? rows : rows.filter((row) => row.status === filter);

  const reopen = async (eventId: number) => {
    setSavingId(eventId);
    try {
      await adminPost("/api/admin/reward-failures/resolve", {
        eventIds: [eventId],
        note: "후보로 되돌림",
        status: "open",
      });
      showToast("보상 실패 후보로 되돌림");
      onDone();
    } catch (e) {
      showToast(`되돌리기 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Panel title="최근 보상 실패 처리 상태">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">처리 이력 없음</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">상태 필터</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as RewardFailureStatus | "all")}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="all">전체</option>
              <option value="reviewed">검토 완료</option>
              <option value="compensated">보정 완료</option>
              <option value="ignored">제외</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">event id</th>
                  <th className="py-1 pr-3 font-medium">상태</th>
                  <th className="py-1 pr-3 font-medium">관리자</th>
                  <th className="py-1 pr-3 font-medium">메모</th>
                  <th className="py-1 pr-3 font-medium">시각</th>
                  <th className="py-1 pr-3 font-medium">조치</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.eventId} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-3 font-mono">{row.eventId}</td>
                    <td className="py-1 pr-3">{statusLabel(row.status)}</td>
                    <td className="py-1 pr-3 text-zinc-500">{row.adminEmail}</td>
                    <td className="py-1 pr-3">{row.note || "-"}</td>
                    <td className="py-1 pr-3 text-zinc-500">
                      {new Date(row.updatedAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="py-1 pr-3">
                      <Button
                        onClick={() => void reopen(row.eventId)}
                        disabled={savingId === row.eventId}
                      >
                        {savingId === row.eventId ? "처리 중..." : "후보로"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                필터에 맞는 이력 없음
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Panel>
  );
}


export function CompensationPresetPanel() {
  const { showToast } = useAdmin();
  const { data, loading, error, refetch } = useAsyncData<{
    rewardCompensationPresets: RewardCompensationPreset[];
    rewardCompensationPresetsUpdatedByEmail: string | null;
    rewardCompensationPresetsUpdatedAt: string | null;
  }>((signal) => adminGet("/api/admin/ops-settings", signal));
  const { data: auditData } = useAsyncData<{
    entries: Array<{
      id: number;
      adminEmail: string;
      detail: Record<string, unknown> | null;
      createdAt: string;
    }>;
  }>((signal) =>
    adminGet(
      "/api/admin/audit-log?action=ops-settings.reward-compensation-presets.update&limit=5",
      signal,
    ),
  );
  const [draft, setDraft] = useState<RewardCompensationPreset[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 서버 설정을 편집 draft 로 복사한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.rewardCompensationPresets) setDraft(data.rewardCompensationPresets);
  }, [data]);
  useEffect(() => {
    if (error) showToast(`프리셋 조회 실패: ${error}`);
  }, [error, showToast]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await adminPost<{
        rewardCompensationPresets: RewardCompensationPreset[];
      }>("/api/admin/ops-settings", { rewardCompensationPresets: draft });
      setDraft(saved.rewardCompensationPresets);
      showToast("보상 보정 프리셋 저장됨");
      void refetch();
    } catch (e) {
      showToast(`저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  const update = (id: string, patch: Partial<RewardCompensationPreset>) => {
    setDraft((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <Panel title="보상 보정 프리셋 관리">
      {loading && draft.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">불러오는 중...</p>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1 pr-2 font-medium">이름</th>
                  <th className="py-1 pr-2 font-medium">종류</th>
                  <th className="py-1 pr-2 font-medium">itemId</th>
                  <th className="py-1 pr-2 font-medium">수량</th>
                  <th className="py-1 pr-2 font-medium">사유</th>
                  <th className="py-1 pr-2 font-medium">삭제</th>
                </tr>
              </thead>
              <tbody>
                {draft.map((preset) => (
                  <tr key={preset.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-2">
                      <InlineInput
                        label={`${preset.label} 프리셋 이름`}
                        value={preset.label}
                        onChange={(label) => update(preset.id, { label })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        aria-label={`${preset.label} 보상 종류`}
                        value={preset.itemKind}
                        onChange={(e) =>
                          update(preset.id, {
                            itemKind: e.target.value as RewardCompensationPreset["itemKind"],
                          })
                        }
                        className="w-full rounded border border-zinc-300 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        {COMP_KIND_OPTIONS.map((kind) => (
                          <option key={kind} value={kind}>
                            {economyItemKindLabel(kind)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <InlineInput
                        label={`${preset.label} 아이템 ID`}
                        value={preset.itemId}
                        onChange={(itemId) => update(preset.id, { itemId })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        aria-label={`${preset.label} 수량`}
                        type="number"
                        min={1}
                        value={preset.quantity}
                        onChange={(e) =>
                          update(preset.id, {
                            quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                          })
                        }
                        className="w-24 rounded border border-zinc-300 bg-white px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <InlineInput
                        label={`${preset.label} 사유`}
                        value={preset.reason}
                        onChange={(reason) => update(preset.id, { reason })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Button
                        onClick={() =>
                          setDraft((prev) => prev.filter((row) => row.id !== preset.id))
                        }
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() =>
                setDraft((prev) => [
                  ...prev,
                  {
                    id: `preset-${Date.now().toString(36)}`,
                    label: "새 프리셋",
                    itemKind: "fishing_coin",
                    itemId: "",
                    quantity: 1,
                    reason: "보상 보정",
                  },
                ])
              }
            >
              추가
            </Button>
            <Button onClick={() => void save()} disabled={saving || draft.length === 0}>
              {saving ? "저장 중..." : "프리셋 저장"}
            </Button>
          </div>
          <div className="rounded-md border border-zinc-100 p-2 text-[11px] dark:border-zinc-800">
            <div className="text-zinc-500 dark:text-zinc-400">
              마지막 수정 {data?.rewardCompensationPresetsUpdatedByEmail ?? "-"} ·{" "}
              {data?.rewardCompensationPresetsUpdatedAt
                ? new Date(data.rewardCompensationPresetsUpdatedAt).toLocaleString("ko-KR")
                : "-"}
            </div>
            {auditData?.entries?.length ? (
              <ul className="mt-1 space-y-1">
                {auditData.entries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap justify-between gap-2">
                    <span>{entry.adminEmail}</span>
                    <span className="text-zinc-500">
                      {new Date(entry.createdAt).toLocaleString("ko-KR")} ·{" "}
                      {Number(entry.detail?.count ?? 0).toLocaleString()}개
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    </Panel>
  );
}
