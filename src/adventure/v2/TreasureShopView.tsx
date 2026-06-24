"use client";

import { useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { TreasureSubTabs } from "./TreasureSubTabs";
import { treasureShopEntries } from "./treasureShop";
import type { BuyResult, TreasureShopState } from "./useTreasureShop";

// 발굴 코인 상점 — 칭호 구매. 데이터·구매 핸들러는 주입(useTreasureShop 실 API / dev mock).
// 설계: docs/treasure-hunt-plan.md §6

const ENTRIES = treasureShopEntries();

export function TreasureShopView({
  state,
  loading,
  error,
  buying,
  onBuy,
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
  onBack?: () => void;
  // 발굴 서브 탭바(발굴/주간 순위/보관함) — 미전달(dev 하니스)이면 그 탭 숨김.
  onOpenDig?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenCollection?: () => void;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const handleBuy = async (titleId: string) => {
    const r = await onBuy(titleId);
    setMessage({ ok: r.ok, text: r.message });
  };

  const coins = state?.coins ?? 0;
  const owned = new Set(state?.ownedTitleIds ?? []);

  return (
    <main className="mx-auto max-w-[560px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="발굴 코인 상점"
        onBack={onBack}
        right={
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            🪙 {coins.toLocaleString()}
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
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {ENTRIES.map((e) => {
              const isOwned = owned.has(e.titleId);
              const affordable = coins >= e.price;
              const inFlight = buying === e.titleId;
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
                    className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
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
    </main>
  );
}
