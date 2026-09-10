import type { V2EquipInstance, V2EquipSlot } from "@/adventure/data/v2/v2Equipment";
import type { RareMapInstance } from "@/adventure/data/v2/rareMaps";
import type { MuseunCashItemCounts } from "@/adventure/data/v2/museunCashItems";
import type { CookingFoodInventory, CookingFoodDefinitionMap } from "../cooking/foodShared";
import type { FishSpecimenInventory } from "../fishSpecimens";
import type { MarketplaceMyBid } from "./marketplaceBidTracking";
import type { PriceStat } from "./marketplaceShared";
import { type Listing } from "./marketplaceShared";

type BrowseResponse = {
  ok?: boolean;
  viewerGold?: number;
  serverNow?: number;
  auctionHours?: number;
  bidExtensionWindowMinutes?: number;
  bidExtensionMinutes?: number;
  listings?: Listing[];
};


export async function readMarketplaceBrowse(mineOnly: boolean) {
  const response = await fetch(`/api/v2/marketplace/browse${mineOnly ? "?mine=1" : ""}`);
  const payload = (await response.json().catch(() => null)) as BrowseResponse | null;
  if (!response.ok || !payload?.ok) throw new Error(`목록 로드 실패 (${response.status})`);
  return payload;
}


export async function readMarketplaceHistory(mineOnly: boolean): Promise<Listing[]> {
  const response = await fetch(`/api/v2/marketplace/history${mineOnly ? "?mine=1" : ""}`);
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; trades?: Trade[] } | null;
  if (!response.ok || !payload?.ok) throw new Error(`거래 내역 로드 실패 (${response.status})`);
  return (payload.trades ?? []).map(tradeToListing);
}


export async function readMarketplaceMyBids(): Promise<MarketplaceMyBid[]> {
  const response = await fetch("/api/v2/marketplace/my-bids");
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; bids?: MarketplaceMyBid[] } | null;
  if (!response.ok || !payload?.ok) throw new Error(`입찰 내역 로드 실패 (${response.status})`);
  return payload.bids ?? [];
}


export async function readMarketplacePrices(): Promise<Record<string, PriceStat> | null> {
  const response = await fetch("/api/v2/marketplace/prices");
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; prices?: Record<string, PriceStat> } | null;
  return payload?.ok && payload.prices ? payload.prices : null;
}


// 최근 거래(체결 내역) 한 행 — /api/v2/marketplace/history. status='sold' 스냅샷.
export type Trade = {
  id: number;
  kind: string;
  itemId: string;
  itemName: string;
  quantity: number;
  price: number;
  instancePayload: unknown;
  closedAt: string | null;
  side?: "buy" | "sell";
};




export function tradeToListing(trade: Trade): Listing {
  return {
    id: trade.id,
    isMine: trade.side === "sell",
    isHighestBidder: trade.side === "buy",
    hasMyBid: trade.side === "buy",
    kind: trade.kind as Listing["kind"],
    itemId: trade.itemId,
    itemName: trade.itemName,
    quantity: trade.quantity,
    price: trade.price,
    instancePayload: trade.instancePayload,
    createdAt: trade.closedAt ?? "",
    bidEndsAt: trade.closedAt ?? "",
    expiresAt: trade.closedAt ?? "",
    highestBid: null,
    bidCount: 0,
    bidResolvedAt: trade.closedAt,
    nextBid: 1,
  };
}

export async function readMarketplaceSellOverview() {
  const response = await fetch("/api/v2/marketplace/sell-overview");
  const json = (await response.json().catch(() => null)) as {
    ok?: boolean;
    owned?: V2EquipInstance[];
    equipped?: Partial<Record<V2EquipSlot, string>>;
    materials?: Record<string, number>;
    rareMaps?: RareMapInstance[];
    cashItems?: MuseunCashItemCounts;
    cookingFoods?: CookingFoodInventory;
    cookingFoodDefinitions?: CookingFoodDefinitionMap;
    specimens?: FishSpecimenInventory["items"];
  } | null;
  if (!response.ok || !json?.ok) throw new Error("sell_overview_failed");
  return json;
}
