import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SafetyReportItem, type SafetyReport } from "./SafetyReportsTab";

describe("운영 거래소 신고 검토", () => {
  it("거래 원본과 양쪽 계정을 표시하고 콘텐츠 삭제 동작은 숨긴다", () => {
    const report: SafetyReport = {
      id: 91,
      reporterUserId: "reporter-id",
      reporterName: "신고자",
      subjectType: "content",
      sourceType: "marketplace_trade",
      sourceId: "42",
      targetUserId: "seller-id",
      targetName: "판매자",
      reason: "market_manipulation",
      details: "반복 거래 같습니다.",
      contentSnapshot: "거래 번호: 42\n품목: 철광석",
      contextSnapshot: {
        relatedAccounts: [
          { userId: "seller-id", name: "판매자" },
          { userId: "buyer-id", name: "구매자" },
        ],
      },
      status: "open",
      adminNote: null,
      createdAt: "2026-08-17T01:00:00.000Z",
      reviewedAt: null,
    };

    const html = renderToStaticMarkup(
      <SafetyReportItem
        report={report}
        canModerate={false}
        onSaved={vi.fn()}
        showToast={vi.fn()}
      />,
    );

    expect(html).toContain("거래소 체결 신고");
    expect(html).toContain("시세 조작 의심");
    expect(html).toContain("관련 거래 계정");
    expect(html).toContain("판매자");
    expect(html).toContain("구매자");
    expect(html).not.toContain("신고 콘텐츠 제거");
  });
});
