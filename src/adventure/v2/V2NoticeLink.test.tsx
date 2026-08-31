import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2NoticeLink } from "./V2NoticeLink";

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
});
