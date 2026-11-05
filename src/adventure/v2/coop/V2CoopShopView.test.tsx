// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COOP_COIN_MATERIAL_ID } from "@/adventure/data/v2/coopRewards";
import { V2CoopShopView } from "./V2CoopShopView";

const applyResourcePatch = vi.hoisted(() => vi.fn());
vi.mock("@/adventure/v2/GameStateProvider", () => ({
  useGameResourceState: () => ({ applyResourcePatch }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function serveShop(coins: number) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? Response.json({
          ok: true,
          materials: { [COOP_COIN_MATERIAL_ID]: coins - 25 * 30 },
          limits: {
            stamina_potion: { scope: "weekly", used: 30, limit: 30 },
          },
          staminaPotions: 30,
        })
      : Response.json({
          ok: true,
          materials: { [COOP_COIN_MATERIAL_ID]: coins },
          ownedTitleIds: [],
          staminaPotions: 0,
          limits: {
            stamina_potion: { scope: "weekly", used: 0, limit: 30 },
          },
        }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("V2CoopShopView 수량 교환", () => {
  it("최대를 고르면 합계 비용을 보여 주고 요청 한 번으로 30개를 교환한다", async () => {
    const fetchMock = serveShop(5_000);
    render(<V2CoopShopView embedded />);

    const input = await screen.findByLabelText("스태미나 회복약 수량");
    const row = input.closest("li, div.flex.items-center.gap-3") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "최대 30개" }));
    expect(within(row).getByText(/750/)).toBeTruthy();

    fireEvent.click(within(row).getByRole("button", { name: "교환" }));

    await screen.findByText("30개 교환했다.");
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
      itemId: "stamina_potion",
      quantity: 30,
    });
    await waitFor(() =>
      expect(screen.queryByLabelText("스태미나 회복약 수량")).toBeNull(),
    );
  });

  it("칭호에는 수량 입력칸이 없다", async () => {
    serveShop(100_000);
    render(<V2CoopShopView embedded />);

    await screen.findByLabelText("스태미나 회복약 수량");
    expect(screen.queryByLabelText("협동의 손 수량")).toBeNull();
  });
});
