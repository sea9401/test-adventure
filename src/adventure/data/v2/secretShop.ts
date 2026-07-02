// 비밀 상점 — 「비밀 상점의 지도」(레어맵 utility)로만 입장하는 숨겨진 상점.
// 품목당 1회 구매(지도 인스턴스 bought[] 게이트), 지도 발견 후 1시간 안에서 자유 방문.
// 전 품목 구매 시 지도 소진. 가격은 전부 다이얼(2026-06-12 사용자 스펙):
//   강화석 2종 + HP/MP 충전약 묶음(치료소 1G=1충전보다 싸게) + 스태미나 회복약 +
//   한계의 비약(스태미나 최대치 영구 +).

export type SecretShopItemId =
  | "stone_red"
  | "stone_blue"
  | "hp_charge_pack"
  | "mp_charge_pack"
  | "stamina_potion"
  | "stamina_cap_tonic";

export type SecretShopItem = {
  id: SecretShopItemId;
  name: string;
  desc: string;
  price: number; // 골드
};

// 스태미나 회복약 즉시 회복량. 2026-06-12 사용자 조정: 1000→200.
export const STAMINA_POTION_AMOUNT = 200;
// 한계의 비약 — 스태미나 최대치 영구 증가폭(구매마다 누적, 지도당 1회). 250→10.
export const STAMINA_CAP_TONIC_BONUS = 10;

export const SECRET_SHOP_STOCK: SecretShopItem[] = [
  {
    id: "stone_red",
    name: "붉은 강화석 ×1",
    desc: "드랍·거래소 밖에서 구할 수 있는 유일한 직매처.",
    price: 250_000,
  },
  {
    id: "stone_blue",
    name: "푸른 강화석 ×1",
    desc: "드랍·거래소 밖에서 구할 수 있는 유일한 직매처.",
    price: 250_000,
  },
  {
    id: "hp_charge_pack",
    name: "HP 충전약 완충",
    desc: "보유 한도까지 가득 채운다.",
    price: 2_500_000,
  },
  {
    id: "mp_charge_pack",
    name: "MP 충전약 완충",
    desc: "보유 한도까지 가득 채운다.",
    price: 2_500_000,
  },
  {
    id: "stamina_potion",
    name: `스태미나 회복약 (+${STAMINA_POTION_AMOUNT.toLocaleString()})`,
    desc: "마시는 즉시 스태미나를 회복한다.",
    price: 100_000,
  },
  {
    id: "stamina_cap_tonic",
    name: `한계의 비약 (스태미나 최대치 +${STAMINA_CAP_TONIC_BONUS})`,
    desc: "스태미나의 한계를 영구히 끌어올린다.",
    price: 1_000_000,
  },
];

export const SECRET_SHOP_ITEM_BY_ID: ReadonlyMap<string, SecretShopItem> =
  new Map(SECRET_SHOP_STOCK.map((i) => [i.id, i]));
