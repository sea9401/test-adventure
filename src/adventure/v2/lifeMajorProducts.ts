// 명장 산물 정의 — 재료 카탈로그(dungeonDrops)가 import 하므로 다른 생활 모듈에 의존하지 않는다.

export type LifeMajorProductActivity = "farming" | "woodcutting" | "mining" | "fishing";

export const LIFE_MAJOR_PRODUCT_ID: Record<LifeMajorProductActivity, string> = {
  farming: "v2_master_crop",
  woodcutting: "v2_master_wood",
  mining: "v2_master_alloy",
  fishing: "v2_master_catch",
};

export const LIFE_MAJOR_PRODUCTS: Record<
  LifeMajorProductActivity,
  { id: string; name: string; description: string }
> = {
  farming: {
    id: LIFE_MAJOR_PRODUCT_ID.farming,
    name: "명장 작물",
    description: "농사 명장만 거둘 수 있는 최상급 작물. 명장 요리의 재료가 된다.",
  },
  woodcutting: {
    id: LIFE_MAJOR_PRODUCT_ID.woodcutting,
    name: "명장 목재",
    description: "벌목 명장만 고를 수 있는 결 좋은 목재. 단련 촉매의 재료가 된다.",
  },
  mining: {
    id: LIFE_MAJOR_PRODUCT_ID.mining,
    name: "명장 합금",
    description: "채광 명장만 뽑아낼 수 있는 순도 높은 합금. 단련 촉매의 재료가 된다.",
  },
  fishing: {
    id: LIFE_MAJOR_PRODUCT_ID.fishing,
    name: "명장 어획",
    description: "낚시 명장만 낚을 수 있는 최상급 어획물. 명장 요리의 재료가 된다.",
  },
};

/** 단련 촉매 — 채광 주전공 명장 3단계 이상이 명장 합금 2 + 명장 목재 1로 만든다. 강화 하락 −10%p. */
export const TEMPERING_CATALYST = {
  id: "v2_tempering_catalyst",
  name: "단련 촉매",
  description: "강화 1회에 쓰면 하락할 확률 일부(최대 10%p)를 유지로 바꾼다. 강화석과 함께 쓸 수 있다.",
  recipe: { [LIFE_MAJOR_PRODUCT_ID.mining]: 2, [LIFE_MAJOR_PRODUCT_ID.woodcutting]: 1 } as Record<string, number>,
} as const;
