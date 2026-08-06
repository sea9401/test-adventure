import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EquipmentPowerPreviewBlock } from "./V2ItemCompareCard";

describe("EquipmentPowerPreviewBlock", () => {
  it("현재·후보 전투력과 상승분을 함께 표시한다", () => {
    const html = renderToStaticMarkup(
      <EquipmentPowerPreviewBlock
        preview={{
          status: "ready",
          currentPower: 1234,
          candidatePower: 1288,
          delta: 54,
        }}
      />,
    );

    expect(html).toContain("예상 전투력");
    expect(html).toContain("1,234");
    expect(html).toContain("1,288");
    expect(html).toContain("▲54");
  });

  it("계산 중 상태를 표시한다", () => {
    const html = renderToStaticMarkup(
      <EquipmentPowerPreviewBlock preview={{ status: "loading" }} />,
    );
    expect(html).toContain("계산 중…");
  });
});
