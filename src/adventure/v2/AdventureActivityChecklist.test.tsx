// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
        activities={activities}
        summary={{ completed: 1, total: 1, actionableCount: 1 }}
        serverNow={Date.UTC(2026, 7, 24, 9, 30)}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("1 / 1 완료")).toBeTruthy();
    expect(screen.getByText("초기화까지 5시간 30분")).toBeTruthy();
    expect(screen.getByTestId("actionable-summary").textContent).toContain(
      "지금 가능한 행동 1개",
    );
    expect(screen.getByTestId("checklist-groups").className).toContain(
      "sm:grid-cols-2",
    );
    expect(document.querySelector("details")).toBeNull();
    expect(
      screen.getByRole("link", { name: /농장 수확/ }).getAttribute("href"),
    ).toBe("/town/farm");
    expect(screen.getByRole("link", { name: /농장 수확/ }).textContent).toContain(
      "수확",
    );
  });

  it("조회 실패는 다른 홈 콘텐츠를 막지 않고 재시도만 제공한다", () => {
    const onRetry = vi.fn();
    render(
      <AdventureActivityChecklist
        activities={[]}
        summary={{ completed: 0, total: 0, actionableCount: 0 }}
        error="활동 상태를 불러오지 못했습니다."
        onRetry={onRetry}
      />,
    );
    const retry = screen.getByRole("button", { name: "다시 시도" });
    expect(retry.className).toContain("bg-violet-50");
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("반복 활동은 오늘 진행률에서 제외하고 반복으로 표시한다", () => {
    render(
      <AdventureActivityChecklist
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
    expect(screen.getByRole("link", { name: /아레나/ }).textContent).toContain(
      "반복",
    );
  });
});
