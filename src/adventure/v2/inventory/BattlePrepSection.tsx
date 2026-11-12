"use client";

import {
  BATTLE_PREP_ITEMS,
  BATTLE_PREP_SLOT_NAME,
  battlePrepEffectText,
} from "@/adventure/data/v2/battlePrep";
import { Button } from "@/components/ui/Button";
import { SURFACE_INSET } from "@/components/ui/surfaces";

import { InventoryItemIcon } from "./InventoryItemIcon";

/** 소모품 탭의 전투 준비물(숫돌·보강재). 보유한 품목만 보여 주고, 하나도 없으면 그리지 않는다. */
export function BattlePrepSection({
  materials,
  busy,
  onUse,
}: {
  materials: Record<string, number>;
  busy: string | null;
  onUse: (itemId: string) => void;
}) {
  const held = BATTLE_PREP_ITEMS.filter((item) => (materials[item.id] ?? 0) > 0);
  if (held.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
        전투 준비물 · 음식과 함께 적용
      </div>
      <ul className="space-y-1.5">
        {held.map((item) => {
          const isBusy = busy === `battle_prep_${item.id}`;
          return (
            <li key={item.id} className={`${SURFACE_INSET} px-3 py-2`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <InventoryItemIcon itemId={item.id} size={18} className="shrink-0" />
                  <span className="truncate">{item.name}</span>
                  <span className="shrink-0 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                    ×{materials[item.id]}
                  </span>
                </span>
                <Button
                  disabled={isBusy}
                  onClick={() => onUse(item.id)}
                  aria-label={`${item.name} 사용`}
                  variant="secondary"
                  size="xs"
                  className="shrink-0"
                >
                  {isBusy ? "사용 중…" : "사용"}
                </Button>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {`${BATTLE_PREP_SLOT_NAME[item.slot]} · ${battlePrepEffectText(item.effect)} · ${item.durationMs / 3_600_000}시간`}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
