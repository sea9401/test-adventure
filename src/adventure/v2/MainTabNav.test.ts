import { describe, expect, it } from "vitest";
import {
  TOWN_MENU_ITEMS,
  guildMenuItemsForViewer,
  townMenuItemsForViewer,
} from "./MainTabNav";

describe("마을 드롭다운 메뉴", () => {
  it("협회·통합 교환소·생활 작업장을 노출하고 일반 상점은 제거한다", () => {
    const items = TOWN_MENU_ITEMS.map(({ label, href }) => ({ label, href }));

    expect(items).toEqual(
      expect.arrayContaining([
        { label: "모험가 협회", href: "/town/association" },
        { label: "통합 교환소", href: "/town/exchange" },
        { label: "생활 의뢰·조합 작업장", href: "/town/life-workshop" },
      ]),
    );
    expect(items).not.toContainEqual({ label: "일반 상점", href: "/town/shop" });
  });

  it("길드 가입자에게만 협회 메뉴를 숨긴다", () => {
    expect(townMenuItemsForViewer(null).map((item) => item.href)).toContain(
      "/town/association",
    );
    expect(townMenuItemsForViewer(7).map((item) => item.href)).not.toContain(
      "/town/association",
    );
    expect(
      townMenuItemsForViewer(null, false).map((item) => item.href),
    ).not.toContain("/town/association");
  });
});

describe("길드 드롭다운 메뉴", () => {
  it("길드 가입자에게 토벌전을 길드와 시설 사이에 노출한다", () => {
    const items = guildMenuItemsForViewer(7, ["guild_smithy"]).map(
      ({ label, href }) => ({ label, href }),
    );

    expect(items).toEqual([
      { label: "길드", href: "/guild" },
      { label: "토벌전", href: "/guild?tab=raid" },
      {
        label: "제작소",
        href: "/guild?tab=facilities&facility=guild_smithy",
      },
    ]);
  });

  it("무소속 사용자에게는 토벌전을 노출하지 않는다", () => {
    expect(guildMenuItemsForViewer(null).map((item) => item.href)).toEqual([
      "/guild",
    ]);
  });
});
