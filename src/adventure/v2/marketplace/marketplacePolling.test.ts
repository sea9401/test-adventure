import { describe, expect, it } from "vitest";
import type { Listing } from "./marketplaceShared";
import {
  marketplaceBrowseSnapshotKey,
  marketplacePollDelayMs,
} from "./marketplacePolling";

const LISTING: Listing = {
  id: 1,
  isMine: false,
  isHighestBidder: false,
  hasMyBid: false,
  kind: "material",
  itemId: "iron_ore",
  itemName: "철광석",
  quantity: 2,
  price: 100,
  instancePayload: null,
  createdAt: "2026-09-10T00:00:00.000Z",
  bidEndsAt: "2026-09-10T06:00:00.000Z",
  expiresAt: "2026-09-10T06:00:00.000Z",
  highestBid: null,
  bidCount: 0,
  bidResolvedAt: null,
  nextBid: 100,
};

describe("marketplace polling", () => {
  it("동일 응답이 2회와 5회 누적되면 10초에서 30초와 60초로 늦춘다", () => {
    expect(marketplacePollDelayMs(0)).toBe(10_000);
    expect(marketplacePollDelayMs(1)).toBe(10_000);
    expect(marketplacePollDelayMs(2)).toBe(30_000);
    expect(marketplacePollDelayMs(4)).toBe(30_000);
    expect(marketplacePollDelayMs(5)).toBe(60_000);
  });

  it("화면 데이터가 바뀔 때만 browse snapshot이 달라진다", () => {
    const original = marketplaceBrowseSnapshotKey(false, 500, [LISTING]);
    expect(marketplaceBrowseSnapshotKey(false, 500, [{ ...LISTING }])).toBe(original);
    expect(marketplaceBrowseSnapshotKey(false, 500, [{ ...LISTING, bidCount: 1 }])).not.toBe(original);
    expect(marketplaceBrowseSnapshotKey(false, 501, [LISTING])).not.toBe(original);
    expect(marketplaceBrowseSnapshotKey(true, 500, [LISTING])).not.toBe(original);
  });
});
