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
    effect: { kind: "cosmetic", slot: "profile_border", style: "prismatic" },
  },
  infernal_profile_border: {
    id: "infernal_profile_border",
    name: "업화 프로필 테두리",
    description:
      "캐릭터 프로필 카드에 붉은 불꽃이 흐르는 테두리를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "infernal" },
  },
  oceanic_profile_border: {
    id: "oceanic_profile_border",
    name: "심해 프로필 테두리",
    description:
      "캐릭터 프로필 카드에 푸른 물결이 흐르는 테두리를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "oceanic" },
  },
  verdant_profile_border: {
    id: "verdant_profile_border",
    name: "세계수 프로필 테두리",
    description:
      "캐릭터 프로필 카드에 초록빛 생명이 흐르는 테두리를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "verdant" },
  },
  celestial_profile_border: {
    id: "celestial_profile_border",
    name: "천상 프로필 테두리",
    description:
      "캐릭터 프로필 카드에 금빛과 성운이 흐르는 테두리를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 500,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "celestial" },
  },
  obsidian_profile_border: {
    id: "obsidian_profile_border",
    name: "흑요석 프로필 테두리",
    description:
      "캐릭터 프로필 카드에 검붉은 흑요석이 흐르는 테두리를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "obsidian" },
  },
  frozen_profile_border: {
    id: "frozen_profile_border",
    name: "빙결 프로필 테두리",
    description:
      "캐릭터 프로필 카드에 차가운 서리가 흐르는 테두리를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "frozen" },
  },
  storm_profile_border: {
    id: "storm_profile_border",
    name: "폭풍 프로필 테두리",
    description:
      "캐릭터 프로필 카드에 번개와 먹구름이 흐르는 테두리를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "storm" },
  },
  rose_profile_border: {
    id: "rose_profile_border",
    name: "장미 프로필 테두리",
    description:
      "캐릭터 프로필 카드에 장미와 금빛이 흐르는 테두리를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 400,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "rose" },
  },
  royal_profile_border: {
    id: "royal_profile_border",
    name: "황실 프로필 테두리",
    description:
      "캐릭터 프로필 카드에 황금과 자색이 흐르는 테두리를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 500,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "profile_border", style: "royal" },
  },
  starlight_chat_badge: {
    id: "starlight_chat_badge",
    name: "별빛 채팅 배지",
    description:
      "전체·길드 채팅과 접속자 목록의 닉네임 앞에 별빛 배지를 영구 표시합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "starlight" },
  },
  crown_chat_badge: {
    id: "crown_chat_badge",
    name: "왕관 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 왕관 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "crown" },
  },
  flame_chat_badge: {
    id: "flame_chat_badge",
    name: "불꽃 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 불꽃 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "flame" },
  },
  crystal_chat_badge: {
    id: "crystal_chat_badge",
    name: "수정 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 수정 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "crystal" },
  },
  leaf_chat_badge: {
    id: "leaf_chat_badge",
    name: "새싹 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 새싹 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "leaf" },
  },
  sword_chat_badge: {
    id: "sword_chat_badge",
    name: "검 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 검 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "sword" },
  },
  shield_chat_badge: {
    id: "shield_chat_badge",
    name: "방패 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 방패 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "shield" },
  },
  trophy_chat_badge: {
    id: "trophy_chat_badge",
    name: "트로피 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 트로피 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "trophy" },
  },
  moon_chat_badge: {
    id: "moon_chat_badge",
    name: "달빛 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 달빛 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "moon" },
  },
  sun_chat_badge: {
    id: "sun_chat_badge",
    name: "태양 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 태양 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "sun" },
  },
  heart_chat_badge: {
    id: "heart_chat_badge",
    name: "하트 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 하트 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "heart" },
  },
  skull_chat_badge: {
    id: "skull_chat_badge",
    name: "해골 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 해골 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "skull" },
  },
  lightning_chat_badge: {
    id: "lightning_chat_badge",
    name: "번개 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 번개 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "lightning" },
  },
  snowflake_chat_badge: {
    id: "snowflake_chat_badge",
    name: "눈꽃 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 눈꽃 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "snowflake" },
  },
  paw_chat_badge: {
    id: "paw_chat_badge",
    name: "발자국 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 발자국 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "paw" },
  },
  feather_chat_badge: {
    id: "feather_chat_badge",
    name: "깃털 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 깃털 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "feather" },
  },
  anchor_chat_badge: {
    id: "anchor_chat_badge",
    name: "닻 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 닻 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "anchor" },
  },
  music_chat_badge: {
    id: "music_chat_badge",
    name: "음표 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 음표 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "music" },
  },
  clover_chat_badge: {
    id: "clover_chat_badge",
    name: "네잎클로버 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 네잎클로버 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "clover" },
  },
  star_chat_badge: {
    id: "star_chat_badge",
    name: "별 채팅 배지",
    description:
      "채팅과 접속자 목록의 닉네임 앞에 별 배지를 영구 해금합니다. 계정에 귀속되며 거래할 수 없습니다.",
    coinPrice: 300,
    delivery: "entitlement",
    tradeable: false,
    effect: { kind: "cosmetic", slot: "chat_badge", style: "star" },
  },
  chroma_name_box: {
    id: "chroma_name_box",
    name: "크로마 닉네임 상자",
    description:
      "미보유 닉네임 색상 한 종류를 등급별 확률로 획득합니다. 중복은 나오지 않으며, 사용 전에는 거래소에 등록할 수 있습니다.",
    coinPrice: 300,
    delivery: "inventory",
    tradeable: true,
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
