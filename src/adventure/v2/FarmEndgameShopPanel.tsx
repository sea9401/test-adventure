"use client";

import Image from "next/image";
import { LockKey, Sparkle } from "@phosphor-icons/react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type { FarmEndgameShopView } from "./farmEndgameShop";

export function FarmEndgameShopPanel({
  view,
  availableReputation,
  busyItemId,
  onBuy,
}: {
  view: FarmEndgameShopView;
  availableReputation: number;
  busyItemId: string | null;
  onBuy: (itemId: string) => void;
}) {
  return (
    <section
      className={`${SURFACE_CARD} space-y-3 p-3`}
      aria-labelledby="farm-endgame-shop-title"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {view.unlocked ? (
            <Sparkle size={22} weight="duotone" aria-hidden />
          ) : (
            <LockKey size={22} weight="duotone" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="farm-endgame-shop-title"
            className="font-bold text-zinc-900 dark:text-zinc-100"
          >
            농장주의 교환소
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {view.unlocked
              ? "완성된 농장에서 모은 증표를 농장 물품과 전용 칭호로 교환합니다."
              : "밭과 유료 축사를 모두 열면 후반 교환 상품을 이용할 수 있습니다."}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          증표 {availableReputation.toLocaleString("ko-KR")}개
        </span>
      </div>

      {!view.unlocked ? (
        <div className="grid grid-cols-2 gap-2">
          <div className={`${SURFACE_INSET} p-3 text-center`}>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">밭 확장</p>
            <p className="mt-1 font-bold text-zinc-800 dark:text-zinc-100">
              밭 {Math.min(view.plots, view.requiredPlots)}/{view.requiredPlots}
            </p>
          </div>
          <div className={`${SURFACE_INSET} p-3 text-center`}>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">유료 축사</p>
            <p className="mt-1 font-bold text-zinc-800 dark:text-zinc-100">
              축사 {Math.min(view.pens, view.requiredPens)}/{view.requiredPens}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {view.items.map((item) => {
            const titleId = item.reward.kind === "title" ? item.reward.titleId : null;
            const owned = titleId ? view.ownedTitleIds.includes(titleId) : false;
            const affordable = availableReputation >= item.costReputation;
            const busy = busyItemId === item.id;
            const buttonText = busy
              ? "구매 중..."
              : owned
                ? "보유 중"
                : affordable
                  ? "구매하기"
                  : "증표 부족";

            const buy = () => {
              if (
                titleId &&
                !window.confirm(
                  `${item.title} 칭호를 구매할까요?\n농장 증표 ${item.costReputation.toLocaleString("ko-KR")}개가 사용됩니다.`,
                )
              ) {
                return;
              }
              onBuy(item.id);
            };

            return (
              <article key={item.id} className={`${SURFACE_INSET} flex gap-3 p-3`}>
                <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-zinc-200 bg-white text-amber-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-amber-300">
                  {item.imageSrc ? (
                    <Image
                      src={item.imageSrc}
                      alt=""
                      width={64}
                      height={64}
                      unoptimized
                      className="size-16 object-cover"
                    />
                  ) : (
                    <Sparkle size={28} weight="duotone" aria-hidden />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                    {item.title}
                  </h3>
                  <p className="mt-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {item.rewardText} · 증표 {item.costReputation.toLocaleString("ko-KR")}개
                  </p>
                  <p className="mt-1 flex-1 text-xs text-zinc-600 dark:text-zinc-300">
                    {item.note}
                  </p>
                  <button
                    type="button"
                    aria-label={`${item.title} 구매`}
                    onClick={buy}
                    disabled={owned || !affordable || busyItemId !== null}
                    className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {buttonText}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
