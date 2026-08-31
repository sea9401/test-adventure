import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FishingChallengesPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  onOpenDangerous: null as (() => void) | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/adventure/v2/FishingDailyChallengePanel", () => ({
  FishingDailyChallengePanel: ({
    onOpenDangerous,
  }: {
    onOpenDangerous?: () => void;
  }) => {
    mocks.onOpenDangerous = onOpenDangerous ?? null;
    return <div>낚시 의뢰 화면</div>;
  },
}));

describe("FishingChallengesPage", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.onOpenDangerous = null;
  });

  it("위험 해역 이동 경로를 연결한다", () => {
    renderToStaticMarkup(<FishingChallengesPage />);
    mocks.onOpenDangerous?.();
    expect(mocks.push).toHaveBeenCalledWith("/town/fishing/dangerous");
  });
});
