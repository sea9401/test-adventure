// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChromeStatusProvider } from "./ChromeStatusProvider";
import { NotificationBell } from "./NotificationBell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NotificationBell 모바일 터치 영역", () => {
  it("알림 버튼에 44px 정사각형 터치 영역을 제공한다", () => {
    const html = renderToStaticMarkup(<NotificationBell />);

    expect(html).toContain("min-h-11 min-w-11");
    expect(html).toContain("sm:min-h-0 sm:min-w-0");
  });

  it("9+ 미읽음 배지를 작은 글자에서도 AA 대비로 표시한다", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      Response.json({
        ok: true,
        notificationUnread: 10,
        mailUnread: 2,
        hasUnreadNotice: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChromeStatusProvider>
        <NotificationBell />
      </ChromeStatusProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "알림 및 우편 12개" }),
    ).not.toBeNull();
    expect(screen.getByText("9+").className).toContain("bg-rose-700");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v2/chrome-status");
  });
});


it("낙찰 알림 미리보기에 품목·수량·가격과 지급 완료를 표시한다", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("chrome-status")) {
      return Response.json({ ok: true, notificationUnread: 1, mailUnread: 0 });
    }
    if (url === "/api/v2/notifications") {
      return Response.json({ ok: true, unreadCount: 1, notifications: [{
        id: 91, type: "auction_won", readAt: null, createdAt: Date.now(),
        payload: { listingId: 42, itemName: "철광석", quantity: 4, totalPrice: 1500 },
      }] });
    }
    return Response.json({ ok: true, items: [], unreadCount: 0 });
  }));
  render(<ChromeStatusProvider><NotificationBell /></ChromeStatusProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "알림 및 우편 1개" }));
  expect(await screen.findByText(/철광석 ×4.*1,500골드.*물품 지급이 완료/)).not.toBeNull();
});


it("알림 센터에서도 낙찰과 물품 지급 완료를 표시한다", async () => {
  const { V2NotificationsView } = await import("./V2NotificationsView");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/v2/notifications") {
      return Response.json({ ok: true, notifications: [{
        id: 91, type: "auction_won", readAt: null, createdAt: Date.now(),
        payload: { listingId: 42, itemName: "철광석", quantity: 4, totalPrice: 1500 },
      }] });
    }
    return Response.json({ ok: true, items: [] });
  }));
  render(<V2NotificationsView
    onBack={() => {}} onOpenOutpost={() => {}} onOpenFeedback={() => {}}
    onOpenFarm={() => {}} onOpenCoopSession={() => {}} initialTab="notifications"
  />);
  expect(await screen.findByText(/철광석 ×4.*1,500골드.*물품 지급이 완료/)).not.toBeNull();
});
