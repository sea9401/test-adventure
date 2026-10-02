import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionHeading } from "./SectionHeading";

describe("SectionHeading", () => {
  it("기본은 h2 섹션 제목이고 화면 스타일 훅 클래스를 단다", () => {
    const html = renderToStaticMarkup(<SectionHeading title="화면 스타일" />);

    expect(html).toMatch(/<h2 class="[^"]*ui-heading ui-section-title/);
    expect(html).toContain("text-sm font-bold");
    expect(html).toContain("화면 스타일");
    expect(html).not.toContain("ui-eyebrow");
  });

  it("분류 글자는 제목 앞에 작은 라벨로 놓인다", () => {
    const html = renderToStaticMarkup(
      <SectionHeading eyebrow="무기" title="희귀 백은 지팡이" />,
    );

    expect(html).toContain("ui-eyebrow");
    expect(html.indexOf("무기")).toBeLessThan(html.indexOf("희귀 백은 지팡이"));
  });

  it("h3로 바꿀 수 있고 오른쪽 액션을 함께 보여 준다", () => {
    const html = renderToStaticMarkup(
      <SectionHeading as="h3" title="보상" right={<button>받기</button>} />,
    );

    expect(html).toContain("<h3");
    expect(html).not.toContain("<h2");
    expect(html).toContain("<button>받기</button>");
  });
});
