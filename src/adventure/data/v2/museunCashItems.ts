import { ADVENTURE_SUPPORT_PASS } from "./adventureSupport";

export const MUSEUN_COIN_WALLET_KEY = "museun-coin-wallet.v1";

export const MUSEUN_CASH_ITEMS = {
  rename_permit: {
    id: "rename_permit",
    name: "개명 허가증",
    description:
      "캐릭터 이름을 한 번 변경할 수 있습니다. 구매 후 가방에 보관되며 거래소에서 거래할 수 있습니다.",
    coinPrice: 300,
    effect: { kind: "rename" },
  },
  adventure_support_30d: {
    id: "adventure_support_30d",
    name: "월간 모험 지원권 (30일)",
    description:
      "사용한 시점부터 월간 모험 지원 혜택이 30일 연장됩니다. 구매 후 가방에 보관되며 거래소에서 거래할 수 있습니다.",
    coinPrice: ADVENTURE_SUPPORT_PASS.coinPrice,
    effect: {
      kind: "adventure_support",
      days: ADVENTURE_SUPPORT_PASS.durationDays,
    },
  },
} as const;

export type MuseunCashItemId = keyof typeof MUSEUN_CASH_ITEMS;
export type MuseunCashItemCounts = Partial<Record<MuseunCashItemId, number>>;

export const MUSEUN_CASH_ITEM_IDS = Object.keys(
  MUSEUN_CASH_ITEMS,
) as MuseunCashItemId[];

export function isMuseunCashItemId(value: unknown): value is MuseunCashItemId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(MUSEUN_CASH_ITEMS, value)
  );
}

export function parseMuseunCashItems(value: unknown): MuseunCashItemCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: MuseunCashItemCounts = {};
  for (const id of MUSEUN_CASH_ITEM_IDS) {
    const count = Math.floor(Number(raw[id]));
    if (Number.isFinite(count) && count > 0) out[id] = count;
  }
  return out;
}

export function addMuseunCashItem(
  value: unknown,
  itemId: MuseunCashItemId,
  quantity: number,
): MuseunCashItemCounts {
  const items = parseMuseunCashItems(value);
  const add = Math.max(0, Math.floor(Number(quantity) || 0));
  if (add > 0) items[itemId] = (items[itemId] ?? 0) + add;
  return items;
}

export function removeMuseunCashItem(
  value: unknown,
  itemId: MuseunCashItemId,
  quantity: number,
): MuseunCashItemCounts | null {
  const items = parseMuseunCashItems(value);
  const remove = Math.max(0, Math.floor(Number(quantity) || 0));
  const held = items[itemId] ?? 0;
  if (remove <= 0 || held < remove) return null;
  const left = held - remove;
  if (left > 0) items[itemId] = left;
  else delete items[itemId];
  return items;
}

export function parseMuseunCoinBalance(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const coins = Math.floor(Number((value as { coins?: unknown }).coins));
  return Number.isFinite(coins) ? Math.max(0, coins) : 0;
}
