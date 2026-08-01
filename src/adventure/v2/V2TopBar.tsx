"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  autoGatheringStatusText,
  type AutoGatheringStatus,
} from "./autoGathering";
import { NotificationBell } from "./NotificationBell";
import { V2SettingsMenu } from "./V2SettingsMenu";

// v2 메인 화면 타이틀 줄.
// 좌측: 게임 아이콘 + 자동 생활 작업 상태 — 클릭 시 모험 탭(/)으로 이동.
// 우측: 통합 알림(일반 알림+우편) 미리보기·광장/설정 메뉴.

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
  const router = useRouter();
  return (
    <header className="sticky top-0 z-[60] flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-700 dark:bg-zinc-900/90">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="무슨무슨게임 모험 탭으로 이동"
          className="-mx-1 flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Image
            src="/icon-192.png"
            alt=""
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-md"
          />
          <LifeActivityStatus
            key={autoGathering?.readyAt ?? "rest"}
            status={autoGathering}
          />
        </button>
      </div>
      <nav className="relative z-[61] flex shrink-0 items-center gap-1">
        <NotificationBell />
        <V2SettingsMenu />
      </nav>
    </header>
  );
}
