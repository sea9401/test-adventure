// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENHANCE_STONE_MATERIAL_ID,
  SUPERIOR_ENHANCE_STONE_MATERIAL_ID,
} from "@/adventure/data/v2/v2Enhance";
import { STAMINA_SHARD_MATERIAL_ID } from "@/adventure/data/v2/staminaPotionCrafting";
import {
  V2EnhanceView,
  effectiveEnhanceChoice,
  enhanceChoiceOptions,
} from "./V2EnhanceView";

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

const STONE_BUTTON = {
  red: /^붉은 강화석/,
  blue: /^푸른 강화석/,
  superior_red: /^상급 붉은 강화석/,
  superior_blue: /^상급 푸른 강화석/,
} as const;

async function openEnhancement(level: number, stone: keyof typeof STONE_BUTTON) {
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
      [SUPERIOR_ENHANCE_STONE_MATERIAL_ID.superior_red]: 321,
      [SUPERIOR_ENHANCE_STONE_MATERIAL_ID.superior_blue]: 654,
    } });
    return Response.json({ character: { gold: 1_000_000_000, bankedGold: 0 }, rareMaps: [] });
  }));
  render(<V2EnhanceView onBack={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: /철검/ }));
  fireEvent.click(screen.getByRole("button", { name: STONE_BUTTON[stone] }));
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
    fireEvent.click(screen.getByRole("button", { name: STONE_BUTTON.blue }));
    fireEvent.click(screen.getAllByRole("button", { name: /^강화 \(성공/ })[0]);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});

describe("상급 강화석 선택", () => {
  it("+13 도전부터 상급 강화석 두 종류가 보이고 골드만은 빠진다", () => {
    expect(enhanceChoiceOptions(11)).toEqual(["none", "blue", "red"]);
    expect(enhanceChoiceOptions(12)).toEqual([
      "blue",
      "red",
      "superior_blue",
      "superior_red",
    ]);
  });

  it("상급을 고른 채 +12 아래로 내려가면 같은 색 일반 강화석으로 돌아간다", () => {
    expect(effectiveEnhanceChoice(12, "superior_blue")).toBe("superior_blue");
    expect(effectiveEnhanceChoice(11, "superior_blue")).toBe("blue");
    expect(effectiveEnhanceChoice(11, "superior_red")).toBe("red");
    expect(effectiveEnhanceChoice(11, "none")).toBe("none");
  });

  it("+12 도전 화면에는 상급 강화석이 없다", async () => {
    await openEnhancement(11, "blue");
    expect(screen.queryByRole("button", { name: STONE_BUTTON.superior_blue })).toBeNull();
    expect(screen.queryByRole("button", { name: STONE_BUTTON.superior_red })).toBeNull();
  });

  it("상급 푸른 강화석 +13 도전은 파괴가 없어 확인 없이 요청한다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const posts = await openEnhancement(12, "superior_blue");
    const button = screen.getByRole("button", { name: STONE_BUTTON.superior_blue });
    expect(button.textContent).toContain("성공 10%");
    expect(button.textContent).not.toContain("파괴");
    expect(button.textContent).toContain("보유 654");
    expect(screen.getAllByText(/상급 푸른 강화석 ×7/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /^강화 \(성공/ })[0]);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(confirm).not.toHaveBeenCalled();
    expect(JSON.parse(posts[0].body as string)).toEqual({
      iid: "test-sword",
      stone: "superior_blue",
    });
  });

  it("상급 붉은 강화석은 파괴 확률을 확인한 뒤 요청한다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const posts = await openEnhancement(12, "superior_red");
    expect(
      screen.getByRole("button", { name: STONE_BUTTON.superior_red }).textContent,
    ).toContain("성공 30% · 파괴 22%");
    fireEvent.click(screen.getAllByRole("button", { name: /^강화 \(성공/ })[0]);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/\+12 → \+13[\s\S]*22%/));
    expect(JSON.parse(posts[0].body as string)).toMatchObject({ stone: "superior_red" });
  });
});

describe("대장간 조합 결과", () => {
  it("조합한 카드에서 결과를 바로 읽을 수 있다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/v2/me/stamina-potion-combine") return Response.json({ ok: true });
      if (url === "/api/v2/me/equipment") return Response.json({ owned: [], equipped: {} });
      if (url === "/api/v2/me/inventory") return Response.json({ materials: { [STAMINA_SHARD_MATERIAL_ID]: 12 } });
      return Response.json({ character: { gold: 1_000_000, bankedGold: 0 }, rareMaps: [] });
    }));
    render(<V2EnhanceView onBack={() => {}} initialMode="combine" />);

    const card = (await screen.findByText("스태미나 회복약")).closest(".ui-game-card");
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "1개 조합 →" }));

    expect(await within(card as HTMLElement).findByText(/활력의 파편 6개 → 스태미나 회복약 1개/)).toBeTruthy();
  });
});
