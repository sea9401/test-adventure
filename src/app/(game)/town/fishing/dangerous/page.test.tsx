import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DangerousFishingPage from "./page";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  onBack: null as (() => void) | null,
  onOpenFishing: null as (() => void) | null,
  onOpenChallenges: null as (() => void) | null,
  onOpenLeaderboard: null as (() => void) | null,
  onOpenHallOfFame: null as (() => void) | null,
  onOpenShop: null as (() => void) | null,
  verification: null as unknown,
  verifyHuman: null as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/adventure/v2/DangerousFishingView", () => ({
  DangerousFishingView: ({
    onBack,
    onOpenFishing,
    onOpenChallenges,
    onOpenLeaderboard,
    onOpenHallOfFame,
    onOpenShop,
    verification,
    verifyHuman,
  }: {
    onBack: () => void;
    onOpenFishing: () => void;
    onOpenChallenges: () => void;
    onOpenLeaderboard: () => void;
    onOpenHallOfFame: () => void;
    onOpenShop: () => void;
    verification: unknown;
    verifyHuman: unknown;
  }) => {
    mocks.onBack = onBack;
    mocks.onOpenFishing = onOpenFishing;
    mocks.onOpenChallenges = onOpenChallenges;
    mocks.onOpenLeaderboard = onOpenLeaderboard;
    mocks.onOpenHallOfFame = onOpenHallOfFame;
    mocks.onOpenShop = onOpenShop;
    mocks.verification = verification;
    mocks.verifyHuman = verifyHuman;
    return <div>위험 해역 화면</div>;
  },
}));

vi.mock("@/adventure/v2/useDangerousFishing", () => ({
  useDangerousFishing: () => {
    const verifyHuman = vi.fn(async () => true);
    return {
      model: null,
      loading: true,
      busy: null,
      error: null,
      verification: {
        activity: "fishing",
        siteKey: "turnstile-site-key",
        captchaSiteKey: null,
        reason: "volume",
        manualTest: true,
      },
      verifyHuman,
    };
  },
}));

describe("DangerousFishingPage", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.onBack = null;
    mocks.onOpenFishing = null;
    mocks.onOpenChallenges = null;
    mocks.onOpenLeaderboard = null;
    mocks.onOpenHallOfFame = null;
    mocks.onOpenShop = null;
    mocks.verification = null;
    mocks.verifyHuman = null;
  });

  it("별도 위험 해역 화면과 기존 낚시 이동 경로를 연결한다", () => {
    expect(renderToStaticMarkup(<DangerousFishingPage />)).toContain(
      "위험 해역 화면",
    );
    mocks.onBack?.();
    expect(mocks.push).toHaveBeenCalledWith("/map");
    mocks.onOpenFishing?.();
    expect(mocks.push).toHaveBeenCalledWith("/town/fishing");
    mocks.onOpenChallenges?.();
    expect(mocks.push).toHaveBeenCalledWith("/town/fishing/challenges");
    mocks.onOpenLeaderboard?.();
    expect(mocks.push).toHaveBeenCalledWith("/town/fishing/leaderboard");
    mocks.onOpenHallOfFame?.();
    expect(mocks.push).toHaveBeenCalledWith("/town/fishing/hall-of-fame");
    mocks.onOpenShop?.();
    expect(mocks.push).toHaveBeenCalledWith("/town/fishing/shop?tab=dangerous");
    expect(mocks.verification).toMatchObject({
      activity: "fishing",
      siteKey: "turnstile-site-key",
    });
    expect(mocks.verifyHuman).toBeTypeOf("function");
  });
});
