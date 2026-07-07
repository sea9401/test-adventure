"use client";

import { useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TreasureSubTabs } from "./TreasureSubTabs";
import {
  CoinConsumableShopList,
  CoinTitleShopList,
} from "./CoinShopLists";
import { treasureShopEntries, TREASURE_SHOP_CONSUMABLES } from "./treasureShop";
import type { BuyResult, TreasureShopState } from "./useTreasureShop";
import { useSystemToast } from "./RewardToastProvider";

// 발굴 코인 상점 — 칭호 + 소비템 구매. 데이터·구매 핸들러는 주입(useTreasureShop 실 API / dev mock).
// 설계: docs/treasure-hunt-plan.md §6

const ENTRIES = treasureShopEntries();

export function TreasureShopView({
  state,
  loading,
  error,
  buying,
  onBuy,
  onBuyConsumable,
  onBack,
  onOpenDig,
  onOpenLeaderboard,
  onOpenCollection,
}: {
  state: TreasureShopState | null;
  loading: boolean;
  error?: string | null;
  buying: string | null;
  onBuy: (titleId: string) => Promise<BuyResult>;
  // 소비템 구매 핸들러 — 미전달(dev 하니스)이면 소비템 섹션 숨김.
  onBuyConsumable?: (itemId: string) => Promise<BuyResult>;
  onBack?: () => void;
  // 발굴 서브 탭바(발굴/주간 순위/보관함) — 미전달(dev 하니스)이면 그 탭 숨김.
  onOpenDig?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenCollection?: () => void;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const { notifySystem } = useSystemToast();

  const showMessage = (r: BuyResult) => {
    setMessage({ ok: r.ok, text: r.message });
    notifySystem(r.message, r.ok ? "success" : "error");
  };

  const handleBuy = async (titleId: string) => {
    const r = await onBuy(titleId);
    showMessage(r);
  };

  const handleBuyConsumable = async (itemId: string) => {
    if (!onBuyConsumable) return;
    const r = await onBuyConsumable(itemId);
    showMessage(r);
  };

  const coins = state?.coins ?? 0;
  const staminaPotions = state?.staminaPotions ?? 0;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="발굴 코인 상점"
        onBack={onBack}
        right={
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            🪙 발굴 코인 {coins.toLocaleString()}
          </span>
        }
      />

      <TreasureSubTabs
        active="shop"
        onOpenDig={onOpenDig}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenCollection={onOpenCollection}
      />

      {message && (
        <p
          className={`text-center text-sm ${
            message.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </p>
      ) : error ? (
        <p className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : (
        <CoinTitleShopList
          entries={ENTRIES}
          coins={coins}
          ownedTitleIds={state?.ownedTitleIds ?? []}
          buying={buying}
          onBuy={handleBuy}
          accent="amber"
        />
      )}

      {!loading && !error && onBuyConsumable && (
        <div className="space-y-1.5">
          <p className="px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            소비품
          </p>
          <CoinConsumableShopList
            consumables={TREASURE_SHOP_CONSUMABLES}
            coins={coins}
            staminaPotions={staminaPotions}
            buying={buying}
            onBuyConsumable={handleBuyConsumable}
            accent="amber"
          />
        </div>
      )}
    </main>
  );
}
