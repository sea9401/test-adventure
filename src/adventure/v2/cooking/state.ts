import {
  LIFE_LEVEL_CAP,
  LIFE_LEVEL_CURVE_VERSION,
  extendedLifeLevelForXp,
  extendedLifeXpThreshold,
  normalizeLifeXp,
} from "../lifeLevelProgression";
import {
  BASIC_COOKING_RECIPE_IDS,
  COOKING_PUBLIC_RECIPE_BY_ID,
} from "./catalog";
export { cookingSpecialtyRank } from "./specialty";
import type { CookingField } from "./types";
import { COOKING_STANDING_DELIVERY_DAILY_LIMIT } from "./constants";
export { COOKING_STANDING_DELIVERY_DAILY_LIMIT } from "./constants";

export const COOKING_SAVE_KEY = "cooking.v2";
export const LEGACY_COOKING_SAVE_KEY = "cooking.v1";
export const COOKING_LEVEL_CAP = LIFE_LEVEL_CAP;
export const COOKING_XP_SCALE = 10;
export const COOKING_DAILY_REQUEST_COUNT = 3;

export type CookingKitchenItemId =
  | "pantry:salt"
  | "pantry:pepper"
  | "pantry:oil"
  | "pantry:vinegar"
  | "pantry:spice"
  | "pantry:yeast"
  | "processed:flour"
  | "processed:butter"
  | "processed:cheese"
  | "processed:broth"
  | "processed:sauce"
  | "processed:cream";

export type CookingSpecialty = {
  field: CookingField;
  xp: number;
};

export type CookingStateV2 = {
  version: 2;
  levelCurveVersion: number;
  xp: number;
  discoveredRecipeIds: string[];
  favoriteRecipeIds: string[];
  researchScore: number;
  specialty: CookingSpecialty | null;
  kitchenItems: Partial<Record<CookingKitchenItemId, number>>;
  stats: {
    dishesCooked: number;
    researchSuccesses: number;
    researchFailures: number;
    masterpiecesCooked: number;
    deliveriesCompleted: number;
  };
  daily: {
    dayKey: string;
    standingDeliveries: number;
    requestScores: Record<string, number>;
    completedRequestIds: string[];
  };
  weekly: {
    weekKey: string;
    requestScore: number;
    completed: boolean;
  };
  legacy: {
    recallVersion: number;
    tokens: number;
    milestones: number[];
  };
  ingredientReductionRemainderBps?: Record<string, number>;
};

const safeInt = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) =>
  Math.min(maximum, Math.max(0, Math.floor(Number(value) || 0)));

export function cookingDayKey(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function cookingWeekKey(now = Date.now()): string {
  const dateText = cookingDayKey(now);
  const date = new Date(`${dateText}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function emptyCookingState(now = Date.now()): CookingStateV2 {
  return {
    version: 2,
    levelCurveVersion: LIFE_LEVEL_CURVE_VERSION,
    xp: 0,
    discoveredRecipeIds: [...BASIC_COOKING_RECIPE_IDS],
    favoriteRecipeIds: [],
    researchScore: 0,
    specialty: null,
    kitchenItems: {},
    stats: {
      dishesCooked: 0,
      researchSuccesses: 0,
      researchFailures: 0,
      masterpiecesCooked: 0,
      deliveriesCompleted: 0,
    },
    daily: {
      dayKey: cookingDayKey(now),
      standingDeliveries: 0,
      requestScores: {},
      completedRequestIds: [],
    },
    weekly: {
      weekKey: cookingWeekKey(now),
      requestScore: 0,
      completed: false,
    },
    legacy: { recallVersion: 0, tokens: 0, milestones: [] },
  };
}

function legacyCookingLevelXpThreshold(level: number): number {
  const safe = Math.max(1, Math.min(50, Math.floor(level) || 1));
  return (safe - 1) * (safe - 1) * COOKING_XP_SCALE;
}

export function cookingLevelXpThreshold(level: number): number {
  return extendedLifeXpThreshold(level, legacyCookingLevelXpThreshold);
}

export function cookingLevelForXp(xp: number): number {
  return extendedLifeLevelForXp(xp, legacyCookingLevelXpThreshold);
}

function parseSpecialty(raw: unknown): CookingSpecialty | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<CookingSpecialty>;
  if (
    value.field !== "hearth" &&
    value.field !== "pot" &&
    value.field !== "baking" &&
    value.field !== "seafood" &&
    value.field !== "medicinal"
  ) {
    return null;
  }
  return { field: value.field, xp: safeInt(value.xp, 10_000_000) };
}

export function parseCookingState(
  raw: unknown,
  now = Date.now(),
): CookingStateV2 {
  const fallback = emptyCookingState(now);
  const source = raw && typeof raw === "object"
    ? (raw as Partial<CookingStateV2>)
    : {};
  const normalized = normalizeLifeXp({
    xp: safeInt(source.xp),
    levelCurveVersion: safeInt(source.levelCurveVersion) || 1,
    legacyThreshold: legacyCookingLevelXpThreshold,
  });
  const discovered = Array.from(
    new Set([
      ...BASIC_COOKING_RECIPE_IDS,
      ...(Array.isArray(source.discoveredRecipeIds)
        ? source.discoveredRecipeIds
        : []),
    ]),
  ).filter((id): id is string =>
    typeof id === "string" && COOKING_PUBLIC_RECIPE_BY_ID.has(id),
  );
  const favoriteRecipeIds = Array.from(
    new Set(Array.isArray(source.favoriteRecipeIds) ? source.favoriteRecipeIds : []),
  ).filter((id): id is string =>
    typeof id === "string" && discovered.includes(id),
  );
  const kitchenItems = Object.fromEntries(
    Object.entries(source.kitchenItems ?? {}).flatMap(([id, count]) => {
      if (!id.startsWith("pantry:") && !id.startsWith("processed:")) return [];
      const parsed = safeInt(count, 999_999);
      return parsed > 0 ? [[id, parsed]] : [];
    }),
  ) as CookingStateV2["kitchenItems"];
  const dayKey = cookingDayKey(now);
  const sameDay = source.daily?.dayKey === dayKey;
  const weekKey = cookingWeekKey(now);
  const sameWeek = source.weekly?.weekKey === weekKey;
  const requestScores = sameDay
    ? Object.fromEntries(
        Object.entries(source.daily?.requestScores ?? {})
          .slice(0, COOKING_DAILY_REQUEST_COUNT)
          .map(([id, score]) => [id, safeInt(score, 1_000_000)]),
      )
    : {};
  const ingredientReductionRemainderBps = Object.fromEntries(
    Object.entries(source.ingredientReductionRemainderBps ?? {})
      .slice(0, 200)
      .flatMap(([id, value]) => {
        const parsed = safeInt(value, 9_999);
        return id.length <= 100 && parsed > 0 ? [[id, parsed]] : [];
      }),
  );
  return {
    version: 2,
    levelCurveVersion: normalized.levelCurveVersion,
    xp: normalized.xp,
    discoveredRecipeIds: discovered,
    favoriteRecipeIds,
    researchScore: safeInt(source.researchScore, 100_000_000),
    specialty: parseSpecialty(source.specialty),
    kitchenItems,
    stats: {
      dishesCooked: safeInt(source.stats?.dishesCooked),
      researchSuccesses: safeInt(source.stats?.researchSuccesses),
      researchFailures: safeInt(source.stats?.researchFailures),
      masterpiecesCooked: safeInt(source.stats?.masterpiecesCooked),
      deliveriesCompleted: safeInt(source.stats?.deliveriesCompleted),
    },
    daily: sameDay
      ? {
          dayKey,
          standingDeliveries: safeInt(source.daily?.standingDeliveries, COOKING_STANDING_DELIVERY_DAILY_LIMIT),
          requestScores,
          completedRequestIds: Array.from(new Set(source.daily?.completedRequestIds ?? []))
            .filter((id): id is string => typeof id === "string" && id.length <= 100)
            .slice(0, COOKING_DAILY_REQUEST_COUNT),
        }
      : fallback.daily,
    weekly: sameWeek
      ? {
          weekKey,
          requestScore: safeInt(source.weekly?.requestScore, 10_000_000),
          completed: source.weekly?.completed === true,
        }
      : fallback.weekly,
    legacy: {
      recallVersion: safeInt(source.legacy?.recallVersion, 1),
      tokens: safeInt(source.legacy?.tokens, 100),
      milestones: Array.from(new Set(source.legacy?.milestones ?? []))
        .map((value) => safeInt(value))
        .filter((value) => value === 10 || value === 25 || value === 45),
    },
    ...(Object.keys(ingredientReductionRemainderBps).length > 0
      ? { ingredientReductionRemainderBps }
      : {}),
  };
}

export function chooseCookingSpecialty(
  state: CookingStateV2,
  field: CookingField,
): CookingStateV2 {
  if (state.specialty) throw new Error("specialty_permanent");
  const hiddenDiscoveries = state.discoveredRecipeIds.filter(
    (id) => COOKING_PUBLIC_RECIPE_BY_ID.get(id)?.discovery !== "basic",
  ).length;
  if (cookingLevelForXp(state.xp) < 20 || hiddenDiscoveries < 10) {
    throw new Error("specialty_locked");
  }
  return { ...state, specialty: { field, xp: 0 } };
}
