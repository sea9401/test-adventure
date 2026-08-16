"use client";

import { useCallback } from "react";
import { FishingShopView } from "./FishingShopView";
import { useFishingShop } from "./useFishingShop";
import { useDangerousFishingShop } from "./useDangerousFishingShop";
import { useDangerousFishingExchange } from "./useDangerousFishingExchange";

// 낚시 코인 상점 패널 — 마운트 시 상태 fetch(useFishingShop) 후 뷰에 주입.
export function FishingShopPanel({
  onBack,
  onOpenFishing,
  onOpenDangerous,
  onOpenChallenges,
  onOpenLeaderboard,
  onOpenHallOfFame,
  initialTab = "regular",
  embedded = false,
}: {
  onBack?: () => void;
  onOpenFishing?: () => void;
  onOpenDangerous?: () => void;
  onOpenChallenges?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenHallOfFame?: () => void;
  initialTab?: "regular" | "dangerous";
  embedded?: boolean;
}) {
  const {
    state,
    loading,
    error,
    buying,
    buy,
    buyConsumable,
    buyGear,
    syncCoins,
  } = useFishingShop();
  const {
    model: dangerousModel,
    loading: dangerousLoading,
    error: dangerousError,
    buying: dangerousBuying,
    refresh: refreshDangerousShop,
    shop: dangerousShop,
  } = useDangerousFishingShop();
  const {
    model: exchangeModel,
    loading: exchangeLoading,
    error: exchangeError,
    exchanging,
    refresh: refreshExchange,
    exchange,
  } = useDangerousFishingExchange();
  const handleDangerousShop = useCallback(
    async (...args: Parameters<typeof dangerousShop>) => {
      const result = await dangerousShop(...args);
      if (typeof result.fishingCoins === "number") {
        syncCoins(result.fishingCoins);
      }
      if (result.ok) await refreshExchange();
      return result;
    },
    [dangerousShop, refreshExchange, syncCoins],
  );
  const handleExchange = useCallback(
    async (...args: Parameters<typeof exchange>) => {
      const result = await exchange(...args);
      if (result.ok) {
        if (typeof result.fishingCoins === "number") {
          syncCoins(result.fishingCoins);
        }
        await refreshDangerousShop();
      }
      return result;
    },
    [exchange, refreshDangerousShop, syncCoins],
  );
  const handleBuy = useCallback(
    async (...args: Parameters<typeof buy>) => {
      const result = await buy(...args);
      if (result.ok) await refreshExchange();
      return result;
    },
    [buy, refreshExchange],
  );
  const handleBuyConsumable = useCallback(
    async (...args: Parameters<typeof buyConsumable>) => {
      const result = await buyConsumable(...args);
      if (result.ok) await refreshExchange();
      return result;
    },
    [buyConsumable, refreshExchange],
  );
  const handleBuyGear = useCallback(
    async (...args: Parameters<typeof buyGear>) => {
      const result = await buyGear(...args);
      if (result.ok) await refreshExchange();
      return result;
    },
    [buyGear, refreshExchange],
  );
  return (
    <FishingShopView
      state={state}
      loading={loading}
      error={error}
      buying={buying}
      onBuy={handleBuy}
      onBuyConsumable={handleBuyConsumable}
      onBuyGear={handleBuyGear}
      dangerousShop={{
        model: dangerousModel,
        loading: dangerousLoading,
        error: dangerousError,
        buying: dangerousBuying,
        onShop: handleDangerousShop,
        exchange: {
          model: exchangeModel,
          loading: exchangeLoading,
          error: exchangeError,
          exchanging,
          onRefresh: refreshExchange,
          onExchange: handleExchange,
        },
      }}
      onBack={onBack}
      onOpenFishing={onOpenFishing}
      onOpenDangerous={onOpenDangerous}
      onOpenChallenges={onOpenChallenges}
      onOpenLeaderboard={onOpenLeaderboard}
      onOpenHallOfFame={onOpenHallOfFame}
      initialTab={initialTab}
      embedded={embedded}
    />
  );
}
