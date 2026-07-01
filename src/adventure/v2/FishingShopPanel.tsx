"use client";

import { FishingShopView } from "./FishingShopView";
import { useFishingShop } from "./useFishingShop";

// 낚시 코인 상점 패널 — 마운트 시 상태 fetch(useFishingShop) 후 뷰에 주입.
export function FishingShopPanel({
  onBack,
  onOpenFishing,
  onOpenChallenges,
  onOpenLeaderboard,
  onOpenHallOfFame,
}: {
  onBack: () => void;
  onOpenFishing?: () => void;
  onOpenChallenges?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenHallOfFame?: () => void;
}) {
  const { state, loading, error, buying, buy, buyConsumable, buyGear } =
    useFishingShop();
  return (
    <FishingShopView
      state={state}
      loading={loading}
      error={error}
      buying={buying}
      onBuy={buy}
      onBuyConsumable={buyConsumable}
      onBuyGear={buyGear}
      onBack={onBack}
      onOpenFishing={onOpenFishing}
      onOpenChallenges={onOpenChallenges}
      onOpenLeaderboard={onOpenLeaderboard}
      onOpenHallOfFame={onOpenHallOfFame}
    />
  );
}
