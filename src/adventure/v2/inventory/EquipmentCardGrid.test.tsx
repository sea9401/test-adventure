import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EquipmentCardGrid } from "./EquipmentCardGrid";

describe("EquipmentCardGrid", () => {
  it("강화로 생긴 소수 위력은 장비 카드에서 정수로 표시한다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCardGrid
        cards={[
          {
            inst: {
              iid: "enhanced-armor",
              id: "v2_storm_sanctuary_armor",
              roll: {
                power: 255,
                weight: 0,
                options: {
                  hp: 1_178,
                  mp: 330,
                  magicDef: 156,
                  healPowerPct: 18,
                },
              },
              enhance: { level: 7, bonusPct: 12 },
            },
            isEquipped: false,
          },
        ]}
        onOpenCard={() => undefined}
      />,
    );

    expect(html).toContain("회피도 286");
    expect(html).not.toContain("회피도 285.6");
  });
});
