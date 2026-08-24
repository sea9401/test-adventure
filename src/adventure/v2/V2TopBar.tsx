"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  autoGatheringActivityHref,
  autoGatheringStatusDisplay,
  type AutoGatheringStatus,
} from "./autoGathering";
import { NotificationBell } from "./NotificationBell";
import { V2NoticeLink } from "./V2NoticeLink";
import { V2SettingsMenu } from "./V2SettingsMenu";
import { buttonClassName } from "@/components/ui/Button";
import {
  SURFACE_FROSTED_BAR,
  SURFACE_INSET,
} from "@/components/ui/surfaces";

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

  const display = autoGatheringStatusDisplay(status, now);
  const ready = status != null && now >= status.readyAt;
  return (
    <span
      title={display.text}
      className={`flex min-w-0 max-w-[142px] items-center gap-1 text-left text-[10px] tabular-nums sm:max-w-[320px] sm:text-[11px] ${
        status == null
          ? "text-zinc-500 dark:text-zinc-400"
          : ready
            ? "font-medium text-amber-700 dark:text-amber-300"
            : "font-medium text-emerald-700 dark:text-emerald-300"
      }`}
    >
      <span className="min-w-0 truncate">{display.contextLabel}</span>
      {display.stateLabel ? (
        <span
          data-auto-gathering-status-detail
          className="shrink-0 whitespace-nowrap"
        >
          {display.stateLabel}
        </span>
      ) : null}
    </span>
  );
}

export function V2TopBar({
  autoGathering,
  fishingActive,
}: {
  autoGathering: AutoGatheringStatus | null;
  fishingActive: boolean;
}) {
  const activityHref = autoGatheringActivityHref(autoGathering);

  return (
    <header
      data-game-top-bar
      className={`${SURFACE_FROSTED_BAR} sticky top-0 z-[60] flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/"
          aria-label="무슨무슨게임 홈으로 이동"
          title="홈"
          className={buttonClassName({
            variant: "secondary",
            size: "icon",
            className: "game-brand-mark",
          })}
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
            className={buttonClassName({
              variant: "secondary",
              size: "sm",
              className: "min-w-0 px-3 text-left",
            })}
          >
            <LifeActivityStatus
              key={autoGathering?.readyAt}
              status={autoGathering}
            />
          </Link>
        ) : fishingActive ? (
          <Link
            href="/town/fishing"
            aria-label="낚시 화면으로 이동"
            className={buttonClassName({
              variant: "secondary",
              size: "sm",
              className: "min-w-0 px-3 text-left",
            })}
          >
            <span className="text-[10px] font-medium text-emerald-700 sm:text-[11px] dark:text-emerald-300">
              낚시 중
            </span>
          </Link>
        ) : (
          <div className={`${SURFACE_INSET} flex min-h-10 min-w-0 items-center px-3`}>
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
