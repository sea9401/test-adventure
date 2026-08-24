import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusBanner } from "./StatusBanner";

describe("StatusBanner", () => {
  it("처리 가능 상태를 오류와 다른 주황색 의미로 표시한다", () => {
    const html = renderToStaticMarkup(
      <StatusBanner tone="actionable" role="status">
        수확 가능
      </StatusBanner>,
    );

    expect(html).toContain("border-orange-300");
    expect(html).toContain("bg-orange-50");
    expect(html).toContain('role="status"');
  });
});
