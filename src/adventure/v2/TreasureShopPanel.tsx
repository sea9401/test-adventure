"use client";

import { TreasureShopView } from "./TreasureShopView";
import { useTreasureShop } from "./useTreasureShop";

// 발굴 코인 상점 패널 — 마운트 시 상태 fetch(useTreasureShop) 후 뷰에 주입.
export function TreasureShopPanel({
  onBack,
  onOpenDig,
  onOpenLeaderboard,
  onOpenCollection,
}: {
  onBack: () => void;
  onOpenDig?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenCollection?: () => void;
}) {
  const { state, loading, error, buying, buy, buyConsumable } =
    useTreasureShop();
  return (
    <TreasureShopView
      state={state}
      loading={loading}
      error={error}
      buying={buying}
      onBuy={buy}
      onBuyConsumable={buyConsumable}
      onBack={onBack}
      onOpenDig={onOpenDig}
      onOpenLeaderboard={onOpenLeaderboard}
      onOpenCollection={onOpenCollection}
    />
  );
}
