"use client";

import { FilmStrip } from "@phosphor-icons/react";
import type { CoopRecentAttack } from "./useCoopBossState";
import { Card } from "@/components/ui/Card";
import { CosmeticAvatar } from "@/components/ui/CosmeticAvatar";

export function CoopRecentAttackList({
  attacks,
  onOpenAttackLog,
}: {
  attacks: readonly CoopRecentAttack[];
  onOpenAttackLog: (attackId: number) => void;
}) {
  return (
    <Card padding="md" className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">전투 기록</div>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          최근 10회
        </span>
      </div>
      {attacks.map((attack, index) => (
        <button
          key={attack.id || `${attack.at}-${index}`}
          type="button"
          onClick={() => onOpenAttackLog(attack.id)}
          className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-600 transition hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <CosmeticAvatar
              avatar={attack.avatar}
              name={attack.name}
              profileBorder={attack.profileBorder}
              width={26}
              height={26}
              sizes="26px"
              className="h-[26px] w-[26px] rounded-md"
            />
            <span className="min-w-0 truncate">
              {attack.name}
              {attack.isMe && (
                <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400">
                  나
                </span>
              )}
              {attack.isSupport && (
                <span className="ml-1 text-[10px] text-emerald-700 dark:text-emerald-300">무료 지원</span>
              )}
              {attack.diedEarly && (
                <span className="ml-1 text-[10px] text-rose-500">
                  전투불능
                </span>
              )}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-mono">
              -{attack.damageDealt.toLocaleString()}
            </span>
            <FilmStrip size={14} className="text-zinc-400" />
          </span>
        </button>
      ))}
    </Card>
  );
}
