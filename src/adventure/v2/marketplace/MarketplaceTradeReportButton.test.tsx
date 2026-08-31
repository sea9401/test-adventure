import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MarketplaceTradeReportButton,
  MarketplaceTradeReportDialog,
  marketplaceTradeReportResponseMessage,
} from "./MarketplaceTradeReportButton";

describe("거래소 체결 신고", () => {
  it("거래 전용 사유와 불투명 신고 표면만 제공한다", () => {
    const html = renderToStaticMarkup(
      <MarketplaceTradeReportDialog
        tradeId={42}
        itemName="철광석"
        reason="abnormal_price"
        details=""
        busy={false}
        feedback={null}
        onReasonChange={vi.fn()}
        onDetailsChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("철광석 거래 신고");
    expect(html).toContain("비정상적으로 높거나 낮은 가격");
    expect(html).toContain("시세 조작 의심");
    expect(html).toContain("현금 거래·계정 간 자산 이전 의심");
    expect(html).toContain("기타");
    expect(html).toContain('maxLength="500"');
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-zinc-900");
    expect(html).not.toContain("차단");
    expect(html).not.toContain("사용자 신고");
  });

  it("행에는 신고 버튼만 접어 두고 계정 정보를 요구하지 않는다", () => {
    const html = renderToStaticMarkup(
      <MarketplaceTradeReportButton tradeId={42} itemName="철광석" />,
    );

    expect(html).toContain('aria-label="철광석 거래 신고"');
    expect(html).not.toContain("판매자");
    expect(html).not.toContain("구매자");
  });

  it("중복·제한·원본 없음·일반 실패를 구분한다", () => {
    expect(marketplaceTradeReportResponseMessage(409, "already reported")).toBe(
      "이미 접수되어 검토 중인 거래입니다.",
    );
    expect(marketplaceTradeReportResponseMessage(429, "rate limited")).toBe(
      "신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
    );
    expect(marketplaceTradeReportResponseMessage(404, "not found")).toBe(
      "거래 기록을 찾을 수 없거나 더 이상 신고할 수 없습니다.",
    );
    expect(marketplaceTradeReportResponseMessage(500, "failed")).toBe(
      "신고를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.",
    );
  });
});
