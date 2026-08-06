import { describe, expect, it } from "vitest";
import { TOWN_MENU_ITEMS } from "./MainTabNav";

describe("마을 드롭다운 메뉴", () => {
  it("통합 교환소와 일반 상점을 각각 노출한다", () => {
    expect(
      TOWN_MENU_ITEMS.map(({ label, href }) => ({ label, href })),
    ).toEqual(
      expect.arrayContaining([
        { label: "통합 교환소", href: "/town/exchange" },
        { label: "일반 상점", href: "/town/shop" },
      ]),
    );
  });
});
