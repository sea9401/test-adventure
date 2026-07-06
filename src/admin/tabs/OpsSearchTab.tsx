"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "../AdminContext";
import { adminGet } from "../api";
import {
  abuseActionLabel,
  abuseReasonLabel,
  adminActionLabel,
  adminDetailText,
  adminLogLabel,
} from "../displayLabels";
import { economyEventLabel, economyItemLabel } from "../economyLabels";
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
  itemKind?: string | null;
  itemId?: string | null;
  quantity?: number | null;
  summary: string;
  rewardFailureStatus: "open" | "reviewed" | "compensated" | "ignored" | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
  href: string;
  userHref: string | null;
};

export function OpsSearchTab() {
  const { showToast } = useAdmin();
  const [q, setQ] = useState("");
  const [savedFilters, setSavedFilters] = useState<string[]>(() => readSavedFilters());
  const url = useMemo(() => {
    const sp = new URLSearchParams({ limit: "80" });
    if (q.trim().length >= 2) sp.set("q", q.trim());
    return `/api/admin/ops-search?${sp.toString()}`;
  }, [q]);
  const csvUrl = useMemo(() => {
    const sp = new URLSearchParams({ limit: "200", format: "csv" });
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
  const saveFilter = () => {
    const value = q.trim();
    if (value.length < 2) return;
    const next = [value, ...savedFilters.filter((row) => row !== value)].slice(0, 12);
    setSavedFilters(next);
    writeSavedFilters(next);
    showToast("검색어 저장됨");
  };
  const removeFilter = (value: string) => {
    const next = savedFilters.filter((row) => row !== value);
    setSavedFilters(next);
    writeSavedFilters(next);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">운영 로그 통합 검색</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            유저 ID, 캐릭터명, IP, 이벤트 ID, 행동, 아이템 ID를 이상 행동·경제·감사 로그에서 함께 찾습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={csvUrl}
            className={`rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700 ${
              q.trim().length < 2
                ? "pointer-events-none opacity-50"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            CSV
          </Link>
          <Button onClick={() => void refetch()} disabled={loading || q.trim().length < 2}>
            {loading ? "조회 중..." : "새로고침"}
          </Button>
        </div>
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
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <Button onClick={saveFilter} disabled={q.trim().length < 2}>
          검색어 저장
        </Button>
        {savedFilters.map((filter) => (
          <span
            key={filter}
            className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <button
              type="button"
              onClick={() => setQ(filter)}
              className="font-mono hover:underline"
            >
              {filter}
            </button>
            <button
              type="button"
              onClick={() => removeFilter(filter)}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              x
            </button>
          </span>
        ))}
      </div>

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
                <th className="px-2 py-1.5 font-medium">보상 실패</th>
                <th className="px-2 py-1.5 font-medium">요약</th>
                <th className="px-2 py-1.5 font-medium">바로가기</th>
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
                  <td className="px-2 py-1.5">{adminLogLabel(entry.log)}</td>
                  <td className="px-2 py-1.5 font-mono">
                    <Link
                      href={entry.href}
                      className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                    >
                      {entry.eventId}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">
                    {entry.userHref ? (
                      <Link
                        href={entry.userHref}
                        className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                      >
                        {entry.gameName ?? entry.userId?.slice(0, 10) ?? "-"}
                      </Link>
                    ) : (
                      (entry.gameName ?? entry.userId?.slice(0, 10) ?? "-")
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="text-zinc-800 dark:text-zinc-100">
                      {entryTitle(entry)}
                    </div>
                    {entrySubtitle(entry) ? (
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {entrySubtitle(entry)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-[11px]">
                    {entry.rewardFailureStatus ? rewardFailureStatusLabel(entry.rewardFailureStatus) : "-"}
                  </td>
                  <td className="max-w-[300px] truncate px-2 py-1.5 text-[11px] text-zinc-500">
                    {entry.summary || adminDetailText(entry.detail)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Link
                      href={entry.href}
                      className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                    >
                      로그
                    </Link>
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

function entryTitle(entry: OpsSearchEntry): string {
  if (entry.log === "abuse") return abuseActionLabel(entry.title);
  if (entry.log === "economy") return economyEventLabel(entry.title);
  return adminActionLabel(entry.title);
}

function entrySubtitle(entry: OpsSearchEntry): string {
  if (entry.log === "abuse") return abuseReasonLabel(entry.subtitle);
  if (entry.log === "economy") {
    const item = economyItemLabel(entry.itemKind ?? null, entry.itemId ?? null);
    const quantity = entry.quantity != null ? `x${entry.quantity.toLocaleString()}` : "";
    return [item === "-" ? "" : item, quantity].filter(Boolean).join(" · ");
  }
  return entry.subtitle;
}

function rewardFailureStatusLabel(
  status: NonNullable<OpsSearchEntry["rewardFailureStatus"]>,
) {
  if (status === "open") return "후보";
  if (status === "reviewed") return "검토 완료";
  if (status === "compensated") return "보정 완료";
  return "제외";
}

const SAVED_FILTER_KEY = "ops-search.saved-filters.v1";

function readSavedFilters() {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(SAVED_FILTER_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((row): row is string => typeof row === "string" && row.trim().length >= 2).slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

function writeSavedFilters(values: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SAVED_FILTER_KEY, JSON.stringify(values.slice(0, 12)));
}
