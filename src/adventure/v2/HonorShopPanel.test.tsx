// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HonorShopPanel from "./HonorShopPanel";

const mocks = vi.hoisted(() => ({
  applyResourcePatch: vi.fn(),
  notifySystem: vi.fn(),
}));

vi.mock("@/adventure/v2/GameStateProvider", () => ({
  useGameResourceState: () => ({ applyResourcePatch: mocks.applyResourcePatch }),
}));
vi.mock("./RewardToastProvider", () => ({
  useSystemToast: () => ({ notifySystem: mocks.notifySystem }),
}));

const items = [
  { id: "stamina_potion", name: "스태미나 회복약", cost: 100, grantKind: "stamina_potion", targetId: "stamina_potion", quantity: 1 },
  { id: "v2_craft_refined_iron", name: "정제 철괴", cost: 10, grantKind: "material", targetId: "v2_craft_refined_iron", quantity: 1 },
  { id: "v2_craft_mithril_shard", name: "미스릴 조각", cost: 20, grantKind: "material", targetId: "v2_craft_mithril_shard", quantity: 1 },
  { id: "v2_craft_sunstone", name: "태양석", cost: 40, grantKind: "material", targetId: "v2_craft_sunstone", quantity: 1 },
  { id: "v2_craft_aurora_crystal", name: "오로라 결정", cost: 50, grantKind: "material", targetId: "v2_craft_aurora_crystal", quantity: 1 },
  { id: "v2_craft_abyssal_starsteel", name: "심해성철", cost: 70, grantKind: "material", targetId: "v2_craft_abyssal_starsteel", quantity: 1 },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("HonorShopPanel", () => {
  it("스태미나 회복약과 제작 재료 5종의 명성 가격을 같은 목록에 표시한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, honor: 500, honorEarned: 900, items }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ));

    render(<HonorShopPanel />);

    await waitFor(() => expect(screen.getByText("태양석")).toBeTruthy());
    for (const item of items) {
      const row = screen.getByText(item.name).closest<HTMLElement>("div.flex.items-center.justify-between");
      expect(row).toBeTruthy();
      expect(within(row!).getByText(`명성 ${item.cost}`)).toBeTruthy();
    }
  });

  it("구매 성공 알림은 선택한 실제 품목명과 수량을 사용한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, honor: 500, honorEarned: 900, items }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ok: true,
          honor: 460,
          honorEarned: 900,
          granted: {
            itemId: "v2_craft_sunstone",
            name: "태양석",
            kind: "material",
            targetId: "v2_craft_sunstone",
            quantity: 1,
          },
          materials: { v2_craft_sunstone: 3 },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<HonorShopPanel />);

    const itemName = await screen.findByText("태양석");
    const row = itemName.closest<HTMLElement>("div.flex.items-center.justify-between")!;
    fireEvent.click(within(row).getByRole("button", { name: "구매" }));

    await waitFor(() => {
      expect(mocks.notifySystem).toHaveBeenCalledWith("✓ 구매 완료 — 태양석 +1");
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v2/me/honor-shop",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ itemId: "v2_craft_sunstone" }),
      }),
    );
    expect(mocks.applyResourcePatch).not.toHaveBeenCalled();
  });
});
