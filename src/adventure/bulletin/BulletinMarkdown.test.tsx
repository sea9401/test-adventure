import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BulletinMarkdown,
  safeBulletinMarkdownUrl,
} from "./BulletinMarkdown";

describe("BulletinMarkdown", () => {
  it("소제목·강조·목록·표를 제한된 마크다운으로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={[
          "## 업데이트",
          "",
          "**중요한 변경**입니다.",
          "",
          "- 첫 번째",
          "- 두 번째",
          "",
          "| 항목 | 내용 |",
          "| --- | --- |",
          "| 보상 | 2개 |",
        ].join("\n")}
      />,
    );

    expect(html).toContain("<h2>업데이트</h2>");
    expect(html).toContain("<strong>중요한 변경</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<table");
    expect(html).toContain("<td>2개</td>");
  });

  it("기존 평문 게시글의 한 줄 바꿈을 보존한다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown content={"첫째 줄\n둘째 줄"} />,
    );
    expect(html).toContain("첫째 줄<br/>\n둘째 줄");
  });

  it("원시 HTML·이미지·위험한 링크를 렌더링하지 않는다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={[
          "<script>alert('xss')</script>",
          "![추적 이미지](https://example.com/pixel.png)",
          "[위험 링크](javascript:alert('xss'))",
        ].join("\n\n")}
      />,
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("pixel.png");
    expect(html).toContain("위험 링크");
  });

  it("외부 링크는 새 창 보안을 적용하고 내부 링크는 현재 창을 쓴다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content="[외부](https://example.com) [내부](/manual/controls)"
      />,
    );
    expect(html).toContain(
      'href="https://example.com" class="font-medium',
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="/manual/controls"');
  });
});

describe("safeBulletinMarkdownUrl", () => {
  it("http(s)와 내부 경로만 허용한다", () => {
    expect(safeBulletinMarkdownUrl("https://example.com", "href", {} as never)).toBe(
      "https://example.com",
    );
    expect(safeBulletinMarkdownUrl("/manual", "href", {} as never)).toBe(
      "/manual",
    );
    expect(safeBulletinMarkdownUrl("javascript:alert(1)", "href", {} as never)).toBe(
      "",
    );
    expect(safeBulletinMarkdownUrl("data:text/html,x", "href", {} as never)).toBe(
      "",
    );
  });
});
