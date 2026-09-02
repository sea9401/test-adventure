import { describe, expect, it } from "vitest";
import {
  marketplaceMyBidPresentation,
  sortMarketplaceMyBids,
  type MarketplaceMyBid,
} from "./marketplaceBidTracking";

const CLOCK_MS = Date.parse("2026-09-02T07:00:00.000Z");

function bidFixture(
  patch: Partial<MarketplaceMyBid> = {},
): MarketplaceMyBid {
  return {
    id: 1,
    kind: "material",
    itemId: "v2_red_enhance_stone",
    itemName: "붉은 강화석",
    quantity: 1,
    price: 2_000,
    instancePayload: null,
    status: "active",
    createdAt: "2026-09-02T05:00:00.000Z",
    bidEndsAt: "2026-09-02T08:00:00.000Z",
    expiresAt: "2026-09-02T10:00:00.000Z",
    closedAt: null,
    highestBid: 1_200,
    bidCount: 1,
    bidResolvedAt: null,
    myHighestBid: 1_200,
    lastBidAt: "2026-09-02T06:05:00.000Z",
    isHighestBidder: true,
    isBuyer: false,
    nextBid: 1_260,
    ...patch,
  };
}

describe("내 입찰 상태 표시", () => {
  it.each([
    [
      "최고 입찰 중",
      bidFixture(),
      {
        key: "leading",
        label: "최고 입찰 중",
        guidance: "입찰금 예치 중",
        active: true,
      },
    ],
    [
      "상위 입찰 발생",
      bidFixture({ isHighestBidder: false, highestBid: 1_500 }),
      {
        key: "outbid",
        label: "상위 입찰 발생",
        guidance: "우편함에서 입찰금 반환 확인",
        active: true,
      },
    ],
    [
      "정산 대기",
      bidFixture({ bidEndsAt: "2026-09-02T06:59:59.000Z" }),
      {
        key: "settling",
        label: "정산 대기",
        guidance: "최대 5분 내 정산",
        active: false,
      },
    ],
    [
      "낙찰 완료",
      bidFixture({ status: "sold", isBuyer: true }),
      {
        key: "won",
        label: "낙찰 완료",
        guidance: "인벤토리에서 물품 확인",
        active: false,
      },
    ],
    [
      "입찰 종료",
      bidFixture({ status: "sold", isHighestBidder: false }),
      {
        key: "lost",
        label: "입찰 종료",
        guidance: "우편함에서 입찰금 반환 확인",
        active: false,
      },
    ],
    [
      "취소·만료",
      bidFixture({ status: "cancelled", isHighestBidder: false }),
      {
        key: "cancelled",
        label: "취소·만료",
        guidance: "우편함에서 반환 내역 확인",
        active: false,
      },
    ],
  ] as const)("%s 상태를 자산 확인 위치와 함께 표시한다", (_name, bid, expected) => {
    expect(marketplaceMyBidPresentation(bid, CLOCK_MS)).toEqual(expected);
  });

  it("진행 중·정산 대기 항목을 종료된 최근 항목보다 먼저 정렬한다", () => {
    const olderActive = bidFixture({
      id: 1,
      lastBidAt: "2026-09-02T05:00:00.000Z",
    });
    const newerClosed = bidFixture({
      id: 2,
      status: "sold",
      isBuyer: true,
      lastBidAt: "2026-09-02T06:30:00.000Z",
    });
    const newestActive = bidFixture({
      id: 3,
      isHighestBidder: false,
      lastBidAt: "2026-09-02T06:45:00.000Z",
    });

    expect(
      sortMarketplaceMyBids(
        [newerClosed, olderActive, newestActive],
        CLOCK_MS,
      ).map((bid) => bid.id),
    ).toEqual([3, 1, 2]);
  });
});
