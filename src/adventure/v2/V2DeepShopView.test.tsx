// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ notifySystem: vi.fn(), refresh: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./GameStateRefreshContext", () => ({ useRefreshGameState: () => mocks.refresh }));
vi.mock("@/adventure/v2/RewardToastProvider", () => ({ useSystemToast: () => ({ notifySystem: mocks.notifySystem }) }));

import { DEEP_SHOP_ENTRIES } from "./deepShop";
import { V2DeepShopView } from "./V2DeepShopView";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function shopBody(tokens: number, gold: number, purchased: Record<string, number> = {}) {
  return {
    ok: true, tokens, weekKey: "2026-11-16", gold, bankedGold: 0,
    entries: DEEP_SHOP_ENTRIES.map((entry) => ({ ...entry, remaining: entry.weeklyLimit - (purchased[entry.itemId] ?? 0) })),
  };
}
const ok = (body: unknown) => ({ ok: true, json: async () => body });

describe("심층 교환소 화면", () => {
  it("보유 증표와 품목의 값, 남은 주간 한도를 보여 준다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(shopBody(150, 30_000_000, { refined_gem: 5 }))));
    render(<V2DeepShopView />);

    expect(await screen.findByText("150개")).toBeTruthy();
    const flawless = screen.getByRole("listitem", { name: "완벽한 보석" });
    expect(within(flawless).getByText("증표 400개 · 5,000,000 G")).toBeTruthy();
    expect(within(flawless).getByText("이번 주 2 / 2회 남음")).toBeTruthy();
    // 증표가 모자라면 살 수 없고 이유를 적는다.
    expect((within(flawless).getByRole("button", { name: "완벽한 보석 교환" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(flawless).getByText("증표가 모자랍니다.")).toBeTruthy();
    // 주간 한도를 다 쓴 품목.
    const refined = screen.getByRole("listitem", { name: "정교한 보석" });
    expect(within(refined).getByText("이번 주 한도를 모두 썼습니다.")).toBeTruthy();
    // 살 수 있는 품목.
    const scroll = screen.getByRole("listitem", { name: "보스 소환서 10개" });
    expect((within(scroll).getByRole("button", { name: "보스 소환서 10개 교환" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("골드가 모자라면 살 수 없다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(shopBody(1_000, 100_000))));
    render(<V2DeepShopView />);

    const scroll = await screen.findByRole("listitem", { name: "보스 소환서 10개" });
    expect((within(scroll).getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(within(scroll).getByText("골드가 모자랍니다.")).toBeTruthy();
  });

  it("교환하면 요청을 보내고 남은 증표와 한도를 갱신한다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(shopBody(150, 30_000_000)))
      .mockResolvedValueOnce(ok({ ...shopBody(90, 29_500_000, { boss_summon_scroll: 1 }), gained: { v2_boss_summon_scroll: 10 } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2DeepShopView />);

    fireEvent.click(await screen.findByRole("button", { name: "보스 소환서 10개 교환" }));

    await waitFor(() => expect(screen.getByText("90개")).toBeTruthy());
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v2/deep-shop");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ itemId: "boss_summon_scroll", quantity: 1 });
    expect(within(screen.getByRole("listitem", { name: "보스 소환서 10개" })).getByText("이번 주 4 / 5회 남음")).toBeTruthy();
    expect(mocks.notifySystem).toHaveBeenCalledWith("✓ 보스 소환서 10개를 받았습니다");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("교환이 거절되면 이유를 알리고 화면을 서버 상태로 맞춘다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(shopBody(150, 30_000_000)))
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ...shopBody(20, 30_000_000), ok: false, error: "insufficient_tokens" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<V2DeepShopView />);

    fireEvent.click(await screen.findByRole("button", { name: "보스 소환서 10개 교환" }));

    await waitFor(() => expect(mocks.notifySystem).toHaveBeenCalledWith("✗ 증표가 모자랍니다.", "error"));
    expect(screen.getByText("20개")).toBeTruthy();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("불러오지 못하면 다시 불러올 수 있다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: "unauthorized" }) })
      .mockResolvedValueOnce(ok(shopBody(5, 0)));
    vi.stubGlobal("fetch", fetchMock);
    render(<V2DeepShopView />);

    fireEvent.click(await screen.findByRole("button", { name: /다시/ }));

    expect(await screen.findByText("5개")).toBeTruthy();
  });
});
