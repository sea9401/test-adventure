"use client";

import { useEffect, useState } from "react";
import { Shield, Sword } from "@phosphor-icons/react";

import {
  BATTLE_PREP_ITEM_BY_ID,
  BATTLE_PREP_SLOTS,
  BATTLE_PREP_SLOT_NAME,
  activeBattlePreps,
  battlePrepEffectText,
  type ActiveBattlePreps,
  type BattlePrepSlot,
} from "@/adventure/data/v2/battlePrep";
import { SURFACE_INSET } from "@/components/ui/surfaces";

export type BattlePrepBadgeRow = {
  slot: BattlePrepSlot;
  slotName: string;
  itemName: string;
  effectText: string;
  expiresAt: number;
};

/** 켜 둔 준비물을 칸 순서대로. 만료되었거나 쓰지 않은 칸은 빠진다. */
export function battlePrepBadgeRows(
  active: ActiveBattlePreps | null | undefined,
  now: number,
): BattlePrepBadgeRow[] {
  const valid = activeBattlePreps(active, now);
  return BATTLE_PREP_SLOTS.flatMap((slot) => {
    const entry = valid[slot];
    const item = entry ? BATTLE_PREP_ITEM_BY_ID.get(entry.itemId) : undefined;
    if (!entry || !item) return [];
    return [
      {
        slot,
        slotName: BATTLE_PREP_SLOT_NAME[slot],
        itemName: item.name,
        effectText: battlePrepEffectText(item.effect),
        expiresAt: entry.expiresAt,
      },
    ];
  });
}

export function BattlePrepIcon({
  slot,
  size,
  className,
}: {
  slot: BattlePrepSlot;
  size: number;
  className?: string;
}) {
  const Icon = slot === "weapon" ? Sword : Shield;
  return <Icon size={size} weight="duotone" className={className} aria-hidden />;
}

function formatRemaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${remainder}분`;
  return remainder > 0 ? `${hours}시간 ${remainder}분` : `${hours}시간`;
}

/** 캐릭터 카드용 — 음식 효과 줄과 같은 배치로 칸마다 한 줄. 색은 중립 표면을 쓴다. */
export function ActiveBattlePrepBadges({ active }: { active: ActiveBattlePreps | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const rows = battlePrepBadgeRows(active, now);
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((row) => (
        <div
          key={row.slot}
          title={`${row.slotName} · ${row.itemName} · ${row.effectText}`}
          className={`${SURFACE_INSET} flex min-w-0 items-center gap-1.5 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-200`}
        >
          <BattlePrepIcon slot={row.slot} size={15} className="shrink-0" />
          <span className="min-w-0 truncate">
            <span className="font-semibold">{row.itemName}</span> · {row.effectText}
          </span>
          <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
            {formatRemaining(row.expiresAt - now)}
          </span>
        </div>
      ))}
    </>
  );
}
