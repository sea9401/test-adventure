"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "@phosphor-icons/react";
import { NOTIF_POLL_MS } from "@/lib/v2-notification-config";

// 상단바의 독립 공지사항 진입점. 사용자별 게시판 조회 기록을 가볍게 폴링하고,
// 공지 상세 열람 직후 발생하는 bulletin:read 이벤트에는 즉시 다시 확인한다.
export function V2NoticeLink({
  initialHasUnread = false,
}: {
  initialHasUnread?: boolean;
} = {}) {
  const [hasUnread, setHasUnread] = useState(initialHasUnread);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/bulletin/notices/unread", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const result = (await response.json()) as { hasUnread?: boolean };
      setHasUnread(result.hasUnread === true);
    } catch {
      // 보조 표시이므로 일시적인 네트워크 실패는 다음 폴링에서 회복한다.
    }
  }, []);

  useEffect(() => {
    // 비동기 조회 결과 반영 — cascading render가 아닌 외부 상태 동기화다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const tick = () => {
      if (document.hidden) return;
      void refresh();
    };
    const timer = window.setInterval(tick, NOTIF_POLL_MS);
    const onRead = () => void refresh();
    window.addEventListener("bulletin:read", onRead);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("bulletin:read", onRead);
    };
  }, [refresh]);

  return (
    <Link
      href="/plaza/notices"
      aria-label={hasUnread ? "공지사항, 읽지 않은 공지 있음" : "공지사항"}
      title={hasUnread ? "공지사항 · 새 공지 있음" : "공지사항"}
      className="relative rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <Megaphone size={18} weight="duotone" />
      {hasUnread && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-900"
        />
      )}
    </Link>
  );
}
