"use client";

import { useEffect, useMemo, useState } from "react";
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

  const { data, loading, error, refetch } = useAsyncData<{ entries: EconomyEntry[] }>(
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
          <h3 className="text-sm font-semibold">경제 로그</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            거래소, 상점, 보상 수령의 골드·아이템 흐름을 확인합니다.
          </p>
        </div>
        <Button onClick={() => void refetch()} disabled={loading}>
          {loading ? "조회 중..." : "새로고침"}
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <Filter label="event" value={eventType} onChange={setEventType} placeholder="marketplace.buy" />
        <Filter label="userId" value={userId} onChange={setUserId} />
        <Filter label="itemKind" value={itemKind} onChange={setItemKind} placeholder="equip" />
        <Filter label="itemId" value={itemId} onChange={setItemId} />
        <DateFilter label="시작" value={since} onChange={setSince} />
        <DateFilter label="종료" value={until} onChange={setUntil} />
      </div>

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
