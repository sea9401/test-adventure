// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketplaceMyBids } from "./MarketplaceMyBids";
import type { MarketplaceMyBid } from "./marketplaceBidTracking";

const CLOCK_MS = Date.parse("2026-09-02T07:00:00.000Z");

function bidFixture(
  id: number,
  patch: Partial<MarketplaceMyBid> = {},
): MarketplaceMyBid {
  return {
    id,
    kind: "material",
    itemId: "v2_red_enhance_stone",
    itemName: `붉은 강화석 ${id}`,
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

afterEach(cleanup);

describe("거래소 내 입찰 패널", () => {
  it("진행·상위 입찰·종료 상태에서 금액과 자산 확인 위치를 표시한다", () => {
    const onOpenBid = vi.fn();
    const leading = bidFixture(1);
    const outbid = bidFixture(2, {
      isHighestBidder: false,
      highestBid: 1_500,
    });
    const won = bidFixture(3, {
      status: "sold",
      isBuyer: true,
      closedAt: "2026-09-02T06:30:00.000Z",
    });

    render(
      <MarketplaceMyBids
        rows={[won, outbid, leading]}
        clockMs={CLOCK_MS}
        busy={false}
        onOpenBid={onOpenBid}
      />,
    );

    expect(screen.getAllByText("내 최고 입찰 1,200G")).toHaveLength(3);
    expect(screen.getByText("입찰금 예치 중")).not.toBeNull();
    expect(screen.getByText("우편함에서 입찰금 반환 확인")).not.toBeNull();
    expect(screen.getByText("인벤토리에서 물품 확인")).not.toBeNull();
    const actions = screen.getAllByRole("button", { name: /입찰 내역/ });
    expect(actions).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "붉은 강화석 3 입찰 내역" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "붉은 강화석 1 입찰 내역" }),
    );
    expect(onOpenBid).toHaveBeenCalledWith(leading);
  });

  it("로딩과 빈 내역을 명시한다", () => {
    const { rerender } = render(
      <MarketplaceMyBids
        rows={null}
        clockMs={CLOCK_MS}
        busy={false}
        onOpenBid={() => {}}
      />,
    );
    expect(screen.getByText("내 입찰 내역을 불러오는 중입니다.")).not.toBeNull();

    rerender(
      <MarketplaceMyBids
        rows={[]}
        clockMs={CLOCK_MS}
        busy={false}
        onOpenBid={() => {}}
      />,
    );
    expect(screen.getByText("아직 참여한 입찰이 없어요.")).not.toBeNull();
  });
});
