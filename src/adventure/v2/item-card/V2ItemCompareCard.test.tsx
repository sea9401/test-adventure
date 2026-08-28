import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { CompareSetLine, EquipmentPowerPreviewBlock } from "./V2ItemCompareCard";

describe("장비 세트 표시", () => {
  it("세트 장비를 자체 SVG 아이콘으로 표시한다", () => {
    const item = V2_EQUIPMENT.v2_canyon_set_armor;
    const html = renderToStaticMarkup(
      <CompareSetLine item={item} equippedIds={new Set()} />,
    );

    expect(html).toContain('data-plump-icon="equipment_set"');
    expect(html).not.toContain("🔗");
  });
});

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
