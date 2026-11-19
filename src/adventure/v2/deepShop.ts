import { SUMMON_SCROLL_MATERIAL_ID } from "@/adventure/data/v2/coopBosses";
import { spendGold } from "@/adventure/data/v2/coreLoopConfig";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";
import { kstWeekMondayKey } from "@/lib/kst";
import { CUT_GEMS } from "./gemCutting";

// 심층 교환소. 던전 심층 단계를 완주해 얻는 심층 증표와 골드를 함께 내고 재료를 받는다.
// 증표는 재료 목록에 올리면 거래소에서 거래할 수 있게 되므로 이 세이브의 잔액으로만 둔다.

export const DEEP_SHOP_SAVE_KEY = "deep-shop.v1";

export type DeepShopEntry = {
  itemId: string;
  name: string;
  materialId: string;
  /** 한 번 살 때 받는 개수. */
  count: number;
  tokenCost: number;
  goldCost: number;
  /** 주마다(월요일 00:00 KST) 초기화되는 구매 횟수. */
  weeklyLimit: number;
};

export const DEEP_SHOP_ENTRIES: readonly DeepShopEntry[] = [
  {
    itemId: "flawless_gem",
    name: CUT_GEMS.flawless.name,
    materialId: CUT_GEMS.flawless.id,
    count: 1,
    tokenCost: 400,
    goldCost: 5_000_000,
    weeklyLimit: 2,
  },
  {
    itemId: "refined_gem",
    name: CUT_GEMS.refined.name,
    materialId: CUT_GEMS.refined.id,
    count: 1,
    tokenCost: 120,
    goldCost: 1_000_000,
    weeklyLimit: 5,
  },
  {
    itemId: "boss_summon_scroll",
    name: "보스 소환서",
    materialId: SUMMON_SCROLL_MATERIAL_ID,
    count: 10,
    tokenCost: 60,
    goldCost: 500_000,
    weeklyLimit: 5,
  },
  {
    itemId: "blue_enhance_stone",
    name: "푸른 강화석",
    materialId: ENHANCE_STONE_MATERIAL_ID.blue,
    count: 10,
    tokenCost: 40,
    goldCost: 200_000,
    weeklyLimit: 10,
  },
];

export type DeepShopState = {
  tokens: number;
  weekKey: string;
  purchased: Record<string, number>;
};

function wholeNumber(value: unknown): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/** 세이브를 읽는다. 주가 바뀌었으면 구매 기록만 비운다. */
export function parseDeepShopState(raw: unknown, now: Date = new Date()): DeepShopState {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const weekKey = kstWeekMondayKey(now);
  const saved =
    source.weekKey === weekKey && source.purchased && typeof source.purchased === "object"
      ? (source.purchased as Record<string, unknown>)
      : {};
  const purchased: Record<string, number> = {};
  for (const entry of DEEP_SHOP_ENTRIES) {
    const count = Math.min(entry.weeklyLimit, wholeNumber(saved[entry.itemId]));
    if (count > 0) purchased[entry.itemId] = count;
  }
  return { tokens: wholeNumber(source.tokens), weekKey, purchased };
}

export function addDeepTokens(state: DeepShopState, amount: number): DeepShopState {
  const gained = wholeNumber(amount);
  return gained > 0 ? { ...state, tokens: state.tokens + gained } : state;
}

export type DeepShopPurchaseError =
  | "unknown_item"
  | "invalid_quantity"
  | "weekly_limit"
  | "insufficient_tokens"
  | "insufficient_gold";

export function planDeepShopPurchase(
  state: DeepShopState,
  itemId: unknown,
  quantity: unknown,
  wallet: { gold: number; bankedGold: number },
):
  | {
      ok: true;
      state: DeepShopState;
      tokenCost: number;
      goldCost: number;
      materials: Record<string, number>;
      wallet: { gold: number; bankedGold: number };
    }
  | { ok: false; error: DeepShopPurchaseError } {
  const entry = DEEP_SHOP_ENTRIES.find((candidate) => candidate.itemId === itemId);
  if (!entry) return { ok: false, error: "unknown_item" };
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, error: "invalid_quantity" };
  }
  const bought = state.purchased[entry.itemId] ?? 0;
  if (bought + quantity > entry.weeklyLimit) return { ok: false, error: "weekly_limit" };
  const tokenCost = entry.tokenCost * quantity;
  if (state.tokens < tokenCost) return { ok: false, error: "insufficient_tokens" };
  const goldCost = entry.goldCost * quantity;
  const payment = spendGold(wallet.gold, wallet.bankedGold, goldCost);
  if (!payment.ok) return { ok: false, error: "insufficient_gold" };
  return {
    ok: true,
    state: {
      ...state,
      tokens: state.tokens - tokenCost,
      purchased: { ...state.purchased, [entry.itemId]: bought + quantity },
    },
    tokenCost,
    goldCost,
    materials: { [entry.materialId]: entry.count * quantity },
    wallet: { gold: payment.gold, bankedGold: payment.bankedGold },
  };
}
