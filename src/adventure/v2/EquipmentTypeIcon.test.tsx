import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HandFist, MagicWand, Shield, Sneaker, Sword } from "@phosphor-icons/react";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { BowIcon, DaggerIcon, NecklaceIcon, RingIcon } from "./EquipmentSlotIcons";
import { EquipmentTypeIcon, equipmentTypeIcon } from "./EquipmentTypeIcon";

const items = Object.values(V2_EQUIPMENT);
const find = (predicate: (item: (typeof items)[number]) => boolean) => {
  const item = items.find(predicate);
  if (!item) throw new Error("표본 장비가 없습니다");
  return item;
};

describe("equipmentTypeIcon", () => {
  it("무기는 종류마다 다른 아이콘을 쓴다", () => {
    expect(equipmentTypeIcon(find((i) => i.weaponType === "greatsword")).Icon).toBe(Sword);
    expect(equipmentTypeIcon(find((i) => i.weaponType === "staff")).Icon).toBe(MagicWand);
    expect(equipmentTypeIcon(find((i) => i.weaponType === "bow")).Icon).toBe(BowIcon);
    expect(equipmentTypeIcon(find((i) => i.weaponType === "dagger")).Icon).toBe(DaggerIcon);
  });

  it("무기 종류가 비어 있으면 컨셉으로 가장 가까운 종류를 고른다", () => {
    expect(equipmentTypeIcon({ slot: "weapon", concept: "int" }).Icon).toBe(MagicWand);
    expect(equipmentTypeIcon({ slot: "weapon", concept: "dex" }).Icon).toBe(DaggerIcon);
    expect(equipmentTypeIcon({ slot: "weapon", concept: "str" }).Icon).toBe(Sword);
  });

  it("나머지 부위의 아이콘과 부위별 색은 전과 같다", () => {
    const expected = {
      armor: [Shield, "text-sky-500"],
      gloves: [HandFist, "text-amber-500"],
      boots: [Sneaker, "text-emerald-500"],
      ring: [RingIcon, "text-violet-500"],
      necklace: [NecklaceIcon, "text-pink-500"],
    } as const;
    for (const [slot, [Icon, color]] of Object.entries(expected)) {
      const result = equipmentTypeIcon(find((i) => i.slot === slot));
      expect(result.Icon).toBe(Icon);
      expect(result.color).toBe(color);
    }
    expect(equipmentTypeIcon(find((i) => i.weaponType === "bow")).color).toBe(
      "text-rose-500",
    );
  });
});

describe("EquipmentTypeIcon", () => {
  const bow = find((i) => i.weaponType === "bow");

  it("부위 색으로 그리고, 색을 끄면 주변 글자색을 따른다", () => {
    const colored = renderToStaticMarkup(<EquipmentTypeIcon item={bow} />);
    const plain = renderToStaticMarkup(
      <EquipmentTypeIcon item={bow} size={25} colored={false} />,
    );

    expect(colored).toContain("text-rose-500");
    expect(colored).toContain('width="20"');
    expect(colored).toContain('aria-hidden="true"');
    expect(plain).not.toContain("text-rose-500");
    expect(plain).toContain('width="25"');
  });
});
