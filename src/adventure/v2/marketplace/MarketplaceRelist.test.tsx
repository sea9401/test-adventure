import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mintListedEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import {
  MarketplaceRelistButton,
  RelistDialog,
  relistUnavailableText,
} from "./MarketplaceRelist";
import type { Listing } from "./marketplaceShared";

const base: Listing = {
  id: 7,
  closedStatus: "expired",
  isMine: true,
  isHighestBidder: false,
  hasMyBid: false,
  kind: "equip",
  itemId: "v2_chain_mail",
  itemName: "쇠사슬 갑옷",
  quantity: 1,
  price: 10_000,
  instancePayload: { power: 7, weight: 3 },
  createdAt: "2026-11-23T00:00:00Z",
  bidEndsAt: "2026-11-23T00:00:00Z",
  expiresAt: "2026-11-23T00:00:00Z",
  highestBid: null,
  bidCount: 0,
  bidResolvedAt: "2026-11-23T00:00:00Z",
  nextBid: 1,
};

describe("유찰 내역의 다시 올리기", () => {
  it("유찰된 장비 줄에 버튼을 보여 준다", () => {
    const html = renderToStaticMarkup(
      <MarketplaceRelistButton listing={base} busy={false} submit={vi.fn()} />,
    );
    expect(html).toContain("다시 올리기");
  });

  it("취소한 매물과 소모품에는 버튼이 없다", () => {
    for (const listing of [
      { ...base, closedStatus: "cancelled" as const },
      { ...base, kind: "consumable" as const },
    ]) {
      expect(
        renderToStaticMarkup(
          <MarketplaceRelistButton listing={listing} busy={false} submit={vi.fn()} />,
        ),
      ).toBe("");
    }
  });

  it("창은 30% 낮춘 가격을 먼저 넣고 인하 폭과 등록 시간을 고르게 한다", () => {
    const piece = mintListedEquipInstance("v2_chain_mail", base.instancePayload);
    const html = renderToStaticMarkup(
      <RelistDialog
        listing={base}
        busy={false}
        inventory={{ owned: [piece], equipped: {}, materials: {} }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(html).toContain("유찰된 시작 입찰가");
    expect(html).toContain("10,000G");
    expect(html).toContain('value="7,000"');
    expect(html).toContain("30% 낮춤");
    expect(html).toContain("10% 낮춤");
    expect(html).toContain("같은 가격");
    expect(html).toContain("24시간");
    expect(html).not.toContain('role="alert"');
  });

  it("가방에 없으면 이유를 알리고 등록을 막는다", () => {
    const html = renderToStaticMarkup(
      <RelistDialog
        listing={base}
        busy={false}
        inventory={{ owned: [], equipped: {}, materials: {} }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(html).toContain("가방에서 이 장비를 찾지 못했습니다");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*등록/);
  });

  it("재료가 모자라면 보유 수량을 알려 준다", () => {
    expect(
      relistUnavailableText({ ok: false, reason: "missing_material", holding: 12 }),
    ).toBe("보유 수량이 모자랍니다(보유 12개). 팔기 탭에서 수량을 정해 올려 주세요.");
    expect(relistUnavailableText({ ok: true, body: {} })).toBeNull();
  });
});
