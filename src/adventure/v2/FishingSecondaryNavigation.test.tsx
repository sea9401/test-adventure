import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FishingDailyChallengePanel } from "./FishingDailyChallengePanel";
import { FishingHallOfFamePanel } from "./FishingHallOfFamePanel";
import { FishingLeaderboardPanel } from "./FishingLeaderboardPanel";

vi.mock("./useFishingDailyChallenge", () => ({
  useFishingDailyChallenge: () => ({
    state: null,
    loading: true,
    error: null,
    claiming: null,
    claim: vi.fn(),
  }),
}));

vi.mock("./useFishingLeaderboard", () => ({
  useFishingLeaderboard: () => ({
    data: null,
    loading: true,
    error: null,
  }),
}));

vi.mock("./useFishingHallOfFame", () => ({
  useFishingHallOfFame: () => ({
    data: null,
    loading: true,
    error: null,
  }),
}));

describe("낚시 보조 화면 내비게이션", () => {
  const onBack = vi.fn();
  const onOpenDangerous = vi.fn();

  it.each([
    [
      "의뢰",
      <FishingDailyChallengePanel
        key="challenges"
        onBack={onBack}
        onOpenDangerous={onOpenDangerous}
      />,
    ],
    [
      "주간 순위",
      <FishingLeaderboardPanel
        key="leaderboard"
        onBack={onBack}
        onOpenDangerous={onOpenDangerous}
      />,
    ],
    [
      "명예의 전당",
      <FishingHallOfFamePanel
        key="hall-of-fame"
        onBack={onBack}
        onOpenDangerous={onOpenDangerous}
      />,
    ],
  ])("%s 화면에서도 위험 해역 탭을 표시한다", (_name, panel) => {
    expect(renderToStaticMarkup(panel)).toContain("위험 해역");
  });
});
