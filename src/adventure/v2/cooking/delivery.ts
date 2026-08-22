import type { CookingFoodDefinition, CookingQuality } from "./food";
import { COOKING_STANDING_DELIVERY_DAILY_LIMIT, type CookingStateV2 } from "./state";
import type { CookingEffectTag, CookingField, CookingMethod } from "./types";
import { COOKING_FIELD_NAMES, COOKING_METHOD_NAMES } from "./types";

export type CookingDeliveryCondition = {
  field?: CookingField;
  method?: CookingMethod;
  effectTag?: CookingEffectTag;
  minimumQuality: CookingQuality;
};

export type CookingDeliveryRewards = {
  gold: number;
  reputation: number;
  cookingXp: number;
  specialtyXp: number;
};

export type CookingDeliveryRequest = {
  id: string;
  kind: "daily" | "weekly";
  title: string;
  targetScore: number;
  condition: CookingDeliveryCondition;
  rewards: CookingDeliveryRewards;
};

const FIELDS: readonly CookingField[] = ["hearth", "pot", "baking", "seafood", "medicinal"];
const METHODS: readonly CookingMethod[] = ["grill", "boil", "stir_fry", "fry", "steam", "bake", "brew", "ferment"];
const EFFECTS: readonly CookingEffectTag[] = ["offense", "defense", "recovery", "hunt_exp", "hunt_gold", "life"];
const QUALITY_RANK: Record<CookingQuality, number> = { normal: 0, careful: 1, masterpiece: 2 };

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dailyRequest(userId: string, dayKey: string, index: number): CookingDeliveryRequest {
  const seed = hashText(`${userId}:${dayKey}:${index}`);
  if (index === 0) {
    const field = FIELDS[seed % FIELDS.length];
    return {
      id: `daily:${dayKey}:field:${field}`,
      kind: "daily",
      title: `${COOKING_FIELD_NAMES[field]} 분야 식단`,
      targetScore: 100,
      condition: { field, minimumQuality: "normal" },
      rewards: { gold: 35_000, reputation: 4, cookingXp: 80, specialtyXp: 40 },
    };
  }
  if (index === 1) {
    const method = METHODS[seed % METHODS.length];
    return {
      id: `daily:${dayKey}:method:${method}`,
      kind: "daily",
      title: `${COOKING_METHOD_NAMES[method]} 조리 특선`,
      targetScore: 120,
      condition: { method, minimumQuality: "normal" },
      rewards: { gold: 45_000, reputation: 5, cookingXp: 100, specialtyXp: 50 },
    };
  }
  const effectTag = EFFECTS[seed % EFFECTS.length];
  return {
    id: `daily:${dayKey}:effect:${effectTag}`,
    kind: "daily",
    title: "정성 효과식",
    targetScore: 100,
    condition: { effectTag, minimumQuality: "careful" },
    rewards: { gold: 60_000, reputation: 6, cookingXp: 120, specialtyXp: 60 },
  };
}

export function cookingRequests(userId: string, state: CookingStateV2): {
  daily: CookingDeliveryRequest[];
  weekly: CookingDeliveryRequest;
} {
  const daily = [0, 1, 2].map((index) => dailyRequest(userId, state.daily.dayKey, index));
  const field = FIELDS[hashText(`${userId}:${state.weekly.weekKey}`) % FIELDS.length];
  return {
    daily,
    weekly: {
      id: `weekly:${state.weekly.weekKey}:${field}`,
      kind: "weekly",
      title: `${COOKING_FIELD_NAMES[field]} 주간 만찬`,
      targetScore: 600,
      condition: { field, minimumQuality: "careful" },
      rewards: { gold: 350_000, reputation: 30, cookingXp: 700, specialtyXp: 350 },
    },
  };
}

export function cookingDeliveryScore(
  food: CookingFoodDefinition,
  request: CookingDeliveryRequest,
): number {
  const { condition } = request;
  if (condition.field && food.recipe.field !== condition.field) return 0;
  if (condition.method && food.recipe.method !== condition.method) return 0;
  if (condition.effectTag && !food.recipe.effectTags.includes(condition.effectTag)) return 0;
  if (QUALITY_RANK[food.quality] < QUALITY_RANK[condition.minimumQuality]) return 0;
  return Math.round(food.recipe.tier * 10 * food.deliveryScorePct / 100) +
    (food.originator ? 5 : 0) + food.specialtyBonusPct;
}

export function applyCookingDelivery(
  state: CookingStateV2,
  request: CookingDeliveryRequest,
  food: CookingFoodDefinition,
  rawQuantity: number,
): {
  state: CookingStateV2;
  scoreAdded: number;
  completedNow: boolean;
  rewards: CookingDeliveryRewards | null;
} {
  const quantity = Math.floor(Number(rawQuantity) || 0);
  if (quantity < 1 || quantity > 100) throw new Error("invalid_quantity");
  const perDish = cookingDeliveryScore(food, request);
  if (perDish < 1) throw new Error("food_not_eligible");
  if (request.kind === "daily") {
    if (state.daily.completedRequestIds.includes(request.id)) throw new Error("delivery_completed");
    const previous = state.daily.requestScores[request.id] ?? 0;
    const scoreAdded = perDish * quantity;
    const total = previous + scoreAdded;
    const completedNow = total >= request.targetScore;
    return {
      scoreAdded,
      completedNow,
      rewards: completedNow ? request.rewards : null,
      state: {
        ...state,
        xp: state.xp + (completedNow ? request.rewards.cookingXp : 0),
        specialty: state.specialty && completedNow
          ? { ...state.specialty, xp: state.specialty.xp + request.rewards.specialtyXp }
          : state.specialty,
        stats: {
          ...state.stats,
          deliveriesCompleted: state.stats.deliveriesCompleted + (completedNow ? 1 : 0),
        },
        daily: {
          ...state.daily,
          requestScores: { ...state.daily.requestScores, [request.id]: total },
          completedRequestIds: completedNow
            ? [...state.daily.completedRequestIds, request.id]
            : state.daily.completedRequestIds,
        },
      },
    };
  }
  if (state.weekly.completed) throw new Error("delivery_completed");
  const scoreAdded = perDish * quantity;
  const total = state.weekly.requestScore + scoreAdded;
  const completedNow = total >= request.targetScore;
  return {
    scoreAdded,
    completedNow,
    rewards: completedNow ? request.rewards : null,
    state: {
      ...state,
      xp: state.xp + (completedNow ? request.rewards.cookingXp : 0),
      specialty: state.specialty && completedNow
        ? { ...state.specialty, xp: state.specialty.xp + request.rewards.specialtyXp }
        : state.specialty,
      stats: {
        ...state.stats,
        deliveriesCompleted: state.stats.deliveriesCompleted + (completedNow ? 1 : 0),
      },
      weekly: { ...state.weekly, requestScore: total, completed: completedNow },
    },
  };
}

export function cookingStandingDeliveryReward(
  food: CookingFoodDefinition,
  rawQuantity: number,
): number {
  const quantity = Math.floor(Number(rawQuantity) || 0);
  if (quantity < 1 || quantity > COOKING_STANDING_DELIVERY_DAILY_LIMIT) {
    throw new Error("standing_delivery_limit");
  }
  return Math.round(food.recipe.tier * 500 * food.deliveryScorePct / 100) * quantity;
}
