// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CHARACTER_MENU_ITEMS, MainTabNav } from "./MainTabNav";

vi.mock("./AdventureDashboardProvider", () => ({
  useAdventureDashboard: () => ({
    snapshot: {
      activities: [
        {
          id: "farm_ready",
          group: "ready",
          tab: "life",
          title: "농장 수확",
          detail: "수확 가능 5칸",
          href: "/town/farm",
          state: "actionable",
          enabled: true,
          defaultEnabled: true,
        },
      ],
      notifications: {
        tabs: { life: true },
        paths: { "/town/farm": true },
      },
    },
  }),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("상단 캐릭터 하위 메뉴", () => {
  it("전투 프리셋 전용 경로를 제공한다", () => {
    expect(CHARACTER_MENU_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "전투 프리셋",
          href: "/character/presets",
        }),
      ]),
    );
  });
});

describe("메인 탭 디자인 시스템", () => {
  it("활성 탭과 처리 가능한 생활 메뉴를 같은 상태 언어로 표시한다", () => {
    render(
      <MainTabNav
        activeKey="life"
        gameStateLoaded
        viewerGuildId={null}
        onNavigate={vi.fn()}
      />,
    );

    const lifeTab = screen.getByRole("button", {
      name: "생활, 처리 가능한 항목 있음",
    });
    expect(lifeTab.className).toContain("text-violet-700");
    expect(lifeTab.className).toContain("border-b-2");

    fireEvent.click(lifeTab);
    const farm = screen.getByRole("menuitem", {
      name: "모험가 농장, 처리 가능한 항목 있음",
    });
    expect(farm.className).toContain("bg-zinc-50");
    expect(farm.textContent).toContain("수확 가능 5칸");
  });
});
