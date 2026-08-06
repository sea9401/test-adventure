import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatComposer } from "./ChatComposer";

describe("ChatComposer", () => {
  it("모바일 입력 글자를 16px로 유지하고 좁은 화면에서 입력칸이 줄어든다", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        draft="테스트"
        onDraftChange={() => {}}
        onOpenItemPicker={() => {}}
        onRemoveItemLink={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(html).toContain("min-w-0");
    expect(html).toContain("text-base");
    expect(html).toContain("sm:text-sm");
    expect(html).toContain("보유 장비 링크 첨부");
  });

  it("본문 없이 장비만 첨부해도 전송할 수 있다", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        draft=""
        itemLink={{ kind: "equipment", itemId: "v2_iron_sword" }}
        onDraftChange={() => {}}
        onOpenItemPicker={() => {}}
        onRemoveItemLink={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(html).toContain("철검");
    expect(html).toContain("옵션 첨부");
    expect(html).not.toContain('aria-label="전송" disabled=""');
  });
});
