// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FishingShopPanel } from "./FishingShopPanel";
import type { DangerousFishingEnhanceRequest } from "./useDangerousFishingExchange";

const mocks = vi.hoisted(() => ({
  syncCoins: vi.fn(),
  refreshDangerousShop: vi.fn(async () => true),
  enhanceGear: vi.fn(async () => ({
    ok: true,
    message: "강화 완료",
    fishingCoins: 49_000,
    nextLevel: 1,
  })),
}));

vi.mock("./useFishingShop", () => ({
  useFishingShop: () => ({
    state: null,
    loading: false,
    error: null,
    buying: null,
    buy: vi.fn(),
    buyConsumable: vi.fn(),
    buyGear: vi.fn(),
    syncCoins: mocks.syncCoins,
  }),
}));

vi.mock("./useDangerousFishingShop", () => ({
  useDangerousFishingShop: () => ({
    model: null,
    loading: false,
    error: null,
    buying: null,
    refresh: mocks.refreshDangerousShop,
    shop: vi.fn(),
  }),
}));

vi.mock("./useDangerousFishingExchange", () => ({
  useDangerousFishingExchange: () => ({
    model: null,
    loading: false,
    error: null,
    exchanging: null,
    sellingCatch: null,
    refresh: vi.fn(),
    exchange: vi.fn(),
    enhanceGear: mocks.enhanceGear,
    sellCatch: vi.fn(),
  }),
}));

vi.mock("./FishingShopView", () => ({
  FishingShopView: ({
    dangerousShop,
  }: {
    dangerousShop: {
      exchange: {
        onEnhanceGear: (
          request: DangerousFishingEnhanceRequest,
        ) => Promise<unknown>;
      };
    };
  }) => (
    <button
      type="button"
      onClick={() => void dangerousShop.exchange.onEnhanceGear({
        operationId: "9b94903e-3876-4391-b551-4cf24d553775",
        gearKind: "rod",
        gearId: "starter_rod",
        expectedCurrentLevel: 0,
        expectedNextLevel: 1,
      })}
    >
      강화 실행
    </button>
  ),
}));

describe("FishingShopPanel 위험 해역 강화 연결", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("성공한 강화의 권위 코인을 일반 상점에 동기화하고 위험 상점도 새로고침한다", async () => {
    render(<FishingShopPanel />);

    fireEvent.click(screen.getByRole("button", { name: "강화 실행" }));

    await waitFor(() => expect(mocks.syncCoins).toHaveBeenCalledWith(49_000));
    expect(mocks.refreshDangerousShop).toHaveBeenCalledOnce();
  });
});
