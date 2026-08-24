"use client";

import Link from "next/link";
import { Coins, Lightning } from "@phosphor-icons/react";
import type { StaminaState } from "./stamina";
import { NotificationBell } from "./NotificationBell";
import { V2SettingsMenu } from "./V2SettingsMenu";
import { SURFACE_INSET } from "@/components/ui/surfaces";

const numberFormatter = new Intl.NumberFormat("ko-KR");

export function V2TopBar({
  stamina,
  staminaMax,
  spendableGold,
}: {
  stamina: StaminaState;
  staminaMax: number;
  spendableGold: number;
}) {
  return (
    <div
      data-game-top-bar
      className="border-b border-zinc-200 px-3 py-1 sm:px-4 dark:border-zinc-700"
    >
      <div className="flex w-full items-center justify-between gap-3">
        <Link
          href="/"
          aria-label="무슨무슨게임 홈으로 이동"
          className="flex min-h-11 min-w-0 items-center rounded-lg px-1 text-sm font-extrabold tracking-tight text-zinc-900 transition-colors hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:text-base dark:text-zinc-100 dark:hover:text-violet-300"
        >
          <span className="truncate">무슨무슨게임</span>
        </Link>

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
