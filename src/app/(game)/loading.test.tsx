import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Loading from "./loading";

describe("게임 라우트 공통 로딩 셸", () => {
  it("불투명 표면과 고정 스켈레톤으로 즉시 진행 상태를 알린다", () => {
    const html = renderToStaticMarkup(<Loading />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="화면 불러오는 중"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("bg-white");
    expect(html).toContain("dark:bg-zinc-900");
    expect(html).toContain("h-10");
    expect(html).toContain("h-20");
  });
});
