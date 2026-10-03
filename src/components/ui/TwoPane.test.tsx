import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TwoPane } from "./TwoPane";

describe("TwoPane", () => {
  it("1024px 미만에서는 위아래로 쌓고, 이상에서는 왼쪽 고정 폭과 오른쪽 나머지로 나눈다", () => {
    const html = renderToStaticMarkup(
      <TwoPane aside={<p>목록</p>}>
        <p>상세</p>
      </TwoPane>,
    );

    expect(html).toMatch(/^<div class="[^"]*space-y-3[^"]*lg:grid[^"]*lg:grid-cols-\[20rem_minmax\(0,1fr\)\]/);
    expect(html.indexOf("목록")).toBeLessThan(html.indexOf("상세"));
    expect(html).toMatch(/<aside class="[^"]*lg:sticky[^"]*lg:top-\[calc\(var\(--game-header-height,4rem\)\+1rem\)\]/);
  });

  it("왼쪽 칸이 길어질 수 있는 화면은 고정하지 않아 아래쪽이 가려지지 않게 한다", () => {
    const html = renderToStaticMarkup(
      <TwoPane aside={<p>필터</p>} sticky={false}>
        <p>결과</p>
      </TwoPane>,
    );

    expect(html).toMatch(/<aside class="[^"]*"/);
    expect(html).not.toContain("lg:sticky");
  });
});
