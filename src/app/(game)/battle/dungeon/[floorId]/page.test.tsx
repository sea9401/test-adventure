// @vitest-environment jsdom

import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  query: "rareMap=rare-map-1",
  floorId: "10",
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
  useParams: () => ({ floorId: navigation.floorId }),
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
import DungeonLayout from "../layout";

function pageTree() {
  return <StrictMode><DungeonLayout><DungeonFloorPage key={navigation.floorId} /></DungeonLayout></StrictMode>;
}

const fetchMock = vi.fn();

describe("희귀 탐사에서 일반 사냥 복귀", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    navigation.query = "rareMap=rare-map-1";
    navigation.floorId = "10";
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

  it.each(["9", "10"])("깊이 %s 희귀 결과를 일반 사냥에 유지하고 선택 횟수로 이어간다", async (rareDepth) => {
    navigation.floorId = rareDepth;
    localStorage.setItem("v2-hunt-count.v1", "5");
    const originalFetch = fetchMock.getMockImplementation()!;
    const normalRequests: Record<string, unknown>[] = [];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/v2/dungeon/hunt" && JSON.parse(String(init?.body)).rareMap) {
        const body = JSON.parse(String(init?.body));
        expect(body.rareMap).toBe("rare-map-1");
        return Promise.resolve(Response.json({ ok: true, result: {
          floor: Number(rareDepth), enemyName: "희귀 결과 몬스터", won: true,
          expGained: 150, goldGained: 90, levelsGained: 0, turns: 1,
          hpBefore: 100, hpAfter: 95, maxHp: 100, rareMapRunsLeft: 0,
          replay: { enemy: { name: "희귀 결과 몬스터", hp: 50 }, playerMaxHp: 100, playerMaxMp: 50, log: [] },
        } }));
      }
      if (input === "/api/v2/dungeon/hunt") {
        normalRequests.push(JSON.parse(String(init?.body)));
        return Promise.resolve(Response.json({ ok: true, batch: {
          attempted: 5, completed: 5, wins: 5, losses: 0,
          totalExp: 25, totalProficiency: 0, proficiencyPointsAfter: 0,
          totalGold: 15, totalGoldGross: 15, totalGoldTaxed: 0, totalLossTax: 0,
          levelsGained: 0, statGains: {}, hpGained: 0, mpGained: 0,
          drops: {}, droppedEquipments: [], droppedUniques: [], stoppedReason: null,
          finalHpAfter: 90, finalMaxHp: 100, finalMpAfter: 50,
          finalGoldAfter: 105, finalMaxDepth: 10, expAfter: 35, maxExpAfter: 100,
          finalLevelAfter: 50, finalMaxMp: 50, replays: [],
        } }));
      }
      return originalFetch(input, init);
    });
    const view = render(pageTree());
    fireEvent.click(await screen.findByRole("button", { name: "희귀 탐사 시작" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/battle/dungeon/10"));
    navigation.floorId = "10";
    navigation.query = "";
    view.rerender(pageTree());

    const result = screen.getByRole("region", { name: "최근 사냥 결과" });
    expect(within(result).getByText("+150")).toBeTruthy();
    expect(within(result).getByText("+90")).toBeTruthy();
    expect(within(result).getByRole("button", { name: "전투 기록 보기" })).toBeTruthy();
    const normalHunt = screen.getByRole("button", { name: "5회 사냥 (스태미너 5)" });
    expect(normalHunt.getAttribute("disabled")).toBeNull();
    fireEvent.click(normalHunt);
    await waitFor(() => expect(normalRequests).toHaveLength(1));
    expect(normalRequests[0]).toMatchObject({ floor: 10, count: 5 });
    expect(normalRequests[0]).not.toHaveProperty("rareMap");
    await waitFor(() => expect(within(screen.getByRole("region", { name: "최근 사냥 결과" })).queryByText("+150")).toBeNull());
    expect(screen.getByRole("region", { name: "최근 사냥 결과" })).toBeTruthy();

    navigation.floorId = "8";
    view.rerender(pageTree());
    navigation.floorId = "10";
    view.rerender(pageTree());
    expect(screen.queryByRole("region", { name: "최근 사냥 결과" })).toBeNull();
  });

  it("희귀 탐사 요청 중 일반 사냥으로 돌아와도 새 사냥을 시작할 수 있다", async () => {
    const view = render(pageTree());
    const rareHuntButton = await screen.findByRole("button", {
      name: "희귀 탐사 시작",
    });

    fireEvent.click(rareHuntButton);
    await waitFor(() => expect(rareHuntButton.getAttribute("disabled")).not.toBeNull());

    navigation.query = "";
    view.rerender(pageTree());

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
