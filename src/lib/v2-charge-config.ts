// v2 충전약(HP/MP) 공용 상수 — 서버 라우트(shop/charge·me/inventory)와 클라(V2HealingView)가
// 같은 cap 을 쓰도록 단일 출처로 둔다. 평범한 상수만 export 하므로 서버/클라 양쪽 import 안전.
//
// 충전 모델: inventory.v2.{hpCharges, mpCharges} 정수, 0..MAX_CHARGE. 1 G = 1 충전.
// 사냥 후 HP/MP 부족분 만큼 자동 소모(hunt route). 옛 POTIONS 카탈로그 폐기 후 단순 카운터.
export const MAX_CHARGE = 1_000_000;
