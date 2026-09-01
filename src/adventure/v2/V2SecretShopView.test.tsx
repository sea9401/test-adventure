// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CHARGE } from "@/lib/v2-charge-config";
import { SecretShopAccessNote, V2SecretShopView } from "./V2SecretShopView";

const gameStateMocks = vi.hoisted(() => ({
  applyResourcePatch: vi.fn(),
  refreshGameState: vi.fn(async () => undefined),
}));

vi.mock("./GameStateProvider", () => ({
  useGameState: () => ({
    coreLoopOn: false,
    applyResourcePatch: gameStateMocks.applyResourcePatch,
    refreshGameState: gameStateMocks.refreshGameState,
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  gameStateMocks.applyResourcePatch.mockClear();
  gameStateMocks.refreshGameState.mockClear();
});

describe("비밀 상점 이용 시간 안내", () => {
  it("기존 개방 안내 뒤에 실제 남은 시간을 표시한다", () => {
    const html = renderToStaticMarkup(
      <SecretShopAccessNote remainingMs={24 * 60_000 + 8_000} />,
    );

    expect(html).toContain(
      "품목당 1회 구매 · 비밀 상점 지도는 발견 후 30분 동안 개방 · 남은 시간 24:08",
    );
  });
});

describe("비밀 상점 구매 자원 동기화", () => {
  it("HP 충전약 완충 결과를 전역 충전량에 즉시 반영한다", async () => {
    const stock = [
      {
        id: "hp_charge_pack",
        name: "HP 충전약 완충",
        desc: "보유 한도까지 가득 채운다.",
        price: 2_500_000,
        bought: false,
      },
    ];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Response.json({
          ok: true,
          itemId: "hp_charge_pack",
          map: "rm-shop",
          gold: 500_000,
          hpCharges: MAX_CHARGE,
          mapCompleted: false,
        });
      }
      return Response.json({
        ok: true,
        map: "rm-shop",
        serverNow: 1_000_000,
        expiresAt: 2_800_000,
        gold: 3_000_000,
        stock,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<V2SecretShopView mapIid="rm-shop" onBack={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "2,500,000 G" }),
    );

    await waitFor(() =>
      expect(gameStateMocks.applyResourcePatch).toHaveBeenCalledWith(
        expect.objectContaining({ hpCharges: MAX_CHARGE }),
      ),
    );
  });
});
