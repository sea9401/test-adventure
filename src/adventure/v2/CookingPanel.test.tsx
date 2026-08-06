import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SurplusCropLabel } from "./CookingPanel";

describe("농장 떨이 교환", () => {
  it("콩을 기기 의존 이모지 대신 농장 아이템 이미지로 표시한다", () => {
    const html = renderToStaticMarkup(
      <SurplusCropLabel itemId="soybean" itemName="콩" owned={23} />,
    );

    expect(html).toContain("/images/items/farm/soybean.webp");
    expect(html).toContain('aria-label="콩"');
    expect(html).toContain("<strong>23</strong>개");
    expect(html).not.toContain("🫘");
  });
});
