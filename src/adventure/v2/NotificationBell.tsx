"use client";

// 알림 종 — V2TopBar placeholder 해소(docs/v2-war-visibility-plan.md PR-5).
// 미읽음 수 뱃지(경량 ?count=1 폴링) + 클릭 → /notifications.
// 알림 페이지가 읽음 처리 후 "v2notif:read" 이벤트를 쏘면 즉시 재조회(60s 폴링 안 기다림).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "@phosphor-icons/react";
import { NOTIF_POLL_MS } from "@/lib/v2-notification-config";

export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/notifications?count=1");
      if (!res.ok) return;
      const json = (await res.json()) as { ok?: boolean; unreadCount?: number };
      if (json.ok) setUnread(json.unreadCount ?? 0);
    } catch {
      /* 폴링 — 조용히 무시 */
    }
  }, []);

  useEffect(() => {
    // 비동기 fetch 후 setState — cascading render 아님(ServerFeedView 동일 패턴).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCount();
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchCount();
    };
    const id = setInterval(tick, NOTIF_POLL_MS);
    const onRead = () => void fetchCount();
    window.addEventListener("v2notif:read", onRead);
    return () => {
      clearInterval(id);
      window.removeEventListener("v2notif:read", onRead);
    };
  }, [fetchCount]);

  return (
    <button
      type="button"
      onClick={() => router.push("/notifications")}
      aria-label={unread > 0 ? `알림 ${unread}개` : "알림"}
      className="relative rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <Bell size={18} weight="duotone" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
