export type PotionId =
  | "potion_heal_s"
  | "potion_heal_m"
  | "potion_heal_l"
  | "potion_mp_s"
  | "potion_mp_m"
  | "potion_mp_l";

// 회복량 = max(flat, ceil(target × pct/100)) — target 은 maxHp 또는 maxMp.
// 저레벨은 flat 이, 고레벨은 pct 가 의미. 둘 다 0 이면 회복 0.
export type PotionEffect =
  | { kind: "heal_hp"; flat?: number; pct?: number }
  | { kind: "heal_mp"; flat?: number; pct?: number };

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
  // PR-6 — MP 회복 포션. v2 스킬 시스템의 MP 풀 보충. 단판 전투 풀충전 모델 위에 중간 회복.
  potion_mp_s: {
    id: "potion_mp_s",
    name: "작은 마력약",
    description: "잠시 흩어진 정신을 다시 모은다. MP +30 또는 최대 MP 의 20% 중 큰 쪽.",
    effect: { kind: "heal_mp", flat: 30, pct: 20 },
    price: 2,
    inShop: true,
    shopPrice: 120,
  },
  potion_mp_m: {
    id: "potion_mp_m",
    name: "중간 마력약",
    description: "달밤의 이슬을 졸여 빚은 약. 정신이 또렷해진다. MP +70 또는 최대 MP 의 35% 중 큰 쪽.",
    effect: { kind: "heal_mp", flat: 70, pct: 35 },
    price: 8,
    inShop: true,
    shopPrice: 300,
  },
  potion_mp_l: {
    id: "potion_mp_l",
    name: "큰 마력약",
    description: "별빛 가루를 우려낸 약. 마력의 흐름이 깊고 가벼워진다. MP +140 또는 최대 MP 의 60% 중 큰 쪽.",
    effect: { kind: "heal_mp", flat: 140, pct: 60 },
    price: 20,
    inShop: true,
    shopPrice: 800,
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
  if (potion.effect.kind !== "heal_hp") return 0;
  const flat = potion.effect.flat ?? 0;
  const pct = potion.effect.pct ?? 0;
  return Math.max(flat, Math.ceil(maxHp * (pct / 100)));
}

// PR-6 — MP 회복량. heal_hp 의 computeHealAmount 미러. max(flat, ceil(maxMp × pct/100)).
// kind 불일치면 0. caller 가 maxMp 클램프 (이미 maxMp 면 흐름).
export function computeMpRestoreAmount(potion: Potion, maxMp: number): number {
  if (potion.effect.kind !== "heal_mp") return 0;
  const flat = potion.effect.flat ?? 0;
  const pct = potion.effect.pct ?? 0;
  return Math.max(flat, Math.ceil(maxMp * (pct / 100)));
}
