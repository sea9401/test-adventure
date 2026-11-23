"use client";

import { mintListedEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import { RelistDialog } from "@/adventure/v2/marketplace/MarketplaceRelist";
import type { Listing } from "@/adventure/v2/marketplace/marketplaceShared";

const PAYLOAD = { power: 7, weight: 3 };
const LISTING: Listing = {
  id: 1,
  closedStatus: "expired",
  isMine: true,
  isHighestBidder: false,
  hasMyBid: false,
  kind: "equip",
  itemId: "v2_chain_mail",
  itemName: "쇠사슬 갑옷",
  quantity: 1,
  price: 120_000,
  instancePayload: PAYLOAD,
  createdAt: "2026-11-23T00:00:00Z",
  bidEndsAt: "2026-11-23T00:00:00Z",
  expiresAt: "2026-11-23T00:00:00Z",
  highestBid: null,
  bidCount: 0,
  bidResolvedAt: "2026-11-23T00:00:00Z",
  nextBid: 1,
};
const PIECE = mintListedEquipInstance("v2_chain_mail", PAYLOAD);

// ?missing=1 이면 가방에 없는 경우를 보여 준다.
export function MarketplaceRelistPreview() {
  const missing =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("missing") === "1";
  return (
    <RelistDialog
      listing={LISTING}
      busy={false}
      inventory={{ owned: missing ? [] : [PIECE], equipped: {}, materials: {} }}
      onClose={() => {}}
      onSubmit={() => {}}
    />
  );
}
