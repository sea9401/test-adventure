"use client";

// 우편 배지 — V2TopBar. 미수령 우편 수(경량 ?count=1 폴링) + 클릭 → 우편함.
// 우편함 변경(수령/초대) 후 "v2inbox:refresh" 이벤트를 쏘면 즉시 재조회(60s 폴링 안 기다림).
// NotificationBell(전쟁 알림) 과 같은 패턴 — 시즌 순위 보상 등 우편이 오면 배지로 알린다.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Envelope } from "@phosphor-icons/react";
import { NOTIF_POLL_MS } from "@/lib/v2-notification-config";

export function MailboxBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/marketplace/inbox?count=1");
      if (!res.ok) return;
      const json = (await res.json()) as { unclaimedCount?: number };
      setUnread(json.unclaimedCount ?? 0);
    } catch {
      /* 폴링 — 조용히 무시 */
    }
  }, []);

  useEffect(() => {
    // 비동기 fetch 후 setState — cascading render 아님(NotificationBell 동일 패턴).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCount();
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchCount();
    };
    const id = setInterval(tick, NOTIF_POLL_MS);
    const onRefresh = () => void fetchCount();
    window.addEventListener("v2inbox:refresh", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("v2inbox:refresh", onRefresh);
    };
  }, [fetchCount]);

  return (
    <button
      type="button"
      onClick={() => router.push("/plaza/inbox")}
      aria-label={unread > 0 ? `우편 ${unread}개` : "우편함"}
      className="relative rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <Envelope size={18} weight="duotone" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
