"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Coins, Lightning } from "@phosphor-icons/react";
import type { StaminaState } from "./stamina";
import {
  autoGatheringActivityHref,
  autoGatheringStatusDisplay,
  type AutoGatheringStatus,
} from "./autoGathering";
import { NotificationBell } from "./NotificationBell";
import { V2SettingsMenu } from "./V2SettingsMenu";
import { SURFACE_INSET } from "@/components/ui/surfaces";

const numberFormatter = new Intl.NumberFormat("ko-KR");

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
  stamina,
  staminaMax,
  spendableGold,
  autoGathering,
  fishingActive,
}: {
  stamina: StaminaState;
  staminaMax: number;
  spendableGold: number;
  autoGathering: AutoGatheringStatus | null;
  fishingActive: boolean;
}) {
  const activityHref = autoGatheringActivityHref(autoGathering);

  return (
    <div
      data-game-top-bar
      className="border-b border-zinc-200 px-3 py-1 sm:px-4 dark:border-zinc-700"
    >
      <div className="flex w-full items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
          <Link
            href="/"
            aria-label="무슨무슨게임 홈으로 이동"
            title="홈"
            className={`${SURFACE_INSET} inline-flex size-10 shrink-0 items-center justify-center border-0 shadow-none transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:hover:bg-zinc-800`}
          >
            <Image
              src="/icon-192.png"
              alt=""
              width={32}
              height={32}
              unoptimized
              className="size-8 shrink-0 rounded-md"
            />
          </Link>
          {activityHref ? (
            <Link
              href={activityHref}
              aria-label={`${autoGathering?.activity === "woodcutting" ? "벌목" : "채광"} 화면으로 이동`}
              className={`${SURFACE_INSET} flex h-10 min-w-0 items-center border-0 px-2 shadow-none transition-colors hover:bg-zinc-100 sm:px-3 dark:hover:bg-zinc-800`}
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
              className={`${SURFACE_INSET} flex h-10 min-w-0 items-center border-0 px-2 shadow-none transition-colors hover:bg-zinc-100 sm:px-3 dark:hover:bg-zinc-800`}
            >
              <span className="truncate text-[10px] font-medium text-emerald-700 sm:text-[11px] dark:text-emerald-300">
                낚시 중
              </span>
            </Link>
          ) : (
            <div
              className={`${SURFACE_INSET} flex h-10 min-w-0 items-center border-0 px-2 shadow-none sm:px-3`}
            >
              <LifeActivityStatus key="rest" status={null} />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            aria-label={`스태미나 ${stamina.current} / ${staminaMax}`}
            className={`${SURFACE_INSET} inline-flex min-h-8 items-center gap-1 border-0 px-2 py-1 text-[11px] font-semibold tabular-nums text-zinc-600 shadow-none dark:text-zinc-300`}
          >
            <Lightning size={12} weight="fill" className="text-orange-500" aria-hidden />
            {numberFormatter.format(stamina.current)} / {numberFormatter.format(staminaMax)}
          </span>
          <span
            data-topbar-gold
            aria-label={`사용 가능 골드 ${numberFormatter.format(spendableGold)}`}
            className={`${SURFACE_INSET} hidden min-h-8 items-center gap-1 border-0 px-2 py-1 text-[11px] font-semibold tabular-nums text-zinc-600 shadow-none sm:inline-flex dark:text-zinc-300`}
          >
            <Coins size={12} weight="fill" className="text-amber-500" aria-hidden />
            {numberFormatter.format(spendableGold)}
          </span>
          <nav className="relative z-[61] flex items-center gap-0.5" aria-label="빠른 메뉴">
            <NotificationBell />
            <V2SettingsMenu />
          </nav>
        </div>
      </div>
    </div>
  );
}
