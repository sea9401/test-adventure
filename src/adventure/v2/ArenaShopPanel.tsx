"use client";

import { ArenaShopView } from "./ArenaShopView";
import { useArenaShop } from "./useArenaShop";

// 투기장 코인 상점 패널 — 마운트 시 상태 fetch(useArenaShop) 후 뷰에 주입.
// V2ArenaView "상점" 탭에서 렌더. (낚시 코인 상점 FishingShopPanel 미러.)
export function ArenaShopPanel() {
  const { state, loading, error, buying, buy } = useArenaShop();
  return (
    <ArenaShopView
      state={state}
      loading={loading}
      error={error}
      buying={buying}
      onBuy={buy}
    />
  );
}
