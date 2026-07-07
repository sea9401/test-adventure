"use client";

import { useState } from "react";
import { CoinTitleShopList } from "./CoinShopLists";
import { arenaShopEntries } from "./arenaShop";
import type { BuyResult, ArenaShopState } from "./useArenaShop";
import { useSystemToast } from "./RewardToastProvider";

// 투기장 코인 상점 — 칭호 구매. 데이터·구매 핸들러는 주입(useArenaShop).
// V2ArenaView 의 "상점" 탭 안에 임베드되므로 자체 헤더(SubViewHeader)는 두지 않고
// 코인 잔액 줄 + 칭호 목록만 렌더한다. (낚시 코인 상점 FishingShopView 미러.)

const ENTRIES = arenaShopEntries();

export function ArenaShopView({
  state,
  loading,
  error,
  buying,
  onBuy,
}: {
  state: ArenaShopState | null;
  loading: boolean;
  error?: string | null;
  buying: string | null;
  onBuy: (titleId: string) => Promise<BuyResult>;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const { notifySystem } = useSystemToast();

  const handleBuy = async (titleId: string) => {
    const r = await onBuy(titleId);
    setMessage({ ok: r.ok, text: r.message });
    notifySystem(r.message, r.ok ? "success" : "error");
  };

  const coins = state?.coins ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          주간 시즌 순위 보상으로 받은 투기장 코인으로 칭호를 구매하세요.
        </p>
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          🪙 {coins.toLocaleString()}
        </span>
      </div>

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
          accent="sky"
        />
      )}
    </div>
  );
}
