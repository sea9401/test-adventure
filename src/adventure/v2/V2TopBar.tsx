"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  autoGatheringActivityHref,
  autoGatheringStatusText,
  type AutoGatheringStatus,
} from "./autoGathering";
import { NotificationBell } from "./NotificationBell";
import { V2NoticeLink } from "./V2NoticeLink";
import { V2SettingsMenu } from "./V2SettingsMenu";

// v2 메인 화면 타이틀 줄.
// 좌측: 게임 아이콘(홈) + 자동 생활 작업 상태(진행 중인 생활 화면) 독립 링크.
// 우측: 공지사항 바로가기·통합 알림(일반 알림+우편) 미리보기·광장/설정 메뉴.

function LifeActivityStatus({
  status,
}: {
  status: AutoGatheringStatus | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!status) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const text = autoGatheringStatusText(status, now);
  const ready = status != null && now >= status.readyAt;
  return (
    <span
      title={text}
      className={`min-w-0 max-w-[142px] truncate text-left text-[10px] tabular-nums sm:max-w-[320px] sm:text-[11px] ${
        status == null
          ? "text-zinc-500 dark:text-zinc-400"
          : ready
            ? "font-medium text-amber-700 dark:text-amber-300"
            : "font-medium text-emerald-700 dark:text-emerald-300"
      }`}
    >
      {text}
    </span>
  );
}

export function V2TopBar({
  autoGathering,
}: {
  autoGathering: AutoGatheringStatus | null;
}) {
  const activityHref = autoGatheringActivityHref(autoGathering);

  return (
    <header
      data-game-top-bar
      className="sticky top-0 z-[60] flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-700 dark:bg-zinc-900/90"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/"
          aria-label="무슨무슨게임 홈으로 이동"
          title="홈"
          className="game-brand-mark inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          <Image
            src="/icon-192.png"
            alt=""
            width={32}
            height={32}
            className="game-brand-image size-8 shrink-0 rounded-md"
          />
        </Link>
        {activityHref ? (
          <Link
            href={activityHref}
            aria-label={`${autoGathering?.activity === "woodcutting" ? "벌목" : "채광"} 화면으로 이동`}
            className="flex h-10 min-w-0 items-center rounded-lg border border-zinc-200 bg-white px-3 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <LifeActivityStatus
              key={autoGathering?.readyAt}
              status={autoGathering}
            />
          </Link>
        ) : (
          <div className="flex h-10 min-w-0 items-center rounded-lg border border-zinc-200 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
            <LifeActivityStatus key="rest" status={null} />
          </div>
        )}
      </div>
      <nav className="relative z-[61] flex shrink-0 items-center gap-1">
        <V2NoticeLink />
        <NotificationBell />
        <V2SettingsMenu />
      </nav>
    </header>
  );
}
