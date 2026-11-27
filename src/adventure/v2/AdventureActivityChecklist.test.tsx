// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdventureActivityChecklist } from "./AdventureActivityChecklist";
import type { AdventureActivityView } from "./adventureDashboard";

const activities: AdventureActivityView[] = [
  {
    id: "farm_ready",
    group: "ready",
    tab: "life",
    title: "농장 수확",
    detail: "수확 가능 2칸",
    href: "/town/farm",
    state: "actionable",
    enabled: true,
    defaultEnabled: true,
  },
  {
    id: "expedition",
    group: "daily",
    tab: "battle",
    title: "원정",
    detail: "3 / 3",
    href: "/battle/storm-expedition",
    state: "completed",
    current: 3,
    target: 3,
    enabled: true,
    defaultEnabled: true,
  },
];

afterEach(cleanup);

describe("오늘의 모험 체크", () => {
  it("목업처럼 통합 진행도·초기화 시간·지금 가능한 행동을 한 헤더에 모은다", () => {
    render(
      <AdventureActivityChecklist
        defaultExpanded
        activities={activities}
        summary={{ completed: 1, total: 1, actionableCount: 1 }}
        serverNow={Date.UTC(2026, 7, 24, 9, 30)}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("1 / 1 완료")).toBeTruthy();
    expect(screen.getByText("초기화까지 5시간 30분")).toBeTruthy();
    const summary = screen.getByTestId("actionable-summary");
    expect(summary.textContent).toContain("지금 가능한 행동");
    expect(summary.textContent).toContain("농장 수확");
    expect(summary.getAttribute("href")).toBe("/town/farm");
    expect(screen.getByTestId("checklist-groups").className).toContain(
      "sm:grid-cols-2",
    );
    expect(document.querySelector("details")).toBeNull();
    const list = within(screen.getByTestId("checklist-groups"));
    expect(
      list.getByRole("link", { name: /농장 수확/ }).getAttribute("href"),
    ).toBe("/town/farm");
    expect(list.getByRole("link", { name: /농장 수확/ }).textContent).toContain(
      "수확",
    );
  });

  it("조회 실패는 다른 홈 콘텐츠를 막지 않고 재시도만 제공한다", () => {
    const onRetry = vi.fn();
    render(
      <AdventureActivityChecklist
        defaultExpanded
        activities={[]}
        summary={{ completed: 0, total: 0, actionableCount: 0 }}
        error="활동 상태를 불러오지 못했습니다."
        onRetry={onRetry}
      />,
    );
    const retry = screen.getByRole("button", { name: "다시 시도" });
    expect(retry.className).toContain("bg-primary/10");
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("시작한 작업이 없는 생활 항목은 완료가 아니라 대기로 표시한다", () => {
    render(
      <AdventureActivityChecklist
        defaultExpanded
        activities={[
          {
            ...activities[0]!,
            detail: "재배 중인 작물 없음",
            state: "completed",
          },
        ]}
        summary={{ completed: 0, total: 0, actionableCount: 0 }}
        loading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    const row = within(screen.getByTestId("checklist-groups")).getByRole("link", {
      name: /농장 수확/,
    });
    expect(row.textContent).toContain("대기");
    expect(row.textContent).not.toContain("완료");
    expect(row.getAttribute("aria-label")).toBe(
      "농장 수확, 재배 중인 작물 없음, 대기",
    );
  });

  it("반복 활동은 오늘 진행률에서 제외하고 반복으로 표시한다", () => {
    render(
      <AdventureActivityChecklist
        defaultExpanded
        activities={[
          activities[1]!,
          {
            id: "arena_daily",
            group: "daily",
            tab: "battle",
            title: "아레나",
            detail: "오늘 1회 참여",
            href: "/battle/arena",
            state: "in_progress",
            countsTowardCompletion: false,
            enabled: true,
            defaultEnabled: true,
          },
        ]}
        summary={{ completed: 1, total: 1, actionableCount: 0 }}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(
      within(screen.getByTestId("checklist-groups")).getByRole("link", {
        name: /아레나/,
      }).textContent,
    ).toContain("반복");
  });
});

describe("오늘의 모험 체크 접기", () => {
  it("묶음마다 앞의 3개만 보이고 나머지는 펼쳐서 본다", () => {
    const daily: AdventureActivityView[] = Array.from({ length: 5 }, (_, index) => ({
      id: `daily_${index}`,
      group: "daily",
      tab: "battle",
      title: `일일 활동 ${index + 1}`,
      detail: "0 / 1",
      href: "/battle",
      state: "in_progress",
      current: 0,
      target: 1,
      enabled: true,
      defaultEnabled: true,
    }) as AdventureActivityView);
    render(
      <AdventureActivityChecklist
        defaultExpanded
        activities={daily}
        summary={{ completed: 0, total: 5, actionableCount: 0 }}
        serverNow={0}
        onRetry={vi.fn()}
      />,
    );

    const list = within(screen.getByTestId("checklist-groups"));
    expect(list.getAllByRole("link", { name: /일일 활동/ })).toHaveLength(3);
    const more = screen.getByRole("button", { name: "나머지 2개 보기" });
    expect(more.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(more);
    expect(list.getAllByRole("link", { name: /일일 활동/ })).toHaveLength(5);
    expect(screen.getByRole("button", { name: "접기" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("오늘의 모험 체크 정리된 모양", () => {
  const hunt: AdventureActivityView = {
    id: "daily_hunt",
    group: "daily",
    tab: "battle",
    title: "일일 사냥",
    detail: "12 / 30",
    href: "/battle/dungeon",
    state: "in_progress",
    current: 12,
    target: 30,
    enabled: true,
    defaultEnabled: true,
  };

  it("진행 중인 횟수 활동은 상태 배지 대신 진행 막대로 보여 준다", () => {
    render(
      <AdventureActivityChecklist
        defaultExpanded
        activities={[hunt]}
        summary={{ completed: 0, total: 1, actionableCount: 0 }}
        serverNow={0}
        onRetry={vi.fn()}
      />,
    );

    const row = within(screen.getByTestId("checklist-groups")).getByRole("link", {
      name: /일일 사냥/,
    });
    const bar = row.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("12");
    expect(bar?.getAttribute("aria-valuemax")).toBe("30");
    expect(row.textContent).not.toContain("진행 중");
    // 읽어 주는 문구에는 상태가 그대로 남는다.
    expect(row.getAttribute("aria-label")).toBe("일일 사냥, 12 / 30, 진행 중");
  });

  it("머리는 강조 색면 없이 제목과 진행도만 두고, 묶음을 상자 안의 상자로 감싸지 않는다", () => {
    render(
      <AdventureActivityChecklist
        defaultExpanded
        activities={[hunt, ...activities]}
        summary={{ completed: 1, total: 2, actionableCount: 1 }}
        serverNow={0}
        onRetry={vi.fn()}
      />,
    );

    const title = screen.getByRole("heading", { name: "오늘의 모험 체크" });
    expect(title.closest(".ui-surface-accent")).toBeNull();
    const groups = screen.getByTestId("checklist-groups");
    expect(groups.querySelector(".ui-surface-inset")).toBeNull();
    expect(groups.querySelectorAll("section")).toHaveLength(2);
  });
});

describe("오늘의 모험 타일", () => {
  const counted = (
    id: string,
    title: string,
    current: number,
    target: number,
    overrides: Partial<AdventureActivityView> = {},
  ): AdventureActivityView => ({
    id,
    group: "daily",
    tab: "battle",
    title,
    detail: `${current} / ${target}`,
    href: `/battle/${id}`,
    state: current >= target ? "completed" : "in_progress",
    current,
    target,
    enabled: true,
    defaultEnabled: true,
    ...overrides,
  });
  const farm = activities[0]!;

  function renderHome(list: AdventureActivityView[]) {
    render(
      <AdventureActivityChecklist
        activities={list}
        summary={{ completed: 1, total: 3, actionableCount: 1 }}
        serverNow={0}
        onRetry={vi.fn()}
      />,
    );
  }

  it("진행도를 채워 가는 활동을 앞에서부터 세 개까지 타일로 보여 준다", () => {
    renderHome([
      farm,
      counted("expedition", "원정", 3, 3),
      counted("hunt", "일일 사냥", 12, 30),
      counted("arena", "아레나", 2, 5, { group: "weekly" }),
      counted("tower", "숙련의 탑", 0, 1),
    ]);

    const tiles = within(screen.getByTestId("checklist-tiles")).getAllByRole(
      "link",
    );
    // 진행 중인 것이 먼저, 끝난 것은 뒤로 간다. 생활·길드 준비 항목은 타일에 넣지 않는다.
    expect(tiles.map((tile) => tile.getAttribute("href"))).toEqual([
      "/battle/hunt",
      "/battle/arena",
      "/battle/tower",
    ]);
    expect(tiles[0]?.textContent).toContain("일일 사냥");
    expect(tiles[0]?.textContent).toContain("12");
    expect(tiles[0]?.textContent).toContain("/ 30");
    expect(
      tiles[0]?.querySelector('[role="progressbar"]')?.getAttribute(
        "aria-valuenow",
      ),
    ).toBe("12");
    expect(tiles[1]?.textContent).toContain("주간");
  });

  it("끝난 활동의 타일은 진행 막대 대신 완료라고 적는다", () => {
    renderHome([counted("expedition", "원정", 3, 3)]);

    const tile = within(screen.getByTestId("checklist-tiles")).getByRole("link");
    expect(tile.textContent).toContain("완료");
    expect(tile.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("전체 목록은 접어 두고 전체 보기를 눌렀을 때 펼친다", () => {
    renderHome([farm, counted("hunt", "일일 사냥", 12, 30)]);

    expect(screen.queryByTestId("checklist-groups")).toBeNull();
    const toggle = screen.getByRole("button", { name: "전체 보기" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    expect(screen.getByTestId("checklist-groups")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "전체 접기" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("지금 할 수 있는 일이 여럿이면 첫 항목과 나머지 개수를 한 줄로 알린다", () => {
    renderHome([
      farm,
      { ...farm, id: "peddler_ready", title: "행상 수레", href: "/town/peddler" },
    ]);

    const summary = screen.getByTestId("actionable-summary");
    expect(summary.textContent).toContain("농장 수확 외 1개");
    expect(summary.getAttribute("href")).toBe("/town/farm");
  });

  it("지금 할 수 있는 일이 없으면 안내 줄을 만들지 않는다", () => {
    renderHome([counted("hunt", "일일 사냥", 12, 30)]);

    expect(screen.queryByTestId("actionable-summary")).toBeNull();
  });
});
