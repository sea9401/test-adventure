"use client";

// 마법부여 다이얼로그 — 한 자루의 빈 슬롯 한 칸을 부여서로 채운다.
// 부여서 보유 목록만 보이고, 클릭 → confirm → 서버 호출. 부여 성공 후 토스트는
// useEnchantAction 가 띄운다.

import { useCallback, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { ITEMS } from "@/adventure/data/items";
import {
  ENCHANT_AFFIX_IDS,
  ENCHANT_AFFIXES,
  enchantSlotCapacity,
  type EnchantAffix,
} from "@/adventure/character/enchant";
import type { EquipmentInstance } from "@/adventure/inventory/equipmentInstances";

function fmtRange(affix: EnchantAffix): string {
  const [min, max] = affix.range;
  const unit = affix.unit === "percent" ? "%" : "";
  return `${min}~${max}${unit}`;
}

export function EnchantDialog({
  instance,
  scrolls,
  onPick,
  onClose,
}: {
  instance: EquipmentInstance;
  /** materialId(enchant_*) → 보유 개수. 0 인 항목은 미리 걸러서 넘긴다. */
  scrolls: Record<string, number>;
  onPick: (materialId: string) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useEscapeKey(handleEscape);
  useModalA11y(contentRef);

  const base = ITEMS[instance.itemId];
  const cap = enchantSlotCapacity(instance.enhancementLevel);
  const cur = instance.enchantSlots ?? [];
  const remaining = cap - cur.length;

  // 표시 순서 = 카탈로그 순서. 보유 0 인 부여서는 회색 잠금 표시로 같이 보여 가이드 역할.
  const rows = useMemo(
    () =>
      ENCHANT_AFFIX_IDS.map((id) => {
        const affix = ENCHANT_AFFIXES[id];
        const have = scrolls[affix.materialId] ?? 0;
        return { affix, have };
      }),
    [scrolls],
  );

  const submit = async (materialId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      onPick(materialId);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="enchant-dialog-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2
            id="enchant-dialog-title"
            className="text-base font-semibold text-zinc-900 dark:text-zinc-100"
          >
            마법부여
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {base.name}
            {instance.enhancementLevel > 0 ? ` +${instance.enhancementLevel}` : ""}
            {" · "}슬롯 {cur.length}/{cap}
          </p>
          {cur.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-violet-700 dark:text-violet-300">
              {cur.map((s, i) => {
                const a = ENCHANT_AFFIXES[s.affixId];
                const unit = a.unit === "percent" ? "%" : "";
                return (
                  <span
                    key={i}
                    className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 dark:border-violet-800 dark:bg-violet-950"
                  >
                    {a.name} {s.value}
                    {unit}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="overflow-y-auto px-4 py-3">
          {remaining <= 0 ? (
            <Card padding="sm">
              <div className="text-sm text-zinc-700 dark:text-zinc-200">
                이 자루의 슬롯이 이미 다 찼습니다. 새 자루를 만들어 부여하세요.
              </div>
            </Card>
          ) : (
            <ul className="space-y-1.5">
              {rows.map(({ affix, have }) => {
                const disabled = have <= 0 || busy;
                return (
                  <li key={affix.id}>
                    <button
                      type="button"
                      onClick={() => submit(affix.materialId)}
                      disabled={disabled}
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left transition-colors hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-violet-700 dark:hover:bg-violet-950"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                          {affix.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {fmtRange(affix)} · 보유 {have}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {affix.description}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
