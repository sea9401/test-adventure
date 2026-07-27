"use client";

import { useState } from "react";
import { FishingShopView } from "@/adventure/v2/FishingShopView";
import {
  FISHING_SEED_POUCH_BASE_PRICE,
  FISHING_SEED_POUCH_DAILY_LIMIT,
  FISHING_SEED_POUCH_ITEM_ID,
  FISHING_STAMINA_POTION_DAILY_LIMIT,
  FISHING_STAMINA_POTION_ITEM_ID,
  fishingShopConsumablePriceFor,
  fishingSeedPouchPriceForPurchase,
  fishingShopPriceFor,
} from "@/adventure/v2/fishingShop";
import { FARM_FISHING_SHOP_SEED_REWARD } from "@/adventure/v2/farm";
import {
  buyFishingLure,
  buyFishingRod,
  emptyFishingProgression,
  equipFishingLure,
  equipFishingRod,
  fishingGearPrice,
  fishingProgressionView,
  type FishingLureId,
  type FishingProgressionState,
  type FishingRodId,
} from "@/adventure/v2/fishingProgression";
import type {
  BuyResult,
  FishingGearAction,
  FishingGearKind,
  FishingShopState,
} from "@/adventure/v2/useFishingShop";

// /dev/fishing-shop — mock 코인/보유로 상점 구매 UI QA(로그인·DB 없이).
export function FishingShopHarness() {
  const [state, setState] = useState<FishingShopState>({
    coins: 7000,
    ownedTitleIds: ["fishing_taegong"],
    staminaPotions: 0,
    progression: fishingProgressionView(emptyFishingProgression()),
    seedPouch: {
      boughtToday: 0,
      dailyLimit: FISHING_SEED_POUCH_DAILY_LIMIT,
      remainingToday: FISHING_SEED_POUCH_DAILY_LIMIT,
      nextPrice: FISHING_SEED_POUCH_BASE_PRICE,
      contents: FARM_FISHING_SHOP_SEED_REWARD,
    },
    staminaPotionLimit: {
      boughtToday: 0,
      dailyLimit: FISHING_STAMINA_POTION_DAILY_LIMIT,
      remainingToday: FISHING_STAMINA_POTION_DAILY_LIMIT,
    },
  });

  const buy = async (titleId: string): Promise<BuyResult> => {
    const price = fishingShopPriceFor(titleId);
    if (price === undefined) return { ok: false, message: "알 수 없는 칭호." };
    if (state.ownedTitleIds.includes(titleId)) {
      return { ok: false, message: "이미 보유한 칭호다." };
    }
    if (state.coins < price) return { ok: false, message: "낚시 코인이 부족하다." };
    setState((s) => ({
      ...s,
      coins: s.coins - price,
      ownedTitleIds: [...s.ownedTitleIds, titleId],
    }));
    return { ok: true, message: "칭호를 손에 넣었다." };
  };

  const buyConsumable = async (itemId: string): Promise<BuyResult> => {
    if (itemId === FISHING_SEED_POUCH_ITEM_ID) {
      const pouch = state.seedPouch;
      const price = pouch?.nextPrice ?? null;
      if (price === null) {
        return { ok: false, message: "오늘 구매 한도에 도달했다." };
      }
      if (state.coins < price) {
        return { ok: false, message: "낚시 코인이 부족하다." };
      }
      setState((s) => {
        const boughtToday = (s.seedPouch?.boughtToday ?? 0) + 1;
        const nextPrice = fishingSeedPouchPriceForPurchase(boughtToday) ?? null;
        return {
          ...s,
          coins: s.coins - price,
          seedPouch: {
            boughtToday,
            dailyLimit: FISHING_SEED_POUCH_DAILY_LIMIT,
            remainingToday: Math.max(
              0,
              FISHING_SEED_POUCH_DAILY_LIMIT - boughtToday,
            ),
            nextPrice,
            contents: FARM_FISHING_SHOP_SEED_REWARD,
          },
        };
      });
      return { ok: true, message: "물가 씨앗 주머니를 구매했다." };
    }
    if (itemId === FISHING_STAMINA_POTION_ITEM_ID) {
      if ((state.staminaPotionLimit?.remainingToday ?? 0) <= 0) {
        return { ok: false, message: "오늘 구매 한도에 도달했다." };
      }
      const price = fishingShopConsumablePriceFor(itemId);
      if (price === undefined) return { ok: false, message: "알 수 없는 품목." };
      if (state.coins < price) {
        return { ok: false, message: "낚시 코인이 부족하다." };
      }
      setState((s) => {
        const boughtToday = (s.staminaPotionLimit?.boughtToday ?? 0) + 1;
        return {
          ...s,
          coins: s.coins - price,
          staminaPotions: s.staminaPotions + 1,
          staminaPotionLimit: {
            boughtToday,
            dailyLimit: FISHING_STAMINA_POTION_DAILY_LIMIT,
            remainingToday: Math.max(
              0,
              FISHING_STAMINA_POTION_DAILY_LIMIT - boughtToday,
            ),
          },
        };
      });
      return { ok: true, message: "스태미나 회복약을 구매했다." };
    }
    return { ok: false, message: "알 수 없는 품목." };
  };

  const buyGear = async (
    gearKind: FishingGearKind,
    gearId: string,
    action: FishingGearAction,
  ): Promise<BuyResult> => {
    const price = fishingGearPrice(gearKind, gearId);
    if (price === null) return { ok: false, message: "알 수 없는 도구." };
    const progress =
      state.progression ?? fishingProgressionView(emptyFishingProgression());
    const owned =
      gearKind === "rod"
        ? progress.ownedRods.includes(gearId as FishingRodId)
        : progress.ownedLures.includes(gearId as FishingLureId);
    if (action === "equip" || owned) {
      const next =
        gearKind === "rod"
          ? equipFishingRod(progress as FishingProgressionState, gearId as FishingRodId)
          : equipFishingLure(
              progress as FishingProgressionState,
              gearId as FishingLureId,
            );
      if (!next) return { ok: false, message: "아직 보유하지 않은 도구다." };
      setState((s) => ({ ...s, progression: fishingProgressionView(next) }));
      return { ok: true, message: "낚시 도구를 장착했다." };
    }
    if (state.coins < price) return { ok: false, message: "낚시 코인이 부족하다." };
    const next =
      gearKind === "rod"
        ? buyFishingRod(progress as FishingProgressionState, gearId as FishingRodId)
        : buyFishingLure(progress as FishingProgressionState, gearId as FishingLureId);
    setState((s) => ({
      ...s,
      coins: s.coins - price,
      progression: fishingProgressionView(next),
    }));
    return { ok: true, message: "낚시 도구를 장착했다." };
  };

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[560px] px-6 pt-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          DEV 하니스 — mock 코인 7000, 강태공 보유. 구매 시 로컬 차감(새로고침 초기화).
        </div>
      </div>
      <FishingShopView
        state={state}
        loading={false}
        buying={null}
        onBuy={buy}
        onBuyConsumable={buyConsumable}
        onBuyGear={buyGear}
      />
    </div>
  );
}
