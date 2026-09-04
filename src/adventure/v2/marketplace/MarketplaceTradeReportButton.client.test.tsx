// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketplaceTradeReportButton } from "./MarketplaceTradeReportButton";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("판매 중 매물 신고 요청", () => {
  it("완료 거래가 아닌 매물 소스 유형과 ID를 전송한다", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ ok: true, reportId: 91 }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MarketplaceTradeReportButton
        tradeId={77}
        itemName="은광석"
        sourceType="marketplace_listing"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "은광석 매물 신고" }));
    fireEvent.click(screen.getByRole("button", { name: "신고 접수" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      subjectType: "content",
      sourceType: "marketplace_listing",
      sourceId: 77,
      reason: "abnormal_price",
    });
  });
});
