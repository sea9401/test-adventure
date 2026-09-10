// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChromeStatusProvider } from "./ChromeStatusProvider";
import { V2NoticeLink } from "./V2NoticeLink";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("V2NoticeLink", () => {
  it("미열람 공지가 있으면 접근 가능한 설명과 빨간 점을 표시한다", () => {
    const html = renderToStaticMarkup(<V2NoticeLink initialHasUnread />);

    expect(html).toContain('href="/plaza/notices"');
    expect(html).toContain("공지사항, 읽지 않은 공지 있음");
    expect(html).toContain("bg-rose-500");
  });

  it("모두 읽었으면 신규 표시를 숨긴다", () => {
    const html = renderToStaticMarkup(<V2NoticeLink />);

    expect(html).toContain('aria-label="공지사항"');
    expect(html).not.toContain("bg-rose-500");
  });

  it("통합 chrome 상태의 미열람 공지를 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          notificationUnread: 0,
          mailUnread: 0,
          hasUnreadNotice: true,
        }),
      ),
    );

    render(
      <ChromeStatusProvider>
        <V2NoticeLink />
      </ChromeStatusProvider>,
    );

    expect(
      await screen.findByRole("link", {
        name: "공지사항, 읽지 않은 공지 있음",
      }),
    ).not.toBeNull();
  });
});
