"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, UsersThree } from "@phosphor-icons/react";
import { adminGet } from "../api";
import { Button } from "../ui/Field";
import { AdminUserLink } from "../ui/AdminUserLink";

const POLL_MS = 10_000;

type OnlineUser = {
  userId: string;
  email: string;
  gameName: string;
  className: string;
  title: string | null;
  lastSeenAt: string;
};

type OnlineUsersResponse = {
  generatedAt: string;
  onlineWindowSeconds: number;
  users: OnlineUser[];
};

function formatLastSeen(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 10) return "방금";
  return `${seconds}초 전`;
}

export function OnlineUsersTab() {
  const [data, setData] = useState<OnlineUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const next = await adminGet<OnlineUsersResponse>(
        "/api/admin/presence",
        signal,
      );
      setData(next);
      setError(null);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "접속자 조회 실패");
    } finally {
      if (!silent && !signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // 초기 관리자 API 조회는 비동기 응답에서 상태를 갱신한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(controller.signal);
    const interval = window.setInterval(() => void refresh(undefined, true), POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [refresh]);

  const onlineUsers = data?.users ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <UsersThree size={22} weight="duotone" />
            </span>
            <div>
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold">현재 접속자</h3>
                <strong className="tabular-nums text-xl text-emerald-700 dark:text-emerald-300">
                  {onlineUsers.length}명
                </strong>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                최근 {data?.onlineWindowSeconds ?? 60}초 이내 하트비트 기준 · 10초마다 자동 갱신
              </p>
            </div>
          </div>
          <Button onClick={() => void refresh()} disabled={loading}>
            <span className="inline-flex items-center gap-1.5">
              <ArrowClockwise size={14} className={loading ? "animate-spin" : ""} />
              {loading ? "조회 중…" : "새로고침"}
            </span>
          </Button>
        </div>
        {error ? (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">모험가</th>
                <th className="px-4 py-2.5 font-medium">직업</th>
                <th className="px-4 py-2.5 font-medium">칭호</th>
                <th className="px-4 py-2.5 font-medium">계정</th>
                <th className="px-4 py-2.5 text-right font-medium">최근 신호</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {onlineUsers.map((user) => (
                <tr key={user.userId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label="접속 중" />
                      <AdminUserLink userId={user.userId} gameName={user.gameName} email={user.email} compact />
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{user.className || "—"}</td>
                  <td className="px-4 py-3 text-amber-700 dark:text-amber-300">{user.title || "—"}</td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{user.email}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500 dark:text-zinc-400" title={new Date(user.lastSeenAt).toLocaleString("ko-KR")}>
                    {formatLastSeen(user.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && onlineUsers.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            현재 접속 중인 유저가 없습니다.
          </p>
        ) : null}
      </section>
    </div>
  );
}
