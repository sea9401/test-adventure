// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useFishingShop } from "./useFishingShop";
import { useArenaShop } from "./useArenaShop";

const applyResourcePatch = vi.fn();
vi.mock("./GameStateProvider", () => ({
  useGameResourceState: () => ({ applyResourcePatch }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function servePurchase(payload: Record<string, unknown>, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? Response.json(payload, { status })
      : Response.json({ ok: true, coins: 100, ownedTitleIds: [], staminaPotions: 2 }),
  ));
}

it("reports a weekly limit and reconciles the fishing shop after a rejected purchase", async () => {
  servePurchase({ ok: false, error: "limit_reached", coins: 20,
    staminaPotionLimit: { boughtThisWeek: 30, weeklyLimit: 30, remainingThisWeek: 0 } }, 409);
  const { result } = renderHook(() => useFishingShop());
  await waitFor(() => expect(result.current.loading).toBe(false));
  let purchase;
  await act(async () => { purchase = await result.current.buyConsumable("stamina_potion"); });
  expect(purchase).toEqual({ ok: false, message: "이번 주 구매 한도에 도달했다." });
  expect(result.current.state?.coins).toBe(20);
  expect(result.current.state?.staminaPotionLimit?.remainingThisWeek).toBe(0);
  expect(result.current.buying).toBe(null);
});

it("preserves fishing-specific summon feedback and authoritative coin balance", async () => {
  servePurchase({ ok: false, error: "boss_already_active", coins: 40 }, 409);
  const { result } = renderHook(() => useFishingShop());
  await waitFor(() => expect(result.current.loading).toBe(false));
  let purchase;
  await act(async () => { purchase = await result.current.buyConsumable("abyssal_tyrant_summon_bait"); });
  expect(purchase).toEqual({ ok: false, message: "이미 소환한 심연어룡이 활성 상태다." });
  expect(result.current.state?.coins).toBe(40);
});

it("preserves arena potion success and global resource synchronization", async () => {
  servePurchase({ ok: true, coins: 80, staminaPotions: 3 });
  const { result } = renderHook(() => useArenaShop());
  await waitFor(() => expect(result.current.loading).toBe(false));
  let purchase;
  await act(async () => { purchase = await result.current.buyConsumable("stamina_potion"); });
  expect(purchase).toEqual({ ok: true, message: "스태미나 회복약을 구매했다." });
  expect(result.current.state?.staminaPotions).toBe(3);
  expect(result.current.state?.coins).toBe(80);
  expect(applyResourcePatch).toHaveBeenLastCalledWith({ staminaPotions: 3 });
});
