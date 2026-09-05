// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useFishingShop } from "./useFishingShop";
import { useArenaShop } from "./useArenaShop";
import { useCoinShop } from "./useCoinShop";

const applyResourcePatch = vi.fn();
vi.mock("./GameStateProvider", () => ({
  useGameResourceState: () => ({ applyResourcePatch }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([
  [{ ok: true, coins: 80 }, 200, { ok: true, message: "구매를 완료했다." }],
  [{ ok: false, error: "limit_reached", coins: 80 }, 409, { ok: false, message: "구매 한도에 도달했다." }],
] as const)("supports shops without a consumable message policy: %j", async (payload, status, expected) => {
  servePurchase(payload, status);
  const { result } = renderHook(() => useCoinShop({
    endpoint: "/api/test-shop",
    coinLabel: "코인",
    parseState: (json) => ({ coins: Number(json.coins), ownedTitleIds: [] }),
  }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    expect(await result.current.buyConsumable("new_consumable")).toEqual(expected);
  });
  expect(result.current.state?.coins).toBe(80);
  expect(result.current.buying).toBe(null);
});

it.each([
  ["abyssal_tyrant_summon_bait", {}, "심연어룡을 소환했다. 협동 보스에서 확인할 수 있다."],
  ["farm_seed_pouch", { seedPouch: { name: "특별 씨앗 주머니" } }, "특별 씨앗 주머니를 구매했다."],
])("preserves fishing purchase reward messages for %s", async (itemId, extra, message) => {
  servePurchase({ ok: true, coins: 60, ...extra });
  const { result } = renderHook(() => useFishingShop());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    expect(await result.current.buyConsumable(itemId)).toEqual({ ok: true, message });
  });
  expect(result.current.state?.coins).toBe(60);
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
