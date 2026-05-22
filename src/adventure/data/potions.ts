export type PotionId = "potion_heal_s" | "potion_heal_m" | "potion_heal_l";

// 회복량 = max(flat, ceil(maxHp × pct/100)).
// 둘 중 큰 쪽 — 저레벨에서는 flat 이, 고레벨에서는 pct 가 의미를 갖도록 한다.
// 둘 다 미지정/0 이면 회복 0.
export type PotionEffect = {
  kind: "heal_hp";
  flat?: number;
  pct?: number;
};

export type Potion = {
  id: PotionId;
  name: string;
  description: string;
  effect: PotionEffect;
  price: number;
  /**
   * 상점 구매 시 골드 단가 오버라이드. 미지정이면 price 사용.
   * 제작 전용(조합) 포션을 골드 프리미엄으로 사게 할 때 — 제작(싼 경로)의 가치는
   * 보존하면서 골드 싱크를 더한다(game-fun-audit 보조문제 C4). 판매(sell)는 이 값과
   * 무관하게 별도 판매가 맵(getPotionSellPrice)을 쓰므로 buy≫sell 라 차익 없음.
   */
  shopPrice?: number;
  /** 상점 구매 노출 여부. 미지정/true → 노출. 조합 전용 포션은 false. */
  inShop?: boolean;
};

export const POTIONS: Record<PotionId, Potion> = {
  potion_heal_s: {
    id: "potion_heal_s",
    name: "작은 회복약",
    description: "마시면 약간의 활력이 돌아온다. HP +20 또는 최대 HP 의 20% 중 큰 쪽.",
    effect: { kind: "heal_hp", flat: 20, pct: 20 },
    price: 1,
  },
  potion_heal_m: {
    id: "potion_heal_m",
    name: "중간 회복약",
    description: "산초꽃을 졸여 빚은 약. 깊은 숨이 트인다. HP +50 또는 최대 HP 의 35% 중 큰 쪽.",
    effect: { kind: "heal_hp", flat: 50, pct: 35 },
    price: 6,
    // 제작이 정상 경로(마력가루) — 상점은 골드 프리미엄 편의(골드 싱크).
    inShop: true,
    shopPrice: 150,
  },
  potion_heal_l: {
    id: "potion_heal_l",
    name: "큰 회복약",
    description: "봉황 깃털을 우려낸 약. 식은 몸에 다시 불이 붙는다. HP +100 또는 최대 HP 의 60% 중 큰 쪽.",
    effect: { kind: "heal_hp", flat: 100, pct: 60 },
    price: 16,
    inShop: true,
    shopPrice: 500,
  },
};

export const POTION_IDS = Object.keys(POTIONS) as PotionId[];

// 각 포션 종류 별 최대 보유 가능 수의 기본값.
// 실제 최대값은 인벤토리에 누적된 보너스(potionCapacityBonus)를 더해 산출 — `potionMax()` 사용.
export const POTION_MAX_PER_TYPE_BASE = 15;

export function potionMax(bonus = 0): number {
  return POTION_MAX_PER_TYPE_BASE + Math.max(0, bonus);
}

export function computeHealAmount(potion: Potion, maxHp: number): number {
  const flat = potion.effect.flat ?? 0;
  const pct = potion.effect.pct ?? 0;
  return Math.max(flat, Math.ceil(maxHp * (pct / 100)));
}
