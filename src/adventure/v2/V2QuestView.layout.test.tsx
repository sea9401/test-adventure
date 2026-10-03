// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
vi.mock("./AdventureDashboardProvider", () => ({
  useAdventureDashboard: () => ({ refresh: async () => undefined }),
}));
vi.mock("./GameStateRefreshContext", () => ({ useRefreshGameState: () => vi.fn() }));
vi.mock("./RewardToastProvider", () => ({
  useRewardToast: () => ({ notifyReward: vi.fn(), notifySystem: vi.fn() }),
}));

import { V2QuestView } from "./V2QuestView";

const bundle = (scope: "daily" | "weekly") => ({
  scope,
  completed: 0,
  total: 4,
  goal: 4,
  potions: 1,
  claimed: false,
  claimable: false,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function serveQuests() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/v2/me/quests"
        ? Response.json({
            ok: true,
            lines: [],
            quests: [],
            repeat: {
              daily: [],
              weekly: [],
              dailyResetAt: Date.now() + 3_600_000,
              weeklyResetAt: Date.now() + 86_400_000,
              dailyBundle: bundle("daily"),
              weeklyBundle: bundle("weekly"),
            },
            achievementSummary: { score: 10, completed: 1, total: 40, maxScore: 400 },
          })
        : Response.json({ ok: false }),
    ),
  );
}

describe("퀘스트 PC 2단", () => {
  it("일일 탭은 왼쪽에 마일스톤 보상, 오른쪽에 퀘스트 목록을 둔다", async () => {
    serveQuests();
    const { container } = render(<V2QuestView onBack={vi.fn()} />);

    await screen.findByText("일일 마일스톤");
    expect(screen.getByRole("tablist", { name: "퀘스트 분류" }).parentElement?.className).toContain("backdrop-blur");
    const aside = container.querySelector("aside");
    expect(aside?.textContent).toContain("일일 마일스톤");
    expect(container.querySelector("aside + div")?.textContent).toContain("일일 퀘스트");
  });

  it("업적 탭은 왼쪽에 업적 점수와 진행 중/완료 탭, 모두 받기를 두고 따라오게 한다", async () => {
    serveQuests();
    const { container } = render(<V2QuestView onBack={vi.fn()} />);

    await screen.findByText("일일 마일스톤");
    fireEvent.click(screen.getByRole("tab", { name: /업적/ }));
    const aside = container.querySelector("aside");
    expect(aside?.textContent).toContain("업적 점수");
    expect(aside?.querySelector('[role="tablist"]')).toBeTruthy();
    expect(aside?.textContent).toContain("모두 받기");
    // 업적 탭 왼쪽 칸은 짧아서 긴 목록을 내리는 동안 따라온다(튜토리얼은 성장 미션이 길어 고정하지 않음).
    expect(aside?.className).toContain("lg:sticky");
  });
});
