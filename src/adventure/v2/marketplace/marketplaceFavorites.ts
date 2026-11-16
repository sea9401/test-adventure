// 거래소 별표 즐겨찾기: 매물 하나가 아니라 품목 종류(`종류:품목 id`)를 기억한다.
// 거래소 목록과 모험의 서 장비 도감이 같은 브라우저 저장소를 함께 쓴다.
export const MARKETPLACE_FAVORITES_KEY = "adventure.marketplace.favorites.v1";

export function marketplaceFavoriteKey(kind: string, itemId: string): string {
  return `${kind}:${itemId}`;
}

/** 장비 매물의 종류 값은 "equip" 이다. */
export function equipmentFavoriteKey(equipmentId: string): string {
  return marketplaceFavoriteKey("equip", equipmentId);
}
