export type UnifiedExchangeShopId =
  | "general"
  | "farm"
  | "fishing"
  | "arena"
  | "coop"
  | "guild"
  | "honor"
  | "museun";

export type UnifiedExchangeShop = {
  id: UnifiedExchangeShopId;
  label: string;
  category: "일반" | "생활" | "전투" | "길드" | "특수";
  description: string;
};

const BASE_SHOPS: readonly UnifiedExchangeShop[] = [
  {
    id: "general",
    label: "일반 상점",
    category: "일반",
    description: "골드로 장비를 구매하고 보유 장비와 재료를 판매합니다.",
  },
  {
    id: "farm",
    label: "농장",
    category: "생활",
    description: "농장 증표를 씨앗과 농장 물품으로 교환합니다.",
  },
  {
    id: "fishing",
    label: "낚시",
    category: "생활",
    description: "낚시 코인으로 낚시 도구와 칭호, 소비품을 구매합니다.",
  },
  {
    id: "arena",
    label: "투기장",
    category: "전투",
    description: "투기장 코인으로 칭호와 전투 소비품을 구매합니다.",
  },
  {
    id: "coop",
    label: "협동전",
    category: "전투",
    description: "토벌 주화와 보스 재료를 장비 상자와 보급품으로 교환합니다.",
  },
  {
    id: "guild",
    label: "길드 교역",
    category: "길드",
    description: "길드 공동 교역 토큰으로 개인 보상을 구매합니다.",
  },
];

const HONOR_SHOP: UnifiedExchangeShop = {
  id: "honor",
  label: "명성",
  category: "전투",
  description: "정착지 전쟁에서 획득한 명성으로 보급품을 구매합니다.",
};

const MUSEUN_SHOP: UnifiedExchangeShop = {
  id: "museun",
  label: "무슨 코인",
  category: "특수",
  description: "무슨 코인 전용 상품과 꾸미기 상품을 확인합니다.",
};

export function unifiedExchangeShops(flags: {
  honorOpen: boolean;
  museunOpen: boolean;
}): UnifiedExchangeShop[] {
  return [
    ...BASE_SHOPS,
    ...(flags.honorOpen ? [HONOR_SHOP] : []),
    ...(flags.museunOpen ? [MUSEUN_SHOP] : []),
  ];
}

export function normalizeUnifiedExchangeShopId(
  requested: string | null | undefined,
  shops: readonly UnifiedExchangeShop[],
): UnifiedExchangeShopId {
  return shops.some((shop) => shop.id === requested)
    ? (requested as UnifiedExchangeShopId)
    : "general";
}
