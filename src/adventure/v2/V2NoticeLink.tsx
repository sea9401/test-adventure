"use client";

import Link from "next/link";
import { Megaphone } from "@phosphor-icons/react";
import { useChromeStatus } from "./ChromeStatusProvider";

// 상단바 공지사항 진입점. 조회는 ChromeStatusProvider가 알림·우편과 함께 수행한다.
export function V2NoticeLink({
  initialHasUnread = false,
}: {
  initialHasUnread?: boolean;
} = {}) {
  const chromeStatus = useChromeStatus();
  const hasUnread = chromeStatus?.hasUnreadNotice ?? initialHasUnread;

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
