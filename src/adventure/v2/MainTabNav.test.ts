import { describe, expect, it } from "vitest";
import {
  LIFE_MENU_ITEMS,
  TOWN_MENU_ITEMS,
  guildMenuItemsForViewer,
  lifeMenuStateForHref,
  townMenuItemsForViewer,
} from "./MainTabNav";

describe("마을 드롭다운 메뉴", () => {
  it("NPC·시설만 노출하고 생활 항목과 일반 상점은 제거한다", () => {
    const items = TOWN_MENU_ITEMS.map(({ label, href }) => ({ label, href }));

    expect(items).toEqual(
      expect.arrayContaining([
        { label: "모험가 협회", href: "/town/association" },
        { label: "통합 교환소", href: "/town/exchange" },
      ]),
    );
    expect(items.map(({ href }) => href)).not.toContain("/town/farm");
    expect(items.map(({ href }) => href)).not.toContain("/town/life-workshop");
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

describe("생활 드롭다운 메뉴", () => {
  it("장소 선택이 필요한 벌목과 채광은 생활 지도로 통합한다", () => {
    expect(LIFE_MENU_ITEMS.map(({ href }) => href)).toEqual([
      "/map",
      "/town/life-workshop",
      "/town/farm",
      "/town/fishing",
      "/town/kitchen",
    ]);
  });

  it("활성 활동 중 행동 가능 상태를 우선해 표시한다", () => {
    const state = lifeMenuStateForHref(
      [
        {
          id: "farm_daily",
          group: "daily",
          tab: "life",
          title: "납품",
          detail: "1 / 2",
          href: "/town/farm",
          state: "in_progress",
          current: 1,
          target: 2,
          enabled: true,
          defaultEnabled: true,
        },
        {
          id: "farm_ready",
          group: "ready",
          tab: "life",
          title: "수확",
          detail: "수확 가능 3칸",
          href: "/town/farm",
          state: "actionable",
          enabled: true,
          defaultEnabled: true,
        },
      ],
      "/town/farm",
    );
    expect(state).toEqual({ text: "수확 가능 3칸", actionable: true });
  });

  it("개인 설정에서 끈 활동은 상태와 점에서 제외한다", () => {
    expect(
      lifeMenuStateForHref(
        [
          {
            id: "farm_ready",
            group: "ready",
            tab: "life",
            title: "수확",
            detail: "수확 가능",
            href: "/town/farm",
            state: "actionable",
            enabled: false,
            defaultEnabled: true,
          },
        ],
        "/town/farm",
      ),
    ).toBeNull();
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
