import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("모바일 44px 높이와 보라색 포커스 링을 제공한다", () => {
    const html = renderToStaticMarkup(<TextInput aria-label="검색" />);

    expect(html).toContain("min-h-11");
    expect(html).toContain("rounded-lg");
    expect(html).toContain("focus-visible:ring-violet-500");
    expect(html).toContain("bg-white");
  });
});
