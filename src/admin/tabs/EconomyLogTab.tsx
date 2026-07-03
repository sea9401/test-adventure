"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAdmin } from "../AdminContext";
import { adminGet } from "../api";
import { Button } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";

type EconomyEntry = {
  id: number;
  userId: string | null;
  gameName: string | null;
  counterpartyUserId: string | null;
  eventType: string;
  goldDelta: number;
  itemKind: string | null;
  itemId: string | null;
  quantity: number | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

type EconomySummary = {
  currencies: Array<{ key: string; in: number; out: number; net: number; count: number }>;
  events: Array<{ key: string; count: number }>;
  usersByGold: Array<{
    userId: string;
    gameName: string | null;
    goldIn: number;
    goldOut: number;
    net: number;
    count: number;
  }>;
  hourly: Array<{ hour: string; count: number; goldIn: number; goldOut: number }>;
};

export function EconomyLogTab() {
  const { showToast } = useAdmin();
  const [eventType, setEventType] = useState("");
  const [userId, setUserId] = useState("");
  const [itemKind, setItemKind] = useState("");
  const [itemId, setItemId] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");

  const url = useMemo(() => {
    const sp = new URLSearchParams({ limit: "300" });
    if (eventType.trim()) sp.set("eventType", eventType.trim());
    if (userId.trim()) sp.set("userId", userId.trim());
    if (itemKind.trim()) sp.set("itemKind", itemKind.trim());
    if (itemId.trim()) sp.set("itemId", itemId.trim());
    if (since) sp.set("since", since);
    if (until) sp.set("until", until);
    return `/api/admin/economy-log?${sp.toString()}`;
  }, [eventType, itemId, itemKind, since, until, userId]);

  const { data, loading, error, refetch } = useAsyncData<{
    entries: EconomyEntry[];
    summary: EconomySummary;
  }>((signal) => adminGet(url, signal), [url]);

  useEffect(() => {
    if (error) showToast(`조회 실패: ${error}`);
  }, [error, showToast]);

  const entries = data?.entries ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">경제 로그</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            거래소, 상점, 보상 수령의 골드·아이템 흐름을 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${url}&format=csv`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            CSV 다운로드
          </a>
          <Button onClick={() => void refetch()} disabled={loading}>
            {loading ? "조회 중..." : "새로고침"}
          </Button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <Filter label="event" value={eventType} onChange={setEventType} placeholder="marketplace.buy" />
        <Filter label="userId" value={userId} onChange={setUserId} />
        <Filter label="itemKind" value={itemKind} onChange={setItemKind} placeholder="equip" />
        <Filter label="itemId" value={itemId} onChange={setItemId} />
        <DateFilter label="시작" value={since} onChange={setSince} />
        <DateFilter label="종료" value={until} onChange={setUntil} />
      </div>

      {data?.summary ? <SummaryPanel summary={data.summary} onUser={setUserId} /> : null}

      {entries.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중..." : "기록 없음"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5 font-medium">시각</th>
                <th className="px-2 py-1.5 font-medium">유저</th>
                <th className="px-2 py-1.5 font-medium">event</th>
                <th className="px-2 py-1.5 font-medium">골드</th>
                <th className="px-2 py-1.5 font-medium">아이템</th>
                <th className="px-2 py-1.5 font-medium">상세</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-zinc-500">
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-2 py-1.5">
                    {e.gameName ? (
                      <Link href={`/character/${encodeURIComponent(e.gameName)}`} className="underline decoration-zinc-300 underline-offset-2">
                        {e.gameName}
                      </Link>
                    ) : e.userId ? (
                      e.userId.slice(0, 8)
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{e.eventType}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {e.goldDelta.toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 font-mono">
                    {[e.itemKind, e.itemId].filter(Boolean).join(":") || "-"}
                    {e.quantity != null ? ` x${e.quantity}` : ""}
                  </td>
                  <td className="max-w-md truncate px-2 py-1.5 font-mono text-[10px] text-zinc-400">
                    {e.detail ? JSON.stringify(e.detail) : "-"}
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

function SummaryPanel({
  summary,
  onUser,
}: {
  summary: EconomySummary;
  onUser: (userId: string) => void;
}) {
  const maxHourly = Math.max(1, ...summary.hourly.map((row) => row.count));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="재화 증감">
        <div className="space-y-1">
          {summary.currencies.length === 0 ? (
            <EmptyText>집계 없음</EmptyText>
          ) : (
            summary.currencies.map((row) => (
              <div key={row.key} className="grid grid-cols-[1fr_auto] gap-2 text-xs">
                <span className="font-mono">{row.key}</span>
                <span className="tabular-nums">
                  {row.net >= 0 ? "+" : ""}
                  {row.net.toLocaleString()}
                </span>
                <div className="col-span-2 text-[10px] text-zinc-500">
                  in {row.in.toLocaleString()} · out {row.out.toLocaleString()} · {row.count}
                  건
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel title="시간대별 이벤트">
        <div className="space-y-1">
          {summary.hourly.length === 0 ? (
            <EmptyText>집계 없음</EmptyText>
          ) : (
            summary.hourly.slice(-12).map((row) => (
              <div key={row.hour} className="grid grid-cols-[84px_1fr_48px] items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-zinc-500">
                  {row.hour.slice(5)}
                </span>
                <div className="h-2 rounded bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-2 rounded bg-emerald-500"
                    style={{ width: `${Math.max(4, (row.count / maxHourly) * 100)}%` }}
                  />
                </div>
                <span className="text-right tabular-nums">{row.count}</span>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel title="이벤트 Top">
        <CountRows rows={summary.events} />
      </Panel>

      <Panel title="유저별 골드 흐름">
        <div className="space-y-1">
          {summary.usersByGold.length === 0 ? (
            <EmptyText>집계 없음</EmptyText>
          ) : (
            summary.usersByGold.map((row) => (
              <button
                key={row.userId}
                type="button"
                onClick={() => onUser(row.userId)}
                className="grid w-full grid-cols-[1fr_auto] gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className="min-w-0 truncate">
                  {row.gameName ?? row.userId.slice(0, 8)}
                </span>
                <span className="tabular-nums">
                  {row.net >= 0 ? "+" : ""}
                  {row.net.toLocaleString()}
                </span>
                <span className="col-span-2 text-[10px] text-zinc-500">
                  in {row.goldIn.toLocaleString()} · out {row.goldOut.toLocaleString()} ·{" "}
                  {row.count}건
                </span>
              </button>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h4 className="mb-2 text-xs font-semibold">{title}</h4>
      {children}
    </section>
  );
}

function CountRows({ rows }: { rows: Array<{ key: string; count: number }> }) {
  if (rows.length === 0) return <EmptyText>집계 없음</EmptyText>;
  return (
    <ul className="space-y-1 text-xs">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-mono">{row.key}</span>
          <span className="shrink-0 tabular-nums text-zinc-500">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="text-xs text-zinc-500 dark:text-zinc-400">{children}</p>;
}

function Filter({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}
