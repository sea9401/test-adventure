"use client";

import { Card } from "@/components/ui/Card";

// 코인 상점 공용 리스트 — 칭호/소비품 목록의 li 마크업이 낚시/발굴/투기장 뷰에
// 3벌 복붙이던 것의 단일화(2026-07). accent = 상점 테마 색(낚시·투기장 sky, 발굴 amber).
// 낚시 도구(낚싯대/미끼) 목록은 진행/장착 상태가 얽힌 낚시 전용이라 여기 안 둔다.

export type CoinShopAccent = "sky" | "amber";
export type CoinTitleEntry = {
  titleId: string;
  name: string;
  description: string;
  price: number;
};
export type CoinConsumableEntry = {
  itemId: string;
  name: string;
  description: string;
  price: number;
};

const BUY_BTN: Record<CoinShopAccent, string> = {
  sky: "shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400",
  amber:
    "shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400",
};

export function CoinTitleShopList({
  entries,
  coins,
  ownedTitleIds,
  buying,
  onBuy,
  accent,
}: {
  entries: readonly CoinTitleEntry[];
  coins: number;
  ownedTitleIds: readonly string[];
  buying: string | null;
  onBuy: (titleId: string) => void;
  accent: CoinShopAccent;
}) {
  const owned = new Set(ownedTitleIds);
  const anyInFlight = buying !== null;
  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {entries.map((e) => {
          const isOwned = owned.has(e.titleId);
          const affordable = coins >= e.price;
          const inFlight = buying === e.titleId;
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
                onClick={() => onBuy(e.titleId)}
                className={BUY_BTN[accent]}
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
  );
}

export function CoinConsumableShopList({
  consumables,
  coins,
  staminaPotions,
  buying,
  onBuyConsumable,
  accent,
}: {
  consumables: readonly CoinConsumableEntry[];
  coins: number;
  /** 보유 스태미나 회복약 — stamina_potion 항목의 "보유 N" 배지 표시용. */
  staminaPotions: number;
  buying: string | null;
  onBuyConsumable: (itemId: string) => void;
  accent: CoinShopAccent;
}) {
  const anyInFlight = buying !== null;
  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {consumables.map((c) => {
          const affordable = coins >= c.price;
          const inFlight = buying === c.itemId;
          return (
            <li
              key={c.itemId}
              className="flex items-center justify-between gap-3 px-3 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  🧪 {c.name}
                  {c.itemId === "stamina_potion" && staminaPotions > 0 && (
                    <span className="rounded bg-sky-200/70 px-1 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/60 dark:text-sky-200">
                      보유 {staminaPotions}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {c.description}
                </p>
              </div>
              <button
                type="button"
                disabled={!affordable || anyInFlight}
                onClick={() => onBuyConsumable(c.itemId)}
                className={BUY_BTN[accent]}
              >
                {inFlight ? "구매 중…" : `🪙 ${c.price.toLocaleString()}`}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
