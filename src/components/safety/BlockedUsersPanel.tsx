"use client";

import { useEffect, useState } from "react";
import { Prohibit, UserMinus } from "@phosphor-icons/react";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { formatDateTime } from "@/lib/notifications";

type BlockedUser = { userId: string; name: string; createdAt: number };

export function BlockedUsersPanel() {
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/safety/blocks", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json() as Promise<{ blocks: BlockedUser[] }>;
      })
      .then((result) => {
        if (!active) return;
        setUsers(result.blocks);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setUsers([]);
        setError("차단 목록을 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, []);

  const unblock = async (user: BlockedUser) => {
    if (busyUserId) return;
    setBusyUserId(user.userId);
    setError(null);
    try {
      const response = await fetch("/api/safety/blocks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId }),
      });
      if (!response.ok) throw new Error("unblock failed");
      setUsers((current) =>
        current?.filter((entry) => entry.userId !== user.userId) ?? [],
      );
    } catch {
      setError("차단을 해제하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className={`${SURFACE_INSET} p-3`}>
      <div className="flex items-start gap-3">
        <Prohibit
          size={24}
          weight="duotone"
          className="mt-0.5 shrink-0 text-zinc-600 dark:text-zinc-300"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            차단한 사용자
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            차단한 사용자의 콘텐츠는 숨겨지고 서로 새 쪽지나 채팅방 초대를 보낼 수 없습니다.
          </p>

          {users === null ? (
            <p className="mt-3 text-xs text-zinc-500">불러오는 중…</p>
          ) : users.length === 0 ? (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              차단한 사용자가 없습니다.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {users.map((user) => (
                <li
                  key={user.userId}
                  className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-2 dark:border-zinc-700"
                >
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{user.name}</strong>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {formatDateTime(user.createdAt)} 차단
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => unblock(user)}
                    disabled={busyUserId !== null}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <UserMinus size={14} weight="bold" aria-hidden />
                    {busyUserId === user.userId ? "해제 중…" : "차단 해제"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
