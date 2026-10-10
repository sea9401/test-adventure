"use client";

import Link from "next/link";
import { Tent } from "@phosphor-icons/react";
import { LIFE_FESTIVAL_THEMES } from "@/adventure/data/v2/lifeFestival";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { lifeFestivalBonus, type LifeFestivalActivity } from "./lifeFestival";

// 생활 활동 화면 상단 한 줄 — 이번 주 축제 테마가 이 활동이면 효과를 알리고 축제 화면으로 잇는다.
export function LifeFestivalBadge({
  activity,
  now,
}: {
  activity: LifeFestivalActivity;
  now?: Date;
}) {
  const bonus = lifeFestivalBonus(activity, now ?? new Date());
  const theme = LIFE_FESTIVAL_THEMES.find((entry) => entry.id === bonus.themeId);
  if (!theme) return null;
  return (
    <Link
      href="/town/festival"
      className={`${SURFACE_INSET} flex min-h-10 items-center gap-2 px-3 py-2 text-sm text-zinc-700 transition-colors hover:border-rose-300 dark:text-zinc-200 dark:hover:border-rose-800`}
    >
      <Tent size={18} weight="duotone" className="shrink-0 text-rose-500" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">축제 진행 중 · {theme.name}</span>
        <span className="text-zinc-500 dark:text-zinc-400">: {theme.effectText}</span>
      </span>
    </Link>
  );
}
