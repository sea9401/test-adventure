// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUILD_WORKSHOP_RECIPES,
  guildWorkshopRecipeView,
} from "@/adventure/data/v2/guildWorkshop";
import {
  GameResourceContext,
  type GameResourceState,
} from "../GameResourceContext";
import { GuildWorkshopPanel } from "./GuildWorkshopPanel";

const recipe = GUILD_WORKSHOP_RECIPES.crafted_oathblade;

function workshopResponse() {
  return {
    ok: true,
    hasGuildSmithy: true,
    spendableGold: 1_000_000,
    resources: {},
    materials: {},
    favoriteRecipeIds: [],
    recipes: [
      {
        ...guildWorkshopRecipeView(recipe, {}),
        craftOnly: true,
        canCraft: true,
        levelOk: true,
        smithyLevelOk: true,
      },
    ],
  };
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("제작소 메인 추천 제작", () => {
  it("추천 제작을 눌러도 메인 화면을 유지하고 제작 결과를 보여 준다", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v2/guild/workshop" && init?.method === "POST") {
        return json({ ok: true, iid: "crafted-1", craftQuality: { level: 0 } });
      }
      if (url === "/api/v2/guild/workshop") return json(workshopResponse());
      if (url === "/api/v2/me/equipment-codex") return json({ registeredIds: [] });
      return json({ ok: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GameResourceContext.Provider
        value={{ setGold: vi.fn(), setBankedGold: vi.fn() } as unknown as GameResourceState}
      >
        <GuildWorkshopPanel info={null} localSmithy />
      </GameResourceContext.Provider>,
    );

    const button = await screen.findByRole<HTMLButtonElement>("button", {
      name: "추천 제작",
    });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);

    await screen.findByRole("dialog");
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url) === "/api/v2/guild/workshop" && init?.method === "POST",
      ),
    ).toBe(true);
    expect(screen.queryByText("추천 행동")).not.toBeNull();
    expect(screen.queryByText("제작 세트")).toBeNull();
  });
});
