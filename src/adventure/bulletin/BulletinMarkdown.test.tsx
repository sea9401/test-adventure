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

  it("허용된 기본 색상 문법을 안전한 글자색으로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content="[빨강]긴급[/빨강] [주황]주의[/주황] [초록]완료[/초록] [파랑]안내[/파랑] [보라]특별[/보라]"
      />,
    );

    expect(html).toContain("text-rose-700");
    expect(html).toContain("text-amber-700");
    expect(html).toContain("text-emerald-700");
    expect(html).toContain("text-sky-700");
    expect(html).toContain("text-violet-700");
    expect(html).not.toContain("bulletin-color:");
  });

  it("전용 details 블록을 접기 영역으로 만들고 내부 마크다운을 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={[
          "점검 요약",
          "",
          ":::details 상세 업데이트 내역",
          "**중요 변경**",
          "",
          "- 변경 사항 1",
          "- 변경 사항 2",
          ":::",
          "",
          "감사합니다.",
        ].join("\n")}
      />,
    );

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("상세 업데이트 내역</summary>");
    expect(html).toContain("<strong>중요 변경</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("점검 요약");
    expect(html).toContain("감사합니다.");
  });

  it("코드 펜스 안의 details 예시는 접기 영역으로 변환하지 않는다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={["```md", ":::details 예시", "본문", ":::", "```"].join(
          "\n",
        )}
      />,
    );

    expect(html).not.toContain("<details");
    expect(html).toContain(":::details 예시");
  });

  it("원시 HTML·이미지·위험한 링크를 렌더링하지 않는다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={[
          "<script>alert('xss')</script>",
          "<details><summary>원시 접기</summary>본문</details>",
          "![추적 이미지](https://example.com/pixel.png)",
          "[위험 링크](javascript:alert('xss'))",
        ].join("\n\n")}
      />,
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<details");
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
    expect(
      safeBulletinMarkdownUrl("bulletin-color:red", "href", {} as never),
    ).toBe("bulletin-color:red");
    expect(
      safeBulletinMarkdownUrl("bulletin-color:unknown", "href", {} as never),
    ).toBe("");
    expect(safeBulletinMarkdownUrl("javascript:alert(1)", "href", {} as never)).toBe(
      "",
    );
    expect(safeBulletinMarkdownUrl("data:text/html,x", "href", {} as never)).toBe(
      "",
    );
  });
});
