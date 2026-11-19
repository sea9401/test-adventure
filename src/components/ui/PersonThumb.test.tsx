import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PROFILE_BORDER_VARIANTS } from "@/adventure/data/v2/museunCosmetics";
import { PersonLabel, PersonThumb, ROW_THUMB_CLASS } from "./PersonThumb";

const css = readFileSync(
  join(__dirname, "..", "..", "app", "globals.css"),
  "utf8",
);

describe("PersonThumb", () => {
  it("목록 줄은 28px, 채팅 줄은 32px 프사에 줄 머리 그림 훅 클래스를 단다", () => {
    const list = renderToStaticMarkup(
      <PersonThumb avatar="male1" name="돌담" />,
    );
    const chat = renderToStaticMarkup(
      <PersonThumb avatar="female1" name="새벽빛" size="chat" />,
    );

    expect(ROW_THUMB_CLASS).toBe("ui-row-thumb");
    expect(list).toContain("ui-row-thumb");
    expect(list).toContain("size-7");
    expect(list).toContain('alt="돌담 프로필"');
    expect(chat).toContain("ui-row-thumb");
    expect(chat).toContain("size-8");
  });

  it("프로필 테두리 꾸미기는 움직이지 않는 색 테두리로 보인다", () => {
    const border = PROFILE_BORDER_VARIANTS[0].id;
    const html = renderToStaticMarkup(
      <PersonThumb avatar="male1" name="돌담" profileBorder={border} />,
    );

    expect(html).toContain(`ui-profile-frame-${border}`);
    expect(html).toContain("ui-profile-frame-static");
  });

  it("은신 모드와 터미널 모드에서는 줄 머리 그림을 숨긴다", () => {
    expect(css).toMatch(
      /html\.ui-discreet-mode \.ui-row-thumb,\s*html\.ui-terminal-mode \.ui-row-thumb \{\s*display: none;/,
    );
  });
});

describe("PersonLabel", () => {
  it("프사 뒤에 이름을 말줄임으로 놓고 보조 정보를 이어 붙인다", () => {
    const html = renderToStaticMarkup(
      <PersonLabel avatar="male1" name="아주긴이름의모험가">
        <span>길드장</span>
      </PersonLabel>,
    );

    expect(html.indexOf("ui-row-thumb")).toBeLessThan(
      html.indexOf("아주긴이름의모험가</span>"),
    );
    expect(html).toContain("truncate");
    expect(html).toContain("길드장");
  });
});
