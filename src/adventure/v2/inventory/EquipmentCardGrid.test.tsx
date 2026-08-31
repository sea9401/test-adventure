import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EquipmentCardGrid } from "./EquipmentCardGrid";

describe("EquipmentCardGrid", () => {
  it("모바일부터 2열이며 장비 카드를 고정된 큰 높이로 늘리지 않는다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCardGrid
        cards={[
          {
            inst: { iid: "starter", id: "v2_starter_staff" },
            isEquipped: false,
          },
        ]}
        onOpenCard={() => undefined}
      />,
    );
    expect(html).toContain("grid-cols-2");
    expect(html).not.toContain("min-h-[7.5rem]");
    expect(html).toContain("min-h-11");
    expect(html).toContain("ui-game-card");
    expect(html).toContain("rounded-xl");
    expect(html).toContain("focus-visible:ring-violet-500");
  });

  it("판매 선택은 불투명 장미색으로 표시하고 희귀도 표식을 유지한다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCardGrid
        cards={[
          {
            inst: { iid: "starter", id: "v2_starter_staff" },
            isEquipped: false,
          },
        ]}
        onOpenCard={() => undefined}
        saleSelection={{
          active: true,
          selectedIids: new Set(["starter"]),
          onToggle: () => undefined,
        }}
      />,
    );

    expect(html).toContain("ui-item-rarity-t1");
    expect(html).toContain("bg-rose-50");
    expect(html).toContain("dark:bg-rose-950");
    expect(html).toContain('aria-pressed="true"');
  });

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

  it("실제 유니크 장비에만 유니크 배지를 표시한다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCardGrid
        cards={[
          {
            inst: { iid: "unique", id: "v2_sanctum_sig_spire_staff" },
            isEquipped: false,
          },
          {
            inst: { iid: "common", id: "v2_swamp_bruiser_armor" },
            isEquipped: false,
          },
        ]}
        onOpenCard={() => undefined}
      />,
    );

    expect(html.match(/>유니크</g)).toHaveLength(1);
  });
});
