import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TabBar } from "./TabBar";

describe("TabBar 모바일 폭", () => {
  it("스크롤 탭의 전체 길이가 부모 너비를 밀어내지 않는다", () => {
    const html = renderToStaticMarkup(
      <TabBar
        tabs={[
          { key: "one", label: "첫 번째" },
          { key: "two", label: "두 번째" },
          { key: "three", label: "세 번째" },
        ]}
        active="one"
        onChange={() => {}}
        ariaLabel="예시 탭"
        scrollable
      />,
    );

    expect(html).toContain("w-full min-w-0 max-w-full");
    expect(html).toContain("overflow-x-auto");
  });

  it.each(["sm", "md", "lg"] as const)(
    "%s 탭은 모바일에서 최소 40px 높이를 확보한다",
    (size) => {
      const html = renderToStaticMarkup(
        <TabBar
          tabs={[{ key: "one", label: "첫 번째" }]}
          active="one"
          onChange={() => {}}
          ariaLabel="예시 탭"
          size={size}
        />,
      );

      expect(html).toContain("min-h-10");
      expect(html).toContain("sm:min-h-0");
    },
  );
});
