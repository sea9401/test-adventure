import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { V2ItemCard } from "./V2ItemCardPopover";

describe("V2ItemCard set information", () => {
  it("lists every compatible item for a threshold-based tag set", () => {
    const item = V2_EQUIPMENT.v2_crafted_combo_bow;
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={item}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
        equippedIds={new Set([item.id])}
      />,
    );

    expect(html).toContain("세트 정보");
    expect(html).toContain("연격각인 장비 세트");
    expect(html).toContain("세트 장비");
    for (const pieceName of [
      "연환궁",
      "연격각인 전투복",
      "연격각인 장갑",
      "연격각인 장화",
      "연환 반지",
      "맥동 목걸이",
    ]) {
      expect(html).toContain(pieceName);
    }
  });

  it("keeps fixed-piece sets on the same set-information layout", () => {
    const item = V2_EQUIPMENT.v2_canyon_set_armor;
    const html = renderToStaticMarkup(
      <V2ItemCard
        item={item}
        anchor={{ top: 20, bottom: 60, left: 20 }}
        onClose={() => undefined}
        equippedIds={new Set([item.id])}
      />,
    );

    expect(html).toContain("세트 정보");
    expect(html).toContain("세트 장비");
    expect(html).toContain("마른땅 갑주");
    expect(html).toContain("분열의 장갑");
    expect(html).toContain("협곡 보행화");
  });
});
