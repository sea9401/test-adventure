"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Inset } from "@/components/ui/Inset";

export function CompactBattlePlayerStatus({
  name,
  subtitle,
  hp,
  mp,
  exp,
  maxExp,
  hpCharges,
  mpCharges,
  children,
}: {
  name: string;
  subtitle?: string;
  hp: { hp: number; maxHp: number };
  mp?: { mp: number; maxMp: number } | null;
  exp: number;
  maxExp: number;
  hpCharges: number;
  mpCharges: number;
  children: ReactNode;
}) {
  return (
    <Card as="details" padding="none" className="overflow-hidden">
      <summary className="cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{name}</span>
            {subtitle && <span className="block truncate text-[0.6875rem] text-zinc-500">{subtitle}</span>}
          </span>
          <span className="shrink-0 text-right text-[0.6875rem] tabular-nums text-zinc-500 dark:text-zinc-400">
            <span className="block">HP {hp.hp.toLocaleString()} / {hp.maxHp.toLocaleString()}{mp && mp.maxMp > 0 ? ` · MP ${mp.mp.toLocaleString()} / ${mp.maxMp.toLocaleString()}` : ""}</span>
            <span className="block">
              HP 충전약 {hpCharges.toLocaleString()}
              {mp && mp.maxMp > 0 ? ` · MP 충전약 ${mpCharges.toLocaleString()}` : ""}
            </span>
            <span className="block">EXP {Math.max(0, exp).toLocaleString()} / {Math.max(1, maxExp).toLocaleString()} · 상세 보기</span>
          </span>
        </div>
      </summary>
      <Inset className="m-2 mt-0 p-1">{children}</Inset>
    </Card>
  );
}
