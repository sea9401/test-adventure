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
    expect(html).toMatch(/<strong[^>]*>중요한 변경<\/strong>/);
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

  it("구조화된 공지의 편집용 단일 개행은 강제 줄바꿈으로 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={[
          "# 업데이트 안내",
          "",
          "긴 문장을 편집기에서 읽기 편하게 나눴지만",
          "게시된 본문에서는 한 문단으로 자연스럽게 이어집니다.",
          "",
          "- 변경 사항",
        ].join("\n")}
      />,
    );

    expect(html).toContain("<h1>업데이트 안내</h1>");
    expect(html).not.toContain("<br");
    expect(html).toContain("읽기 편하게 나눴지만\n게시된 본문에서는");
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
    expect(html).toContain("상세 업데이트 내역");
    expect(html).toContain("펼치기");
    expect(html).toContain("접기");
    expect(html).toContain("text-sky-800");
    expect(html).toContain("text-violet-800");
    expect(html).toContain("text-amber-800");
    expect(html).toContain(
      '<strong class="font-extrabold text-zinc-950 dark:text-zinc-50">중요 변경</strong>',
    );
    expect(html).toContain("<ul>");
    expect(html).toContain("점검 요약");
    expect(html).toContain("감사합니다.");
  });

  it("details 제목의 굵은 글씨도 일반 제목보다 분명하게 강조한다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={[":::details **필독 사항**", "본문", ":::"].join("\n")}
      />,
    );
    const summary = html.match(/<summary[\s\S]*?<\/summary>/)?.[0] ?? "";

    expect(summary).toContain(
      '<strong class="font-extrabold text-zinc-950 dark:text-zinc-50">필독 사항</strong>',
    );
  });

  it("details 제목의 색상 문법을 인라인 색상으로 렌더링한다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={[
          ":::details [파랑]일반적인 피해 처리 순서[/파랑]",
          "피해 처리 설명",
          ":::",
        ].join("\n")}
      />,
    );
    const summary = html.match(/<summary[\s\S]*?<\/summary>/)?.[0] ?? "";

    expect(summary).toContain("일반적인 피해 처리 순서");
    expect(summary).toContain('class="text-sky-700 dark:text-sky-300');
    expect(summary).not.toContain("[파랑]");
    expect(summary).not.toContain("[/파랑]");
  });

  it("복사 과정에서 최대 세 칸 들여쓴 details 블록도 접기 영역으로 만든다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={[
          "  ## 업데이트 안내",
          "",
          "  :::details 생활 현장 업데이트 내용 보기",
          "  **중요 변경**",
          "",
          "  - 변경 사항",
          "  :::",
        ].join("\n")}
      />,
    );

    expect(html).toContain("<details");
    expect(html).toContain("생활 현장 업데이트 내용 보기</span>");
    expect(html).toContain(">펼치기</span>");
    expect(html).toContain(">접기</span>");
    expect(html).toMatch(/<strong[^>]*>중요 변경<\/strong>/);
    expect(html).toContain("<li>변경 사항</li>");
  });

  it("CRLF와 들여쓰기가 섞인 연속 details 블록을 각각 정확히 접는다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={[
          "  ## 스킬 SP 요구량 전면 조정",
          "",
          "  :::details SP 요구량이 증가한 스킬",
          "",
          "  - 연격 3 → 4",
          "  - 흑월지배 13 → 16",
          "",
          "  :::",
          "",
          "  :::details SP 요구량이 감소한 스킬",
          "",
          "  - 만상귀일 10 → 7",
          "  - 비전 폭발 9 → 4",
          "",
          "  :::",
          "",
          "  이후 안내입니다.",
        ].join("\r\n")}
      />,
    );

    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html.match(/<summary/g)).toHaveLength(2);
    expect(html).toContain("SP 요구량이 증가한 스킬");
    expect(html).toContain("SP 요구량이 감소한 스킬");
    expect(html).toContain("<li>연격 3 → 4</li>");
    expect(html).toContain("<li>만상귀일 10 → 7</li>");
    expect(html).toContain("이후 안내입니다.");
    expect(html).not.toContain(":::details");
  });

  it("네 칸 들여쓴 details 예시는 코드로 유지한다", () => {
    const html = renderToStaticMarkup(
      <BulletinMarkdown
        content={["    :::details 예시", "    본문", "    :::"].join("\n")}
      />,
    );

    expect(html).not.toContain("<details");
    expect(html).toContain(":::details 예시");
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
