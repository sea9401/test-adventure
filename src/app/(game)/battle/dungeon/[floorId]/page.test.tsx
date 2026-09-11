// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  query: "rareMap=rare-map-1",
  push: vi.fn(),
  replace: vi.fn(),
}));

const gameState = vi.hoisted(() => ({
  setStamina: vi.fn(),
  setHp: vi.fn(),
  setMp: vi.fn(),
  setFrontierDepth: vi.fn(),
  refreshGameState: vi.fn(async () => undefined),
  applyResourcePatch: vi.fn(),
  setCombatCooldown: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  useParams: () => ({ floorId: "10" }),
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

vi.mock("@/adventure/v2/GameStateProvider", () => ({
  useGameState: () => ({
    currentOutpost: { id: "outpost-1", name: "마른 협곡 거점" },
    viewerName: "모험가",
    viewerGender: "male",
    viewerLevel: 50,
    viewerLevelCap: 100,
    viewerJobTier: 3,
    viewerClass: "warrior",
    viewerExp: 10,
    viewerExpToNext: 100,
    playerSubtitle: "Lv.50 · 검사",
    viewerProficiency: 0,
    stamina: { current: 100, lastUpdatedAt: Date.now() },
    staminaMax: 100,
    adventureSupportActive: false,
    adventureSupportTier: "none",
    setStamina: gameState.setStamina,
    hpCharges: 0,
    mpCharges: 0,
    hp: { hp: 100, maxHp: 100, anchorMs: Date.now() },
    setHp: gameState.setHp,
    mp: { mp: 50, maxMp: 50 },
    setMp: gameState.setMp,
    playerCombat: null,
    frontierDepth: 10,
    setFrontierDepth: gameState.setFrontierDepth,
    refreshGameState: gameState.refreshGameState,
    applyResourcePatch: gameState.applyResourcePatch,
    gameStateLoaded: true,
    combatCooldown: null,
    setCombatCooldown: gameState.setCombatCooldown,
    offlineHunt: null,
  }),
}));

vi.mock("@/adventure/storyFlags/useStoryFlags", () => ({
  useStoryFlags: () => ({ state: { flags: [] }, set: vi.fn() }),
}));

vi.mock("@/adventure/v2/autoHuntStopConditions", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/v2/autoHuntStopConditions")>();
  return {
    ...actual,
    useAutoHuntStopConfig: () => ({
      config: actual.DEFAULT_AUTO_HUNT_STOP_CONFIG,
      configRef: { current: actual.DEFAULT_AUTO_HUNT_STOP_CONFIG },
      updateConfig: vi.fn(),
    }),
  };
});

import DungeonFloorPage from "./page";

const fetchMock = vi.fn();

describe("희귀 탐사에서 일반 사냥 복귀", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    navigation.query = "rareMap=rare-map-1";
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/v2/me/rare-maps") {
        return Promise.resolve(
          Response.json({
            ok: true,
            rareMaps: [
              {
                iid: "rare-map-1",
                kind: "worn_map",
                depth: 10,
                runsLeft: 30,
                foundAt: Date.now(),
              },
            ],
            serverNow: Date.now(),
          }),
        );
      }
      if (url === "/api/v2/dungeon/hunt") {
        return new Promise<Response>(() => {});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("희귀 탐사 요청 중 일반 사냥으로 돌아와도 새 사냥을 시작할 수 있다", async () => {
    const view = render(<DungeonFloorPage />);
    const rareHuntButton = await screen.findByRole("button", {
      name: "희귀 탐사 시작",
    });

    fireEvent.click(rareHuntButton);
    await waitFor(() => expect(rareHuntButton.getAttribute("disabled")).not.toBeNull());

    navigation.query = "";
    view.rerender(<DungeonFloorPage />);

    const normalHuntButton = screen.getByRole("button", { name: /^사냥/ });
    expect(normalHuntButton.getAttribute("disabled")).toBeNull();

    fireEvent.click(normalHuntButton);
    await waitFor(() => {
      const huntRequests = fetchMock.mock.calls.filter(
        ([input]) => input === "/api/v2/dungeon/hunt",
      );
      expect(huntRequests).toHaveLength(2);
    });
  });
});
