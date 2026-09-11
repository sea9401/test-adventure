// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import { V2EnhanceView } from "./V2EnhanceView";

const context = vi.hoisted(() => ({
  coreLoopOn: true,
  frontierDepth: 42,
  setBankedGold: vi.fn(),
  refreshGameState: vi.fn(),
}));
vi.mock("./GameStateProvider", () => ({
  useGameState: () => context,
  useEquipmentCodexContext: () => ({ loaded: false, registeredIds: new Set() }),
}));
vi.mock("./RewardToastProvider", () => ({
  useSystemToast: () => ({ notifySystem: notify }),
}));
const notify = vi.fn();

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openEnhancement(level: number, stone: "red" | "blue") {
  const posts: RequestInit[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/v2/me/enhance") {
      posts.push(init!);
      return Response.json({ ok: true, outcome: "keep" });
    }
    if (url === "/api/v2/me/equipment") return Response.json({
      owned: [{ iid: "test-sword", id: "v2_iron_sword", enhance: { level, bonusPct: 0 } }],
      equipped: {},
    });
    if (url === "/api/v2/me/inventory") return Response.json({ materials: {
      [ENHANCE_STONE_MATERIAL_ID.red]: 10000,
      [ENHANCE_STONE_MATERIAL_ID.blue]: 10000,
    } });
    return Response.json({ character: { gold: 1_000_000_000, bankedGold: 0 }, rareMaps: [] });
  }));
  render(<V2EnhanceView onBack={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: /철검/ }));
  fireEvent.click(screen.getByRole("button", { name: stone === "red" ? /붉은 강화석/ : /푸른 강화석/ }));
  return posts;
}

describe("파괴 위험 강화 확인", () => {
  it.each([0, 1])("PC·모바일 버튼 %i에서 취소하면 강화 요청을 보내지 않는다", async (index) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const posts = await openEnhancement(7, "red");
    fireEvent.click(screen.getAllByRole("button", { name: /^강화 \(성공/ })[index]);
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/철검[\s\S]*\+7 → \+8[\s\S]*5%/));
    expect(posts).toHaveLength(0);
  });

  it.each([[6, "red"], [11, "blue"]] as const)("+%i %s 안전 단계는 확인 없이 강화한다", async (level, stone) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const posts = await openEnhancement(level, stone);
    fireEvent.click(screen.getAllByRole("button", { name: /^강화 \(성공/ })[0]);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("푸른 돌 +13 도전은 실제 파괴 확률을 확인한 뒤 한 번 요청한다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const posts = await openEnhancement(12, "blue");
    fireEvent.click(screen.getAllByRole("button", { name: /^강화 \(성공/ })[1]);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/\+12 → \+13[\s\S]*12%/));
    expect(JSON.parse(posts[0].body as string)).toEqual({ iid: "test-sword", stone: "blue" });
  });

  it("취소 후 재시도마다 확인하고 푸른 돌로 바꾸면 파괴 위험 없이 진행한다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const posts = await openEnhancement(7, "red");
    for (let attempt = 0; attempt < 2; attempt++) {
      fireEvent.click(screen.getAllByRole("button", { name: /^강화 \(성공/ })[0]);
    }
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /푸른 강화석/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /^강화 \(성공/ })[0]);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
