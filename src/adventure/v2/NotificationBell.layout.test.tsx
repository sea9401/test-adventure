import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./NotificationBell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("NotificationBell 모바일 터치 영역", () => {
  it("알림 버튼에 44px 정사각형 터치 영역을 제공한다", () => {
    const html = renderToStaticMarkup(<NotificationBell />);

    expect(html).toContain("min-h-11 min-w-11");
    expect(html).toContain("sm:min-h-0 sm:min-w-0");
  });
});
