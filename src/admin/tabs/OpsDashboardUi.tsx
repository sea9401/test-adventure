"use client";

import { adminActionLabel } from "@/admin/displayLabels";
import { economyEventLabel, economyItemKindLabel } from "@/admin/economyLabels";
import { type CountRow, type Dashboard, type RewardFailureStatus } from "./opsDashboardTypes";
import type { ReactNode } from "react";

export function formatIntervalSec(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  if (seconds < 60) return `${seconds}초`;

  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainSeconds = seconds % 60;
  return [
    hours > 0 ? `${hours}시간` : null,
    minutes > 0 ? `${minutes}분` : null,
    remainSeconds > 0 ? `${remainSeconds}초` : null,
  ]
    .filter(Boolean)
    .join(" ");
}


export function suspicionLabel(severity: Dashboard["suspiciousUsers"][number]["severity"]) {
  if (severity === "strong") return "강한 의심";
  if (severity === "review") return "검토 필요";
  return "주의";
}


export function riskMessageLabel(message: string): string {
  const [head, rest] = message.split(" · ", 2);
  const action = adminActionLabel(head);
  const event = economyEventLabel(head);
  const label = action !== head ? action : event !== head ? event : head;
  if (!rest) return label;

  const [kind, ...tail] = rest.split(" ");
  const itemKind = economyItemKindLabel(kind);
  return `${label} · ${[itemKind, ...tail].join(" ")}`;
}


export function suspicionClass(severity: Dashboard["suspiciousUsers"][number]["severity"]) {
  if (severity === "strong") {
    return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200";
  }
  if (severity === "review") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200";
  }
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
}


export function slowQueryLabel(key: string): string {
  const labels: Record<string, string> = {
    "marketplace.history": "거래소 거래 내역",
    "marketplace.prices": "거래소 시세",
    "me.state.outpost": "내 상태/거점 조회",
  };
  return labels[key] ?? key;
}


export function slowQueryStatusLabel(status: string): string {
  if (status === "cached") return "캐시 적용";
  return status;
}


export function sanctionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ban: "영구 밴",
    suspend: "기간 정지",
    warn: "경고",
  };
  return labels[type] ?? type;
}


export function AlertCard({
  level,
  title,
  message,
  children,
}: {
  level: "danger" | "warning" | "info";
  title: string;
  message: string;
  children?: ReactNode;
}) {
  const tone =
    level === "danger"
      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      : level === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200";
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${tone}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5">{message}</div>
      {children ? (
        <details className="mt-2 border-t border-current/15 pt-2">
          <summary className="cursor-pointer select-none text-[11px] font-medium underline decoration-current/30 underline-offset-2">
            세부 내용 보기
          </summary>
          <div className="mt-2">{children}</div>
        </details>
      ) : null}
    </div>
  );
}


export function toneClass(level: "danger" | "warning" | "info") {
  return level === "danger"
    ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
    : level === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200";
}


export function classificationClass(tone: "danger" | "warning" | "info") {
  return tone === "danger"
    ? "inline-flex rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300"
    : tone === "warning"
      ? "inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      : "inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}


export function statusLabel(status: RewardFailureStatus) {
  if (status === "compensated") return "보정 완료";
  if (status === "ignored") return "제외";
  return "검토 완료";
}


export function formatDelta(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}


export function deltaClass(value: number) {
  if (value > 0) return "text-amber-700 dark:text-amber-300";
  if (value < 0) return "text-emerald-700 dark:text-emerald-300";
  return "text-zinc-500";
}


export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}


export function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "datetime-local" | "time";
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}


export function NumberField({
  label,
  value,
  onChange,
  max = 500,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) =>
          onChange(Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0))))
        }
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}


export function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}


export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details
      open
      className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <summary className="cursor-pointer select-none text-xs font-semibold marker:text-zinc-400">
        {title}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}


export function CountList({
  rows,
  empty,
  labelKey = (key) => key,
}: {
  rows: CountRow[];
  empty: string;
  labelKey?: (key: string) => string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">{empty}</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate">{labelKey(row.key)}</span>
          <span className="shrink-0 tabular-nums text-zinc-500">{row.count.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}


export function MiniList({
  title,
  rows,
  labelKey,
}: {
  title: string;
  rows: CountRow[];
  labelKey?: (key: string) => string;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-zinc-500">{title}</div>
      <CountList rows={rows} empty="없음" labelKey={labelKey} />
    </div>
  );
}
