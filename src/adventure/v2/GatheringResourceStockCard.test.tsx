import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GatheringResourceStockCard } from "@/adventure/v2/GatheringResourceStockCard";

describe("GatheringResourceStockCard", () => {
  it("선택 자원 이름과 현재 보유량을 표시한다", () => {
    const html = renderToStaticMarkup(
      <GatheringResourceStockCard
        resourceName="단단한 원목"
        count={1234}
        tone="woodcutting"
      />,
    );

    expect(html).toContain("현재 자원 보유량");
    expect(html).toContain("단단한 원목");
    expect(html).toContain("1,234개");
  });
});
