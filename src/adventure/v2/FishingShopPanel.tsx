"use client";

import { useCallback } from "react";
import { FishingShopView } from "./FishingShopView";
import { useFishingShop } from "./useFishingShop";
import { useDangerousFishingShop } from "./useDangerousFishingShop";

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
    shop: dangerousShop,
  } = useDangerousFishingShop();
  const handleDangerousShop = useCallback(
    async (...args: Parameters<typeof dangerousShop>) => {
      const result = await dangerousShop(...args);
      if (typeof result.fishingCoins === "number") {
        syncCoins(result.fishingCoins);
      }
      return result;
    },
    [dangerousShop, syncCoins],
  );
  return (
    <FishingShopView
      state={state}
      loading={loading}
      error={error}
      buying={buying}
      onBuy={buy}
      onBuyConsumable={buyConsumable}
      onBuyGear={buyGear}
      dangerousShop={{
        model: dangerousModel,
        loading: dangerousLoading,
        error: dangerousError,
        buying: dangerousBuying,
        onShop: handleDangerousShop,
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
