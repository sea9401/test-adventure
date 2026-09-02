"use client";

import {
  V2MarketplaceView,
  type MarketplacePreviewData,
} from "@/adventure/v2/V2MarketplaceView";
import { GameStateProvider } from "@/adventure/v2/GameStateProvider";
import { RewardToastProvider } from "@/adventure/v2/RewardToastProvider";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";

const weaponSamples = Object.values(V2_EQUIPMENT)
  .filter((item) => item.slot === "weapon")
  .slice(0, 3);

const listings = weaponSamples.map((item, index) => ({
  id: index + 1,
  isMine: false,
  isHighestBidder: index === 0,
  hasMyBid: index === 0,
  kind: "equip" as const,
  itemId: item.id,
  itemName: item.name,
  quantity: 1,
  price: [840_000, 1_020_000, 1_340_000][index],
  instancePayload:
    index === 1
      ? { craftedBy: { name: "망치장이", level: 4, masterwork: true } }
      : {},
  createdAt: new Date(Date.now() - (index + 1) * 18 * 60_000).toISOString(),
  bidEndsAt: new Date(Date.now() + (index + 1) * 60 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + (index + 3) * 60 * 60_000).toISOString(),
  highestBid: index === 0 ? 850_000 : null,
  bidCount: index === 0 ? 3 : 0,
  bidResolvedAt: null,
  nextBid: index === 0 ? 892_500 : 1,
}));

const prices: MarketplacePreviewData["prices"] = Object.fromEntries(
  weaponSamples.map((item) => [
    item.id,
    { n: 12, avg: 1_000_000, min: 780_000, max: 1_420_000 },
  ]),
);

export const marketplacePreview: MarketplacePreviewData = {
  viewerGold: 12_340_000,
  auctionHours: 6,
  bidExtensionWindowMinutes: 10,
  bidExtensionMinutes: 10,
  listings,
  prices,
};

export function MarketplaceHarness() {
  return (
    <GameStateProvider>
      <RewardToastProvider>
        <V2MarketplaceView onBack={() => {}} preview={marketplacePreview} />
      </RewardToastProvider>
    </GameStateProvider>
  );
}
