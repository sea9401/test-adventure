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
  readJson: null as unknown,
  onRealtimeFinish: null as unknown,
  onStartEncounter: null as unknown,
  onAction: null as unknown,
  onStartBossAttempt: null as unknown,
  onBossAction: null as unknown,
  startEncounter: vi.fn(async () => true),
  act: vi.fn(async () => true),
  startBossAttempt: vi.fn(async () => true),
  actOnBoss: vi.fn(async () => true),
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
    readJson,
    onRealtimeFinish,
    onStartEncounter,
    onAction,
    onStartBossAttempt,
    onBossAction,
  }: {
    onBack: () => void;
    onOpenFishing: () => void;
    onOpenChallenges: () => void;
    onOpenLeaderboard: () => void;
    onOpenHallOfFame: () => void;
    onOpenShop: () => void;
    verification: unknown;
    verifyHuman: unknown;
    readJson: unknown;
    onRealtimeFinish: unknown;
    onStartEncounter: unknown;
    onAction: unknown;
    onStartBossAttempt: unknown;
    onBossAction: unknown;
  }) => {
    mocks.onBack = onBack;
    mocks.onOpenFishing = onOpenFishing;
    mocks.onOpenChallenges = onOpenChallenges;
    mocks.onOpenLeaderboard = onOpenLeaderboard;
    mocks.onOpenHallOfFame = onOpenHallOfFame;
    mocks.onOpenShop = onOpenShop;
    mocks.verification = verification;
    mocks.verifyHuman = verifyHuman;
    mocks.readJson = readJson;
    mocks.onRealtimeFinish = onRealtimeFinish;
    mocks.onStartEncounter = onStartEncounter;
    mocks.onAction = onAction;
    mocks.onStartBossAttempt = onStartBossAttempt;
    mocks.onBossAction = onBossAction;
    return <div>위험 해역 화면</div>;
  },
}));

vi.mock("@/adventure/v2/useDangerousFishing", () => ({
  useDangerousFishing: () => {
    const verifyHuman = vi.fn(async () => true);
    const readJson = vi.fn(async (response: Response) => response.json());
    const handleRealtimeFinish = vi.fn();
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
      readJson,
      handleRealtimeFinish,
      startEncounter: mocks.startEncounter,
      act: mocks.act,
      startBossAttempt: mocks.startBossAttempt,
      actOnBoss: mocks.actOnBoss,
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
    mocks.readJson = null;
    mocks.onRealtimeFinish = null;
    mocks.onStartEncounter = null;
    mocks.onAction = null;
    mocks.onStartBossAttempt = null;
    mocks.onBossAction = null;
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
    expect(mocks.readJson).toBeTypeOf("function");
    expect(mocks.onRealtimeFinish).toBeTypeOf("function");
    expect(mocks.onStartEncounter).toBe(mocks.startEncounter);
    expect(mocks.onAction).toBe(mocks.act);
    expect(mocks.onStartBossAttempt).toBe(mocks.startBossAttempt);
    expect(mocks.onBossAction).toBe(mocks.actOnBoss);
  });
});
