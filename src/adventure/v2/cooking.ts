import type { V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import type { FarmItemId, FarmItemInventory } from "./farm";
import type { FishingCatchItemId } from "./fishingStock";

export const COOKING_SAVE_KEY = "cooking.v1";
export const COOKING_LEVEL_CAP = 50;
export const COOKING_XP_SCALE = 10;
export const COOKING_DAILY_ORDER_COUNT = 3;
export const COOKING_SURPLUS_BATCH_SIZE = 20;
export const COOKING_SURPLUS_DAILY_LIMIT = 5;
export const COOKING_BUFF_MAX_HOURS = 8;

export type CookingQuality = "normal" | "careful" | "masterpiece";
export type CookingAction = "cook" | "order";

export type CookingRecipe = {
  id: string;
  name: string;
  icon: string;
  imageSrc: string;
  requiredLevel: number;
  farmIngredients: FarmItemInventory;
  fishingIngredients?: Partial<Record<FishingCatchItemId, number>>;
  optionalRareItemId?: FarmItemId;
  xp: number;
  baseStatPct: Partial<Record<V2StatKey, number>>;
  specialStatPct?: Partial<Record<V2StatKey, number>>;
  description: string;
};

export type ActiveCookingBuff = {
  recipeId: string;
  recipeName: string;
  statPct: Partial<Record<V2StatKey, number>>;
  quality: CookingQuality;
  expiresAt: number;
};

export type CookingState = {
  version: 1;
  xp: number;
  discoveredRecipeIds: string[];
  favoriteRecipeIds: string[];
  daily: {
    dayKey: string;
    surplusTrades: number;
    completedOrderIds: string[];
  };
};

export type CookingOrder = {
  id: string;
  recipeId: string;
  rewardGold: number;
  rewardReputation: number;
  bonusXp: number;
};

type CookingFoodRareKind = "base" | "rare";
type CookingFoodDurationKind = "standard" | "extended";

export type CookingFoodId =
  `food:${string}:${CookingQuality}:${CookingFoodRareKind}:${CookingFoodDurationKind}`;

export type CookingFoodInventory = Partial<Record<CookingFoodId, number>>;

export type CookingFoodVariant = {
  id: CookingFoodId;
  recipeId: string;
  quality: CookingQuality;
  usedRare: boolean;
  extended: boolean;
};

export type CookingFoodDefinition = CookingFoodVariant & {
  recipe: CookingRecipe;
  name: string;
  durationMs: number;
  statPct: Partial<Record<V2StatKey, number>>;
};

const recipe = (
  value: Omit<CookingRecipe, "imageSrc">,
): CookingRecipe => ({
  ...value,
  imageSrc: `/images/items/cooking/${value.id}.webp`,
});

export const COOKING_RECIPES: readonly CookingRecipe[] = [
  recipe({ id: "rustic_bread", name: "투박한 밀빵", icon: "🍞", requiredLevel: 1, farmIngredients: { wheat: 15 }, optionalRareItemId: "golden_wheat", xp: 12, baseStatPct: { vit: 5 }, specialStatPct: { vit: 7 }, description: "든든한 빵으로 활력을 높입니다." }),
  recipe({ id: "herb_tea", name: "향긋한 허브차", icon: "🍵", requiredLevel: 1, farmIngredients: { herb: 12 }, optionalRareItemId: "silverleaf", xp: 12, baseStatPct: { int: 5 }, specialStatPct: { int: 7 }, description: "맑은 향으로 지능을 가다듬습니다." }),
  recipe({ id: "grilled_corn", name: "구운 옥수수", icon: "🌽", requiredLevel: 1, farmIngredients: { corn: 18 }, optionalRareItemId: "sweet_corn", xp: 14, baseStatPct: { str: 5 }, specialStatPct: { str: 7 }, description: "힘이 나는 간단한 농장 요리입니다." }),
  recipe({ id: "fish_skewer", name: "생선 꼬치구이", icon: "🐟", requiredLevel: 1, farmIngredients: { herb: 3 }, fishingIngredients: { catch_common: 5 }, xp: 14, baseStatPct: { dex: 5 }, description: "일반 어획물을 손질한 민첩 요리입니다." }),
  recipe({ id: "herb_flatbread", name: "향긋한 허브 납작빵", icon: "🫓", requiredLevel: 1, farmIngredients: { wheat: 8, herb: 5 }, optionalRareItemId: "silverleaf", xp: 13, baseStatPct: { spi: 5 }, specialStatPct: { spi: 7 }, description: "갓 구운 빵과 허브 향으로 정신을 가다듬습니다." }),
  recipe({ id: "fishermans_pie", name: "어부의 생선 파이", icon: "🥧", requiredLevel: 1, farmIngredients: { wheat: 10 }, fishingIngredients: { catch_common: 4 }, optionalRareItemId: "golden_wheat", xp: 14, baseStatPct: { luk: 5 }, specialStatPct: { luk: 7 }, description: "소박하지만 알찬 생선 파이로 행운을 북돋웁니다." }),
  recipe({ id: "tomato_salad", name: "토마토 허브 샐러드", icon: "🥗", requiredLevel: 10, farmIngredients: { tomato: 10, herb: 5 }, optionalRareItemId: "heirloom_tomato", xp: 28, baseStatPct: { dex: 7 }, specialStatPct: { dex: 10 }, description: "가볍고 산뜻한 몸놀림을 돕습니다." }),
  recipe({ id: "strawberry_tart", name: "딸기 타르트", icon: "🥧", requiredLevel: 10, farmIngredients: { wheat: 10, strawberry: 8 }, optionalRareItemId: "white_strawberry", xp: 28, baseStatPct: { luk: 7 }, specialStatPct: { luk: 10 }, description: "달콤한 행운을 부르는 디저트입니다." }),
  recipe({ id: "fresh_fish_soup", name: "신선한 생선 수프", icon: "🍲", requiredLevel: 10, farmIngredients: { herb: 5, corn: 5 }, fishingIngredients: { catch_fresh: 3 }, xp: 30, baseStatPct: { spi: 7 }, description: "신선한 어획물로 정신을 맑게 합니다." }),
  recipe({ id: "corn_tomato_potage", name: "옥수수 토마토 포타주", icon: "🥣", requiredLevel: 10, farmIngredients: { corn: 8, tomato: 8, herb: 3 }, optionalRareItemId: "heirloom_tomato", xp: 30, baseStatPct: { int: 7, vit: 3 }, specialStatPct: { int: 10, vit: 5 }, description: "부드럽게 끓인 채소가 지능과 활력을 보탭니다." }),
  recipe({ id: "strawberry_herb_punch", name: "딸기 허브 펀치", icon: "🍹", requiredLevel: 10, farmIngredients: { strawberry: 8, herb: 5 }, optionalRareItemId: "white_strawberry", xp: 29, baseStatPct: { spi: 7, luk: 3 }, specialStatPct: { spi: 10, luk: 5 }, description: "상큼한 과즙과 허브 향이 정신과 행운을 깨웁니다." }),
  recipe({ id: "potato_stew", name: "감자 양파 스튜", icon: "🥘", requiredLevel: 20, farmIngredients: { potato: 12, onion: 6, herb: 4 }, optionalRareItemId: "golden_potato", xp: 52, baseStatPct: { vit: 10 }, specialStatPct: { vit: 13 }, description: "오래 버틸 힘을 주는 고급 스튜입니다." }),
  recipe({ id: "quality_fish_platter", name: "고급 생선 모둠", icon: "🍣", requiredLevel: 20, farmIngredients: { rice: 8, onion: 4 }, fishingIngredients: { catch_quality: 2 }, xp: 56, baseStatPct: { str: 6, dex: 6 }, description: "힘과 민첩을 함께 끌어올립니다." }),
  recipe({ id: "pearl_onion_soup", name: "진주 양파 수프", icon: "🧅", requiredLevel: 20, farmIngredients: { onion: 10, potato: 8, herb: 4 }, optionalRareItemId: "pearl_onion", xp: 54, baseStatPct: { int: 8, spi: 4 }, specialStatPct: { int: 11, spi: 6 }, description: "오래 볶은 양파의 깊은 맛으로 집중력을 높입니다." }),
  recipe({ id: "fish_croquettes", name: "고급 생선 크로켓", icon: "🧆", requiredLevel: 20, farmIngredients: { potato: 12, onion: 4 }, fishingIngredients: { catch_quality: 2 }, optionalRareItemId: "golden_potato", xp: 56, baseStatPct: { dex: 6, luk: 6 }, specialStatPct: { dex: 8, luk: 8 }, description: "바삭한 한입 요리로 몸놀림과 행운을 살립니다." }),
  recipe({ id: "soybean_rice", name: "검은콩 약선밥", icon: "🍚", requiredLevel: 35, farmIngredients: { rice: 12, soybean: 8, herb: 4 }, optionalRareItemId: "black_soybean", xp: 88, baseStatPct: { spi: 15, vit: 7 }, specialStatPct: { spi: 18, vit: 9 }, description: "정신과 생존력을 함께 높이는 명인 요리입니다." }),
  recipe({ id: "special_seafood_rice", name: "특급 해산물 덮밥", icon: "🍤", requiredLevel: 35, farmIngredients: { rice: 12, onion: 5 }, fishingIngredients: { catch_special: 1 }, xp: 92, baseStatPct: { dex: 15, luk: 7 }, description: "특급 어획물로 속도와 행운을 살립니다." }),
  recipe({ id: "soy_glazed_fish_bowl", name: "간장 생선 덮밥", icon: "🍱", requiredLevel: 35, farmIngredients: { rice: 12, soybean: 8 }, fishingIngredients: { catch_quality: 2 }, optionalRareItemId: "black_soybean", xp: 90, baseStatPct: { str: 15, vit: 7 }, specialStatPct: { str: 18, vit: 9 }, description: "콩으로 빚은 장과 생선을 곁들여 힘과 활력을 채웁니다." }),
  recipe({ id: "aromatic_fish_curry", name: "향신 생선 카레", icon: "🍛", requiredLevel: 35, farmIngredients: { rice: 10, onion: 6, herb: 5 }, fishingIngredients: { catch_special: 1 }, optionalRareItemId: "pearl_onion", xp: 92, baseStatPct: { int: 15, dex: 7 }, specialStatPct: { int: 18, dex: 9 }, description: "향긋한 소스와 생선이 지능과 민첩을 끌어올립니다." }),
  recipe({ id: "flame_corn_stew", name: "불꽃 옥수수 스튜", icon: "🔥", requiredLevel: 50, farmIngredients: { corn: 24, onion: 8, herb: 6 }, optionalRareItemId: "sweet_corn", xp: 130, baseStatPct: { str: 15, vit: 8 }, specialStatPct: { str: 20, vit: 10 }, description: "상위 사냥을 위한 힘 특화 최종 요리입니다." }),
  recipe({ id: "golden_gratin", name: "황금 감자 그라탱", icon: "🫕", requiredLevel: 50, farmIngredients: { potato: 20, herb: 8, onion: 8 }, optionalRareItemId: "golden_potato", xp: 130, baseStatPct: { vit: 15, spi: 8 }, specialStatPct: { vit: 20, spi: 10 }, description: "강한 공격을 버티기 위한 활력 요리입니다." }),
  recipe({ id: "ancient_tomato_meal", name: "고대종 토마토 정식", icon: "🍅", requiredLevel: 50, farmIngredients: { tomato: 20, rice: 12, herb: 6 }, optionalRareItemId: "heirloom_tomato", xp: 130, baseStatPct: { dex: 15, luk: 8 }, specialStatPct: { dex: 20, luk: 10 }, description: "정확하고 빠른 전투를 위한 민첩 요리입니다." }),
  recipe({ id: "royal_cacao_tart", name: "왕실 카카오 타르트", icon: "🍫", requiredLevel: 50, farmIngredients: { cacao: 14, sugarcane: 14, wheat: 10 }, optionalRareItemId: "royal_cacao", xp: 130, baseStatPct: { int: 15, luk: 8 }, specialStatPct: { int: 20, luk: 10 }, description: "마법 화력을 끌어올리는 지능 요리입니다." }),
  recipe({ id: "white_strawberry_dessert", name: "설향 딸기 디저트", icon: "🍓", requiredLevel: 50, farmIngredients: { strawberry: 18, sugarcane: 12, wheat: 8 }, optionalRareItemId: "white_strawberry", xp: 130, baseStatPct: { luk: 15, dex: 8 }, specialStatPct: { luk: 20, dex: 10 }, description: "치명적인 행운을 위한 최종 디저트입니다." }),
  recipe({ id: "legendary_sea_banquet", name: "전설의 바다 만찬", icon: "🐉", requiredLevel: 50, farmIngredients: { rice: 18, soybean: 10, herb: 8 }, fishingIngredients: { catch_legendary: 1 }, xp: 150, baseStatPct: { spi: 20, vit: 10 }, description: "전설 어획물로 완성하는 정신 특화 만찬입니다." }),
  recipe({ id: "earth_grand_feast", name: "대지의 대만찬", icon: "🍽️", requiredLevel: 50, farmIngredients: { wheat: 8, corn: 8, tomato: 8, potato: 8, rice: 8, soybean: 8 }, optionalRareItemId: "golden_rice", xp: 160, baseStatPct: { str: 8, vit: 8, dex: 8, int: 8, spi: 8, luk: 8 }, description: "모든 능력치를 고르게 높이는 균형 만찬입니다." }),
  recipe({ id: "dragonfire_seafood_hotpot", name: "용화 해산물 전골", icon: "🐲", requiredLevel: 50, farmIngredients: { tomato: 16, onion: 10, herb: 8 }, fishingIngredients: { catch_legendary: 1 }, xp: 150, baseStatPct: { str: 20, int: 10 }, description: "전설 어획물의 진한 맛으로 물리와 마법 화력을 함께 높입니다." }),
  recipe({ id: "crystal_cacao_drink", name: "수정 카카오 음료", icon: "☕", requiredLevel: 50, farmIngredients: { cacao: 14, sugarcane: 12, herb: 6 }, optionalRareItemId: "crystal_sugarcane", xp: 138, baseStatPct: { int: 15, spi: 8 }, specialStatPct: { int: 20, spi: 10 }, description: "진한 카카오와 맑은 단맛으로 주문 집중력을 높입니다." }),
];

export const COOKING_RECIPE_BY_ID = new Map(
  COOKING_RECIPES.map((entry) => [entry.id, entry]),
);

export function cookingQualityName(quality: CookingQuality): string {
  if (quality === "masterpiece") return "걸작";
  if (quality === "careful") return "정성작";
  return "일반";
}

export function cookingFoodId(args: {
  recipeId: string;
  quality: CookingQuality;
  usedRare: boolean;
  extended: boolean;
}): CookingFoodId {
  const rare: CookingFoodRareKind = args.usedRare ? "rare" : "base";
  const duration: CookingFoodDurationKind = args.extended
    ? "extended"
    : "standard";
  return `food:${args.recipeId}:${args.quality}:${rare}:${duration}`;
}

export function parseCookingFoodId(value: unknown): CookingFoodVariant | null {
  if (typeof value !== "string") return null;
  const [prefix, recipeId, qualityRaw, rareRaw, durationRaw, extra] =
    value.split(":");
  if (prefix !== "food" || extra !== undefined) return null;
  const recipe = COOKING_RECIPE_BY_ID.get(recipeId);
  const quality: CookingQuality | null =
    qualityRaw === "masterpiece" || qualityRaw === "careful" || qualityRaw === "normal"
      ? qualityRaw
      : null;
  const usedRare = rareRaw === "rare";
  if (
    !recipe ||
    !quality ||
    (rareRaw !== "base" && rareRaw !== "rare") ||
    (durationRaw !== "standard" && durationRaw !== "extended") ||
    (usedRare && !recipe.optionalRareItemId)
  ) {
    return null;
  }
  return {
    id: value as CookingFoodId,
    recipeId,
    quality,
    usedRare,
    extended: durationRaw === "extended",
  };
}

export function isCookingFoodId(value: unknown): value is CookingFoodId {
  return parseCookingFoodId(value) !== null;
}

export function cookingFoodDefinition(
  value: unknown,
): CookingFoodDefinition | null {
  const variant = parseCookingFoodId(value);
  if (!variant) return null;
  const recipe = COOKING_RECIPE_BY_ID.get(variant.recipeId)!;
  const tags = [
    cookingQualityName(variant.quality),
    variant.usedRare ? "희귀 특선" : "",
    variant.extended ? "장시간" : "",
  ].filter(Boolean);
  return {
    ...variant,
    recipe,
    name: `${recipe.name} (${tags.join(" · ")})`,
    durationMs: cookingBuffDurationMs(variant.quality, variant.extended ? 5 : 0),
    statPct: cookingStatPct(recipe, variant.quality, variant.usedRare),
  };
}

export function parseCookingFoodInventory(raw: unknown): CookingFoodInventory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const parsed: CookingFoodInventory = {};
  for (const [id, rawCount] of Object.entries(raw)) {
    if (!isCookingFoodId(id)) continue;
    const count = safeInt(rawCount);
    if (count > 0) parsed[id] = count;
  }
  return parsed;
}

export function addCookingFood(
  raw: unknown,
  itemId: CookingFoodId,
  quantity: number,
): CookingFoodInventory {
  const inventory = parseCookingFoodInventory(raw);
  const count = Math.max(0, Math.floor(quantity));
  if (count < 1) return inventory;
  return {
    ...inventory,
    [itemId]: (inventory[itemId] ?? 0) + count,
  };
}

export function removeCookingFood(
  raw: unknown,
  itemId: CookingFoodId,
  quantity: number,
): CookingFoodInventory | null {
  const inventory = parseCookingFoodInventory(raw);
  const count = Math.max(0, Math.floor(quantity));
  const held = inventory[itemId] ?? 0;
  if (count < 1 || held < count) return null;
  const next = { ...inventory };
  if (held === count) delete next[itemId];
  else next[itemId] = held - count;
  return next;
}

export function cookingDayKey(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function emptyCookingState(now = Date.now()): CookingState {
  return {
    version: 1,
    xp: 0,
    discoveredRecipeIds: [],
    favoriteRecipeIds: [],
    daily: { dayKey: cookingDayKey(now), surplusTrades: 0, completedOrderIds: [] },
  };
}

const safeInt = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

export function parseCookingState(raw: unknown, now = Date.now()): CookingState {
  const source = raw && typeof raw === "object" ? raw as Partial<CookingState> : {};
  const known = new Set(COOKING_RECIPES.map((entry) => entry.id));
  const dayKey = cookingDayKey(now);
  const sameDay = source.daily?.dayKey === dayKey;
  return {
    version: 1,
    xp: safeInt(source.xp),
    discoveredRecipeIds: Array.from(new Set(source.discoveredRecipeIds ?? [])).filter((id) => known.has(id)),
    favoriteRecipeIds: Array.from(new Set(source.favoriteRecipeIds ?? [])).filter((id) => known.has(id)),
    daily: {
      dayKey,
      surplusTrades: sameDay ? Math.min(COOKING_SURPLUS_DAILY_LIMIT, safeInt(source.daily?.surplusTrades)) : 0,
      completedOrderIds: sameDay ? Array.from(new Set(source.daily?.completedOrderIds ?? [])).slice(0, COOKING_DAILY_ORDER_COUNT) : [],
    },
  };
}

export function cookingLevelXpThreshold(level: number): number {
  const safe = Math.max(1, Math.min(COOKING_LEVEL_CAP, Math.floor(level)));
  return (safe - 1) * (safe - 1) * COOKING_XP_SCALE;
}

export function cookingLevelForXp(xp: number): number {
  return Math.min(COOKING_LEVEL_CAP, Math.floor(Math.sqrt(safeInt(xp) / COOKING_XP_SCALE)) + 1);
}

export function adjustedCookingXp(recipeLevel: number, currentLevel: number, baseXp: number): number {
  const gap = currentLevel - recipeLevel;
  if (gap >= 20) return Math.max(1, Math.floor(baseXp * 0.05));
  if (gap >= 10) return Math.max(1, Math.floor(baseXp * 0.25));
  return baseXp;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function cookingOrders(userId: string, state: CookingState): CookingOrder[] {
  const level = cookingLevelForXp(state.xp);
  const pool = COOKING_RECIPES.filter((entry) => entry.requiredLevel <= level);
  const start = pool.length > 0 ? hashText(`${userId}:${state.daily.dayKey}`) % pool.length : 0;
  return Array.from({ length: Math.min(COOKING_DAILY_ORDER_COUNT, pool.length) }, (_, index) => {
    const selected = pool[(start + index * 5) % pool.length];
    const tier = selected.requiredLevel >= 50 ? 5 : selected.requiredLevel >= 35 ? 4 : selected.requiredLevel >= 20 ? 3 : selected.requiredLevel >= 10 ? 2 : 1;
    return { id: `${state.daily.dayKey}:${index}`, recipeId: selected.id, rewardGold: tier * 50_000, rewardReputation: tier, bonusXp: selected.xp };
  });
}

export function cookingQuality(args: { rng?: () => number; cookingJobTier?: number; usedRare?: boolean }): CookingQuality {
  if (args.usedRare && (args.cookingJobTier ?? 0) >= 6) return "masterpiece";
  const roll = (args.rng ?? Math.random)();
  const carefulChance = 0.15 + Math.max(0, (args.cookingJobTier ?? 0) - 2) * 0.08 + (args.usedRare ? 0.35 : 0);
  const masterpieceChance = 0.02 + Math.max(0, (args.cookingJobTier ?? 0) - 3) * 0.04 + (args.usedRare ? 0.12 : 0);
  if (roll < masterpieceChance) return "masterpiece";
  if (roll < carefulChance) return "careful";
  return "normal";
}

export function cookingBuffDurationMs(quality: CookingQuality, cookingJobTier = 0): number {
  const hours = quality === "masterpiece" ? 4 : quality === "careful" ? 3 : 2;
  return Math.round(hours * 60 * 60 * 1000 * (cookingJobTier >= 5 ? 1.25 : 1));
}

export function cookingStatPct(
  recipe: CookingRecipe,
  quality: CookingQuality,
  usedRare: boolean,
): Partial<Record<V2StatKey, number>> {
  const base = usedRare && recipe.specialStatPct
    ? recipe.specialStatPct
    : recipe.baseStatPct;
  const qualityMultiplier = quality === "masterpiece" ? 1.2 : quality === "careful" ? 1.1 : 1;
  return Object.fromEntries(
    Object.entries(base).map(([stat, value]) => [
      stat,
      Math.round((value ?? 0) * qualityMultiplier * 10) / 10,
    ]),
  ) as Partial<Record<V2StatKey, number>>;
}

export function activeCookingBuff(raw: unknown, now = Date.now()): ActiveCookingBuff | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ActiveCookingBuff>;
  const recipe = typeof value.recipeId === "string" ? COOKING_RECIPE_BY_ID.get(value.recipeId) : null;
  if (!recipe || !Number.isFinite(value.expiresAt) || Number(value.expiresAt) <= now) return null;
  const quality: CookingQuality = value.quality === "masterpiece" || value.quality === "careful" ? value.quality : "normal";
  return { recipeId: recipe.id, recipeName: recipe.name, statPct: { ...(value.statPct ?? {}) }, quality, expiresAt: Number(value.expiresAt) };
}
