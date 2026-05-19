"use client";

import { Lock, Sparkle, Star, TrashSimple } from "@phosphor-icons/react";
import {
  GUILD_BUFFS,
  type GuildBuffDef,
  type GuildBuffSlot,
} from "@/adventure/data/guildBuffs";

export function effectLabel(
  _def: GuildBuffDef,
  effect: { kind: string; value: number },
): string {
  switch (effect.kind) {
    case "exp_mult":
      return `EXP +${Math.round((effect.value - 1) * 100)}%`;
    case "train_speed_mult":
      return `훈련 시간 -${Math.round((1 - effect.value) * 100)}%`;
    case "drop_mult":
      return `드랍 +${((effect.value - 1) * 100).toFixed(1)}%`;
    case "fame_mult":
      return `명성 +${Math.round((effect.value - 1) * 100)}%`;
    case "boss_cooldown_reduction_pct":
      return `보스 쿨다운 -${effect.value}%`;
    default:
      return "?";
  }
}

export function TierBadge({ tier }: { tier: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
      <Star size={9} weight="fill" />T{tier}
    </span>
  );
}

export function InstalledSlotCard({
  slot,
  isMaster,
  busy,
  fameAvailable,
  onUpgrade,
  onUninstall,
}: {
  slot: GuildBuffSlot;
  isMaster: boolean;
  busy: boolean;
  fameAvailable: number;
  onUpgrade: () => void;
  onUninstall: () => void;
}) {
  const def = GUILD_BUFFS[slot.buffId];
  const cur = def.tiers[slot.tier - 1];
  const next = def.tiers[slot.tier];
  const canUpgrade =
    isMaster && !!next && fameAvailable >= next.installCost && !busy;

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkle size={14} weight="duotone" className="text-amber-500" />
            <span className="text-sm font-medium">{def.name}</span>
            <TierBadge tier={slot.tier} />
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {effectLabel(def, cur.effect)}
          </p>
        </div>
        {isMaster ? (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              disabled={!canUpgrade}
              onClick={onUpgrade}
              className="rounded-md border border-emerald-700 bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={next ? `T${slot.tier + 1} (-${next.installCost} 명성)` : "최고 티어"}
            >
              {next ? `+T${slot.tier + 1} (-${next.installCost})` : "MAX"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onUninstall}
              className="rounded-md border border-rose-300 bg-white px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:bg-zinc-900 dark:text-rose-300"
              title="슬롯 해제 (누적 50% 환급)"
            >
              <TrashSimple size={12} weight="bold" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EmptySlotCard({
  isMaster,
  busy,
  onPick,
}: {
  isMaster: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">빈 슬롯</p>
        {isMaster ? (
          <button
            type="button"
            disabled={busy}
            onClick={onPick}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium dark:border-zinc-700 dark:bg-zinc-900"
          >
            버프 선택…
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function LockedSlotCard() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-zinc-200 bg-zinc-50/60 p-3 text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500">
      <Lock size={14} weight="duotone" />
      <span>잠긴 슬롯 — 길드 등급 상승으로 해방</span>
    </div>
  );
}
