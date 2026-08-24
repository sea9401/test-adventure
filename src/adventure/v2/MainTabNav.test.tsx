// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
        {
          id: "mastery_tower_daily",
          group: "daily",
          tab: "battle",
          title: "숙련의 탑",
          detail: "오늘 기록 보상 수령 가능",
          href: "/battle/mastery-tower",
          state: "actionable",
          enabled: true,
          defaultEnabled: true,
        },
        {
          id: "woodcutting_ready",
          group: "ready",
          tab: "life",
          title: "자동 벌목",
          detail: "느티나무 작업 완료",
          href: "/town/logging",
          state: "actionable",
          enabled: true,
          defaultEnabled: true,
        },
      ],
      notifications: {
        tabs: { battle: true, life: true },
        paths: {
          "/battle/mastery-tower": true,
          "/town/farm": true,
          "/town/logging": true,
        },
      },
    },
  }),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

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
  it("6개 탭을 전체 폭에 균등한 한 줄로 배치한다", () => {
    render(
      <MainTabNav
        activeKey="adventure"
        gameStateLoaded
        viewerGuildId={null}
        onNavigate={vi.fn()}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "메인 메뉴" });
    expect(nav.className).not.toContain("max-w-[864px]");
    expect(nav.firstElementChild?.className).toContain("grid-cols-6");

    const tabs = screen.getAllByRole("button", {
      name: /^(모험|전투|마을|생활|캐릭터|길드)/,
    });
    expect(tabs).toHaveLength(6);
    for (const tab of tabs) {
      expect(tab.className).toContain("min-w-0");
      expect(tab.className).toContain("text-[0.625rem]");
    }
  });

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

  it("전투 탭 알림의 정확한 하위 콘텐츠와 상태를 표시한다", () => {
    render(
      <MainTabNav
        activeKey="battle"
        gameStateLoaded
        viewerGuildId={null}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "전투, 처리 가능한 항목 있음",
      }),
    );

    const tower = screen.getByRole("menuitem", {
      name: "숙련의 탑, 처리 가능한 항목 있음",
    });
    expect(tower.textContent).toContain("오늘 기록 보상 수령 가능");
  });

  it("생활 지도의 하위 작업 알림도 실제 콘텐츠 이름으로 모아 표시한다", () => {
    render(
      <MainTabNav
        activeKey="life"
        gameStateLoaded
        viewerGuildId={null}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "생활, 처리 가능한 항목 있음",
      }),
    );

    const map = screen.getByRole("menuitem", {
      name: "생활 지도, 처리 가능한 항목 있음",
    });
    expect(map.textContent).toContain("자동 벌목 · 느티나무 작업 완료");
  });

  it("모든 드롭다운 메뉴 카드를 상태 문구 유무와 관계없이 같은 높이로 표시한다", () => {
    render(
      <MainTabNav
        activeKey="battle"
        gameStateLoaded
        viewerGuildId={null}
        onNavigate={vi.fn()}
      />,
    );

    for (const tabName of ["전투", "마을", "생활", "캐릭터", "길드"]) {
      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(`^${tabName}`),
        }),
      );

      for (const item of screen.getAllByRole("menuitem")) {
        expect(item.className).toContain("h-14");
      }
    }
  });
});
