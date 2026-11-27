import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT, v2ItemTypeLabel } from "@/adventure/data/v2/v2Equipment";
import { rollItemStats } from "@/adventure/data/v2/v2EquipVariance";
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
    expect(html).toContain("focus-visible:ring-focus");
  });

  it("판매 선택은 다크 모드에서 중립 표면과 장미색 강조를 사용하고 희귀도 표식을 유지한다", () => {
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
    expect(html).toContain("dark:bg-zinc-900");
    expect(html).toContain("dark:border-rose-500");
    expect(html).not.toContain("dark:bg-rose-950");
    expect(html).toContain('aria-pressed="true"');
  });

  it("잠금 선택은 잠긴 장비와 장착 장비도 고를 수 있고 상한에 닿으면 나머지를 막는다", () => {
    const cards = [
      { inst: { iid: "locked", id: "v2_starter_staff" as const, locked: true }, isEquipped: false },
      { inst: { iid: "equipped", id: "v2_starter_staff" as const }, isEquipped: true },
      { inst: { iid: "rest", id: "v2_starter_staff" as const }, isEquipped: false },
    ];
    const open = renderToStaticMarkup(
      <EquipmentCardGrid
        cards={cards}
        onOpenCard={() => undefined}
        saleSelection={{
          active: true,
          selectedIids: new Set(["locked"]),
          onToggle: () => undefined,
          purpose: "lock",
          max: 100,
        }}
      />,
    );
    expect(open).not.toContain("선택 불가");
    expect(open).toContain("잠금 선택됨");
    expect(open).toContain("잠금 선택 안 됨");
    expect(open).toContain("border-indigo-400");
    expect(open).not.toContain("border-rose-400");

    const full = renderToStaticMarkup(
      <EquipmentCardGrid
        cards={cards}
        onOpenCard={() => undefined}
        saleSelection={{
          active: true,
          selectedIids: new Set(["locked", "equipped"]),
          onToggle: () => undefined,
          purpose: "lock",
          max: 2,
        }}
      />,
    );
    expect(full.match(/잠금 선택됨/g)).toHaveLength(2);
    expect(full).toContain("잠금 선택 불가: 최대 2개");
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

    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain("회피도 286");
    expect(text).not.toContain("회피도 285.6");
  });

  it("장비 옵션을 말줄임 없이 옵션 단위로 줄바꿈해 모두 보여준다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCardGrid
        cards={[
          {
            inst: {
              iid: "many-options",
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
            },
            isEquipped: false,
          },
        ]}
        onOpenCard={() => undefined}
      />,
    );

    const statList = html.match(
      /<ul aria-label="장비 옵션"[^>]*>(.*?)<\/ul>/,
    );
    expect(statList).not.toBeNull();
    expect(statList![0]).not.toContain("line-clamp");
    expect(statList![0]).toContain("flex-wrap");
    const items = statList![1].match(/<li class="[^"]*whitespace-nowrap[^"]*">/g);
    expect(items!.length).toBeGreaterThanOrEqual(5);
    expect(statList![1]).not.toContain(" · ");
  });

  it("티어와 종류는 상자 없이 한 줄 글자로, 품질은 이름과 막대를 붙여 보여 준다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCardGrid
        cards={[
          {
            inst: {
              iid: "rolled",
              id: "v2_iron_sword",
              roll: rollItemStats(V2_EQUIPMENT.v2_iron_sword, () => 0.999),
            },
            isEquipped: true,
          },
          { inst: { iid: "plain", id: "v2_iron_sword" }, isEquipped: false },
        ]}
        onOpenCard={() => undefined}
      />,
    );
    const [rolled, plain] = html.split('aria-label="철검 정보"').slice(1);

    // 티어 색은 남기되 상자(테두리·바탕)는 없앤다.
    expect(rolled).toContain("!bg-transparent");
    expect(rolled).toContain(v2ItemTypeLabel(V2_EQUIPMENT.v2_iron_sword));
    expect(rolled).toContain(">품질<");
    expect(rolled).toMatch(/style="width:\d+%"/);
    expect(rolled).toContain('aria-label="장착됨"');
    expect(rolled).toContain(">장착 중<");
    // 굴림이 없는 장비에는 품질 줄을 만들지 않는다.
    expect(plain).not.toContain(">품질<");
    expect(plain).not.toContain(">장착 중<");
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
  it("마법부여 장비는 줄 수를, 마법부여 없는 귀속 장비는 귀속 표식을 목록 카드에 보여준다", () => {
    const html = renderToStaticMarkup(
      <EquipmentCardGrid
        cards={[
          {
            inst: {
              iid: "enchanted",
              id: "v2_starter_staff",
              bound: true,
              liberation: { rank: 2, lineCount: 3, revision: 1, options: [] },
            },
            isEquipped: false,
          },
          {
            inst: { iid: "bound", id: "v2_starter_staff", bound: true },
            isEquipped: false,
          },
          {
            inst: { iid: "plain", id: "v2_starter_staff" },
            isEquipped: false,
          },
        ]}
        onOpenCard={() => undefined}
      />,
    );
    expect(html.match(/마법부여 3줄/g)).toHaveLength(1);
    expect(html.match(/>귀속</g)).toHaveLength(1);
  });
});
