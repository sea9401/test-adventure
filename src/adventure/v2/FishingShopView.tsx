"use client";

import { useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { FishingSubTabs } from "./FishingSubTabs";
import {
  FISHING_SEED_POUCH_ITEM_ID,
  FISHING_SHOP_CONSUMABLES,
  fishingShopEntries,
} from "./fishingShop";
import type { BuyResult, FishingShopState } from "./useFishingShop";

// 낚시 코인 상점 — 칭호 구매. 데이터·구매 핸들러는 주입(useFishingShop 실 API / dev mock).
// 설계: docs/fishing-content-plan.md §6

const ENTRIES = fishingShopEntries();

export function FishingShopView({
  state,
  loading,
  error,
  buying,
  onBuy,
  onBuyConsumable,
  onBack,
  onOpenFishing,
  onOpenChallenges,
  onOpenLeaderboard,
  onOpenHallOfFame,
}: {
  state: FishingShopState | null;
  loading: boolean;
  error?: string | null;
  buying: string | null;
  onBuy: (titleId: string) => Promise<BuyResult>;
  // 소비템(스태미나 회복약) 구매 — 미전달(dev 하니스)이면 소비품 섹션 숨김.
  onBuyConsumable?: (itemId: string) => Promise<BuyResult>;
  onBack?: () => void;
  // 낚시터 서브 탭바 — 미전달(dev 하니스)이면 그 탭 숨김.
  onOpenFishing?: () => void;
  onOpenChallenges?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenHallOfFame?: () => void;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const handleBuy = async (titleId: string) => {
    const r = await onBuy(titleId);
    setMessage({ ok: r.ok, text: r.message });
  };

  const handleBuyConsumable = async (itemId: string) => {
    if (!onBuyConsumable) return;
    const r = await onBuyConsumable(itemId);
    setMessage({ ok: r.ok, text: r.message });
  };

  const coins = state?.coins ?? 0;
  const owned = new Set(state?.ownedTitleIds ?? []);
  const staminaPotions = state?.staminaPotions ?? 0;
  const seedPouch = state?.seedPouch;

  return (
    <main className="mx-auto max-w-[560px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="낚시 코인 상점"
        onBack={onBack}
        right={
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            🪙 {coins.toLocaleString()}
          </span>
        }
      />

      <FishingSubTabs
        active="shop"
        onOpenFishing={onOpenFishing}
        onOpenChallenges={onOpenChallenges}
        onOpenLeaderboard={onOpenLeaderboard}
        onOpenHallOfFame={onOpenHallOfFame}
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
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {ENTRIES.map((e) => {
              const isOwned = owned.has(e.titleId);
              const affordable = coins >= e.price;
              const inFlight = buying === e.titleId;
              // 어떤 구매든 진행 중이면 모든 버튼 비활성(동시 구매 차단). inFlight 는 라벨용.
              const anyInFlight = buying !== null;
              return (
                <li
                  key={e.titleId}
                  className="flex items-center justify-between gap-3 px-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      🏆 {e.name}
                      {isOwned && (
                        <span className="rounded bg-emerald-200/70 px-1 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                          보유
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {e.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isOwned || !affordable || anyInFlight}
                    onClick={() => handleBuy(e.titleId)}
                    className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
                  >
                    {isOwned
                      ? "보유 중"
                      : inFlight
                        ? "구매 중…"
                        : `🪙 ${e.price.toLocaleString()}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {!loading && !error && onBuyConsumable && (
        <div className="space-y-1.5">
          <p className="px-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            소비품
          </p>
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {FISHING_SHOP_CONSUMABLES.map((c) => {
                const isSeedPouch = c.itemId === FISHING_SEED_POUCH_ITEM_ID;
                const price =
                  isSeedPouch && seedPouch ? seedPouch.nextPrice : c.price;
                const limitReached =
                  isSeedPouch &&
                  seedPouch != null &&
                  seedPouch.boughtToday >= seedPouch.dailyLimit;
                const affordable = price != null && coins >= price;
                const inFlight = buying === c.itemId;
                const anyInFlight = buying !== null;
                return (
                  <li
                    key={c.itemId}
                    className="flex items-center justify-between gap-3 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        {isSeedPouch ? "🌱" : "🧪"} {c.name}
                        {c.itemId === "stamina_potion" && staminaPotions > 0 && (
                          <span className="rounded bg-sky-200/70 px-1 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                            보유 {staminaPotions}
                          </span>
                        )}
                        {isSeedPouch && seedPouch && (
                          <span className="rounded bg-emerald-200/70 px-1 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                            오늘 {seedPouch.boughtToday}/{seedPouch.dailyLimit}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                        {c.description}
                      </p>
                      {isSeedPouch && state && (
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">
                          보유 씨앗 밀 {state.farmSeeds.wheat ?? 0} · 허브{" "}
                          {state.farmSeeds.herb ?? 0} · 옥수수{" "}
                          {state.farmSeeds.corn ?? 0}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={limitReached || !affordable || anyInFlight}
                      onClick={() => handleBuyConsumable(c.itemId)}
                      className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
                    >
                      {limitReached
                        ? "한도 도달"
                        : inFlight
                          ? "구매 중…"
                          : `🪙 ${(price ?? c.price).toLocaleString()}`}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </main>
  );
}
