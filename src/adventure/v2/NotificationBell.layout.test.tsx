// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return Response.json(
          url.includes("/api/v2/notifications")
            ? { ok: true, unreadCount: 10 }
            : { unreadCount: 2 },
        );
      }),
    );

    render(<NotificationBell />);

    expect(
      await screen.findByRole("button", { name: "알림 및 우편 12개" }),
    ).not.toBeNull();
    expect(screen.getByText("9+").className).toContain("bg-rose-700");
  });
});
