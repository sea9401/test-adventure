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

describe("TabBar 선택과 알림", () => {
  it("선택 탭은 보라색 밑줄을, 알림은 접근 가능한 라벨을 사용한다", () => {
    const html = renderToStaticMarkup(
      <TabBar
        tabs={[
          { key: "home", label: "모험" },
          {
            key: "life",
            label: "생활",
            badge: "",
            badgeLabel: "처리 가능한 생활 항목 있음",
          },
        ]}
        active="home"
        onChange={() => {}}
        ariaLabel="메인 탭"
        variant="highlight"
      />,
    );

    expect(html).toContain("text-violet-700");
    expect(html).toContain("border-b-2");
    expect(html).toContain('aria-label="처리 가능한 생활 항목 있음"');
  });
});
