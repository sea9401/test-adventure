import type { Listing } from "./marketplaceShared";

export type MarketplaceMyBid = Omit<
  Listing,
  "isMine" | "hasMyBid" | "createdAt"
> & {
  status: "active" | "sold" | "cancelled" | "expired";
  createdAt: string;
  closedAt: string | null;
  myHighestBid: number;
  lastBidAt: string;
  isBuyer: boolean;
};

export type MarketplaceMyBidPresentation = {
  key: "leading" | "outbid" | "settling" | "won" | "lost" | "cancelled";
  label: string;
  guidance: string;
  active: boolean;
};

export function marketplaceMyBidPresentation(
  bid: MarketplaceMyBid,
  clockMs: number,
): MarketplaceMyBidPresentation {
  if (bid.status === "active") {
    if (new Date(bid.bidEndsAt).getTime() <= clockMs) {
      return {
        key: "settling",
        label: "정산 대기",
        guidance: "최대 5분 내 정산",
        active: false,
      };
    }
    if (bid.isHighestBidder) {
      return {
        key: "leading",
        label: "최고 입찰 중",
        guidance: "입찰금 예치 중",
        active: true,
      };
    }
    return {
      key: "outbid",
      label: "상위 입찰 발생",
      guidance: "우편함에서 입찰금 반환 확인",
      active: true,
    };
  }
  if (bid.status === "sold") {
    return bid.isBuyer
      ? {
          key: "won",
          label: "낙찰 완료",
          guidance: "인벤토리에서 물품 확인",
          active: false,
        }
      : {
          key: "lost",
          label: "입찰 종료",
          guidance: "우편함에서 입찰금 반환 확인",
          active: false,
        };
  }
  return {
    key: "cancelled",
    label: "취소·만료",
    guidance: "우편함에서 반환 내역 확인",
    active: false,
  };
}

export function sortMarketplaceMyBids(
  rows: readonly MarketplaceMyBid[],
  clockMs: number,
): MarketplaceMyBid[] {
  const ongoingKeys = new Set(["leading", "outbid", "settling"]);
  return rows.slice().sort((left, right) => {
    const leftOngoing = ongoingKeys.has(
      marketplaceMyBidPresentation(left, clockMs).key,
    );
    const rightOngoing = ongoingKeys.has(
      marketplaceMyBidPresentation(right, clockMs).key,
    );
    if (leftOngoing !== rightOngoing) return leftOngoing ? -1 : 1;
    return (
      new Date(right.lastBidAt).getTime() -
      new Date(left.lastBidAt).getTime()
    );
  });
}
