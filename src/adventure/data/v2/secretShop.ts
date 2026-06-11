// 비밀 상점 — 「비밀 상점의 지도」(레어맵 utility)로만 입장하는 숨겨진 상점.
// 품목당 1회 구매(지도 인스턴스 bought[] 게이트), 지도 만료(48h) 안에서 자유 방문.
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

// 충전약 묶음 크기 — 치료소(1G=1충전) 대비 20% 할인으로 책정.
export const CHARGE_PACK_AMOUNT = 10_000;
// 스태미나 회복약 즉시 회복량(최대치 캡).
export const STAMINA_POTION_AMOUNT = 1_000;
// 한계의 비약 — 스태미나 최대치 영구 증가폭(구매마다 누적, 지도당 1회).
export const STAMINA_CAP_TONIC_BONUS = 250;

export const SECRET_SHOP_STOCK: SecretShopItem[] = [
  {
    id: "stone_red",
    name: "맹렬한 강화석 ×1",
    desc: "드랍·거래소 밖에서 구할 수 있는 유일한 직매처.",
    price: 5_000,
  },
  {
    id: "stone_blue",
    name: "단단한 강화석 ×1",
    desc: "드랍·거래소 밖에서 구할 수 있는 유일한 직매처.",
    price: 3_000,
  },
  {
    id: "hp_charge_pack",
    name: `HP 충전약 ${CHARGE_PACK_AMOUNT.toLocaleString()} 묶음`,
    desc: "치료소(1G=1충전)보다 20% 싸다.",
    price: 8_000,
  },
  {
    id: "mp_charge_pack",
    name: `MP 충전약 ${CHARGE_PACK_AMOUNT.toLocaleString()} 묶음`,
    desc: "치료소(1G=1충전)보다 20% 싸다.",
    price: 8_000,
  },
  {
    id: "stamina_potion",
    name: `스태미나 회복약 (+${STAMINA_POTION_AMOUNT.toLocaleString()})`,
    desc: "마시는 즉시 스태미나를 회복한다 (최대치까지).",
    price: 2_000,
  },
  {
    id: "stamina_cap_tonic",
    name: `한계의 비약 (스태미나 최대치 +${STAMINA_CAP_TONIC_BONUS})`,
    desc: "스태미나의 한계를 영구히 끌어올린다.",
    price: 30_000,
  },
];

export const SECRET_SHOP_ITEM_BY_ID: ReadonlyMap<string, SecretShopItem> =
  new Map(SECRET_SHOP_STOCK.map((i) => [i.id, i]));
