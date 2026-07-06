"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAdmin } from "../AdminContext";
import { adminGet } from "../api";
import { useAsyncData } from "@/lib/useAsyncData";
import { Button } from "../ui/Field";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";

type Entry = {
  id: number;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  targetGameName: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  "grant.v2": "아이템 지급",
  "mail.broadcast": "전체 우편",
  "mail.user": "개별 우편",
  "reset-character": "캐릭터 초기화",
  "sanction.ban": "영구 밴",
  "sanction.suspend": "기간 정지",
  "sanction.warn": "경고",
  "sanction.lift": "제재 해제",
  "season-ops.pvp-rollover": "아레나 시즌 정리",
  "season-ops.pvp-rewards": "아레나 보상 지급",
  "season-ops.fishing-rewards": "낚시 보상 지급",
  "season-ops.treasure-rewards": "발굴 보상 지급",
};

const GRANT_KEY_LABELS: Record<string, string> = {
  materials: "재료",
  hpCharges: "HP 충전약",
  mpCharges: "MP 충전약",
  proficiencyEarned: "숙련도",
  masteryEarned: "직업 숙련도",
  equipmentOwned: "장비",
  equipmentNoOp: "장비 변경 없음",
  staminaRefilled: "스태미나 회복",
  rareMapGranted: "레어맵",
  fishingCoins: "낚시 코인",
  treasureCoins: "발굴 코인",
};

// 관리자 감사 로그 — 모든 admin 변경 행동의 최신순 기록(읽기 전용).
export function AuditLogTab() {
  const { showToast } = useAdmin();
  const searchParams = useSearchParams();
  const [adminEmail, setAdminEmail] = useState(searchParams.get("adminEmail") ?? "");
  const [action, setAction] = useState(searchParams.get("action") ?? "");
  const [targetUserId, setTargetUserId] = useState(
    searchParams.get("targetUserId") ?? "",
  );
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");

  const url = useMemo(() => {
    const sp = new URLSearchParams({ limit: "300" });
    if (adminEmail.trim()) sp.set("adminEmail", adminEmail.trim());
    const actionFilter = resolveActionFilter(action);
    if (actionFilter) sp.set("action", actionFilter);
    if (targetUserId.trim()) sp.set("targetUserId", targetUserId.trim());
    if (since) sp.set("since", since);
    if (until) sp.set("until", until);
    return `/api/admin/audit-log?${sp.toString()}`;
  }, [action, adminEmail, since, targetUserId, until]);

  const {
    data,
    loading,
    error,
    refetch: refresh,
  } = useAsyncData<{ entries: Entry[] }>(
    (signal) => adminGet(url, signal),
    [url],
  );

  useEffect(() => {
    if (error) showToast(`조회 실패: ${error}`);
  }, [error, showToast]);

  const entries = data?.entries ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">감사 로그</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            관리자 변경 행동(제재·지급·초기화·시즌 운영 등)의 기록.
          </p>
        </div>
        <Button onClick={() => void refresh()} disabled={loading}>
          {loading ? "조회 중…" : "새로고침"}
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">관리자 이메일</span>
          <input
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">행동</span>
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="예: 아이템 지급"
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">대상 유저 ID</span>
          <input
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">시작</span>
          <input
            type="datetime-local"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">종료</span>
          <input
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
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
                <th className="px-2 py-1.5 font-medium">요약</th>
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
                  <td className="px-2 py-1.5 font-medium text-zinc-800 dark:text-zinc-100">
                    {actionLabel(e.action)}
                  </td>
                  <td className="px-2 py-1.5 text-zinc-600 dark:text-zinc-300">
                    {e.targetGameName ? (
                      <Link
                        href={`/admin?tab=users&q=${encodeURIComponent(e.targetUserId ?? e.targetGameName)}`}
                        className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                      >
                        {e.targetGameName}
                      </Link>
                    ) : e.targetUserId ? (
                      e.targetUserId.slice(0, 8)
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-[260px] px-2 py-1.5 text-zinc-600 dark:text-zinc-300">
                    {auditSummary(e)}
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {auditDetailText(e.detail)}
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

function auditSummary(entry: Entry) {
  const detail = entry.detail ?? {};
  if (entry.action.startsWith("sanction.")) {
    return [
      "제재",
      stringValue(detail.reason),
      stringValue(detail.adminMemo),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (entry.action === "reward.compensate") {
    return [
      "보상 보정",
      stringValue(detail.itemKind),
      numberValue(detail.quantity),
      stringValue(detail.reason),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (entry.action.startsWith("ops-user-notes.")) {
    return entry.action.endsWith(".add")
      ? "운영 메모 추가"
      : entry.action.endsWith(".resolve")
        ? "운영 메모 처리"
        : entry.action.endsWith(".reopen")
          ? "운영 메모 재오픈"
          : "운영 메모 삭제";
  }
  if (entry.action.startsWith("ops-settings.")) return "운영 설정 변경";
  if (entry.action === "grant.v2") {
    const granted = Array.isArray(detail.granted)
      ? detail.granted
          .map((v) => (typeof v === "string" ? GRANT_KEY_LABELS[v] ?? v : null))
          .filter(Boolean)
          .join(", ")
      : "";
    return granted ? `지급: ${granted}` : "아이템 지급";
  }
  if (entry.action === "reset-character") return "캐릭터 초기화";
  return stringValue(detail.reason) ?? stringValue(detail.adminMemo) ?? "변경 기록";
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function resolveActionFilter(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  const found = Object.entries(ACTION_LABELS).find(
    ([key, label]) => key === value || label === value,
  );
  return found?.[0] ?? value;
}

function auditDetailText(detail: Record<string, unknown> | null) {
  if (!detail) return "—";
  const parts: string[] = [];
  const gameName = stringValue(detail.gameName);
  if (gameName) parts.push(`대상 ${gameName}`);
  const gold = numberValue(detail.gold);
  if (gold) parts.push(`${gold} 골드`);
  const recipients = numberValue(detail.recipients);
  if (recipients) parts.push(`수신 ${recipients}명`);
  const materials = attachmentList(detail.materials, "material");
  if (materials) parts.push(`재료 ${materials}`);
  const items = attachmentList(detail.items, "equipment");
  if (items) parts.push(`장비 ${items}`);
  const staminaPotions = numberValue(detail.staminaPotions);
  if (staminaPotions) parts.push(`스태미나 회복약 ${staminaPotions}개`);
  const reason = stringValue(detail.reason);
  if (reason) parts.push(`사유 ${reason}`);
  const days = numberValue(detail.days);
  if (days) parts.push(`${days}일`);
  const message = stringValue(detail.message);
  if (message) parts.push(`메시지 "${message}"`);
  return parts.length ? parts.join(" · ") : compactDetail(detail);
}

function stringValue(raw: unknown) {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 120) : null;
}

function numberValue(raw: unknown) {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) && value > 0 ? value.toLocaleString() : null;
}

function attachmentList(raw: unknown, kind: "material" | "equipment") {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const id =
        kind === "material" ? stringValue(row.materialId) : stringValue(row.itemId);
      const count = numberValue(row.count);
      if (!id || !count) return null;
      const name =
        kind === "material"
          ? (V2_MATERIALS[id as keyof typeof V2_MATERIALS]?.name ?? id)
          : (V2_EQUIPMENT[id as keyof typeof V2_EQUIPMENT]?.name ?? id);
      return `${name} x${count}`;
    })
    .filter((v): v is string => Boolean(v));
  return rows.length ? rows.join(", ") : null;
}

function compactDetail(detail: Record<string, unknown>) {
  return Object.entries(detail)
    .map(([key, value]) => `${key}: ${compactValue(key, value)}`)
    .join(" · ");
}

function compactValue(key: string, value: unknown): string {
  if (typeof value === "string") {
    if (key === "materialId") {
      return V2_MATERIALS[value as keyof typeof V2_MATERIALS]?.name ?? value;
    }
    if (key === "itemId" || key === "equipmentId") {
      return V2_EQUIPMENT[value as keyof typeof V2_EQUIPMENT]?.name ?? value;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => compactValue(key, v)).join(", ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${compactValue(k, v)}`)
      .join(", ");
  }
  return "—";
}
