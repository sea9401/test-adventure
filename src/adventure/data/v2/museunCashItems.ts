import { ADVENTURE_SUPPORT_PASS } from "./adventureSupport";

export const MUSEUN_COIN_WALLET_KEY = "museun-coin-wallet.v1";

export const MUSEUN_CASH_ITEMS = {
  rename_permit: {
    id: "rename_permit",
    name: "개명 허가증",
    description:
      "캐릭터 이름을 한 번 변경할 수 있습니다. 구매 후 가방에 보관되며 거래소에서 거래할 수 있습니다.",
    coinPrice: 300,
    delivery: "inventory",
    tradeable: true,
    effect: { kind: "rename" },
  },
  adventure_support_30d: {
    id: "adventure_support_30d",
    name: "월간 모험 지원권 (30일)",
    description:
      "사용한 시점부터 월간 모험 지원 혜택이 30일 연장됩니다. 구매 후 가방에 보관되며 거래소에서 거래할 수 있습니다.",
    coinPrice: ADVENTURE_SUPPORT_PASS.coinPrice,
    delivery: "inventory",
    tradeable: true,
    effect: {
      kind: "adventure_support",
      days: ADVENTURE_SUPPORT_PASS.durationDays,
    },
  },
  prismatic_profile_border: {
    id: "prismatic_profile_border",
    name: "프리즘 프로필 테두리",
    description:
      "캐릭터 프로필 카드에 은은하게 흐르는 프리즘 테두리를 영구 적용합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border" },
  },
  starlight_chat_badge: {
    id: "starlight_chat_badge",
    name: "별빛 채팅 배지",
    description:
      "전체·길드 채팅과 접속자 목록의 닉네임 앞에 별빛 배지를 영구 표시합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge" },
  },
  chroma_name_box: {
    id: "chroma_name_box",
    name: "크로마 닉네임 상자",
    description:
      "미보유 닉네임 색상 한 종류를 등급별 확률로 획득합니다. 중복은 나오지 않으며, 모든 종류를 보유하면 더 이상 열 수 없습니다.",
    coinPrice: 300,
    delivery: "inventory",
    tradeable: false,
    effect: { kind: "chroma_name_box" },
  },
} as const;

export type MuseunCashItemId = keyof typeof MUSEUN_CASH_ITEMS;
export type MuseunCashItemCounts = Partial<Record<MuseunCashItemId, number>>;

export const MUSEUN_CASH_ITEM_IDS = Object.keys(
  MUSEUN_CASH_ITEMS,
) as MuseunCashItemId[];

export type MuseunInventoryItemId = {
  [K in MuseunCashItemId]: (typeof MUSEUN_CASH_ITEMS)[K]["delivery"] extends "inventory"
    ? K
    : never;
}[MuseunCashItemId];

export const MUSEUN_INVENTORY_ITEM_IDS = MUSEUN_CASH_ITEM_IDS.filter(
  (id): id is MuseunInventoryItemId =>
    MUSEUN_CASH_ITEMS[id].delivery === "inventory",
);

export const MUSEUN_TRADEABLE_ITEM_IDS = MUSEUN_INVENTORY_ITEM_IDS.filter(
  (id) => MUSEUN_CASH_ITEMS[id].tradeable === true,
);

export function isMuseunCashItemId(value: unknown): value is MuseunCashItemId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(MUSEUN_CASH_ITEMS, value)
  );
}

export function isTradeableMuseunCashItemId(
  value: unknown,
): value is MuseunInventoryItemId {
  return (
    isMuseunCashItemId(value) && MUSEUN_CASH_ITEMS[value].tradeable === true
  );
}

export function isMuseunInventoryItemId(
  value: unknown,
): value is MuseunInventoryItemId {
  return (
    isMuseunCashItemId(value) &&
    MUSEUN_CASH_ITEMS[value].delivery === "inventory"
  );
}

export function parseMuseunCashItems(value: unknown): MuseunCashItemCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: MuseunCashItemCounts = {};
  for (const id of MUSEUN_INVENTORY_ITEM_IDS) {
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
  if (!isMuseunInventoryItemId(itemId)) return items;
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
  if (!isMuseunInventoryItemId(itemId)) return null;
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
