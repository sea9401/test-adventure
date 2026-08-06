"use client";

import { useState } from "react";
import type { FarmItemInventory } from "@/adventure/v2/farm";
import { COOKING_SURPLUS_BATCH_SIZE } from "@/adventure/v2/cooking";
import { SurplusExchangePanel } from "@/adventure/v2/SurplusExchangePanel";
import { SURFACE_ACCENT } from "@/components/ui/surfaces";

const INITIAL_ITEMS: FarmItemInventory = {
  corn: 105,
  wheat: 43,
  herb: 19,
};

export default function CookingSurplusPreviewPage() {
  const [farmItems, setFarmItems] =
    useState<FarmItemInventory>(INITIAL_ITEMS);
  const [surplusTrades, setSurplusTrades] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const exchange = (itemId: string, batches: number) => {
    const quantity = batches * COOKING_SURPLUS_BATCH_SIZE;
    setFarmItems((current) => ({
      ...current,
      [itemId]: Math.max(0, (current[itemId as keyof FarmItemInventory] ?? 0) - quantity),
    }));
    setSurplusTrades((current) => current + batches);
    setNotice(`${itemId} ${quantity}개를 증표 ${batches}개로 교환했습니다.`);
  };

  const reset = () => {
    setFarmItems(INITIAL_ITEMS);
    setSurplusTrades(0);
    setNotice(null);
  };

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 text-zinc-900 dark:text-zinc-100">
      <div className={`${SURFACE_ACCENT} p-3 text-sm text-amber-950 dark:text-amber-100`}>
        <strong>DEV</strong> · 옥수수 105개 기준 단건 교환과 최대 교환 확인 창을
        로그인·DB 없이 확인합니다.
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {notice ?? "버튼을 눌러 교환 흐름을 확인해 보세요."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold dark:border-zinc-700 dark:bg-zinc-900"
        >
          초기화
        </button>
      </div>

      <SurplusExchangePanel
        farmItems={farmItems}
        surplusTrades={surplusTrades}
        busy={null}
        onExchange={exchange}
      />
    </main>
  );
}
