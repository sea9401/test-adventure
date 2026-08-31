import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ContentSafetyActions } from "./ContentSafetyActions";

describe("콘텐츠 안전 동작", () => {
  it("내 콘텐츠가 아닌 대상의 신고와 차단을 더보기 메뉴로 접어 제공한다", () => {
    const html = renderToStaticMarkup(
      <ContentSafetyActions
        sourceType="bulletin_post"
        sourceId={42}
        targetName="신고대상"
        onBlocked={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="신고대상 신고 및 차단 메뉴"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(">신고<");
    expect(html).not.toContain(">차단<");
    expect(html).not.toContain('disabled=""');
  });

  it("문자열로 식별되는 공개 프로필도 같은 더보기 동작을 제공한다", () => {
    const html = renderToStaticMarkup(
      <ContentSafetyActions
        sourceType="profile"
        sourceId="다른모험가"
        targetName="다른모험가"
      />,
    );

    expect(html).toContain('aria-label="다른모험가 신고 및 차단 메뉴"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain(">신고<");
    expect(html).not.toContain(">차단<");
  });
});
