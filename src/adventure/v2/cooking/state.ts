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
import { COOKING_SPECIALTY_CHANGE_COOLDOWN_MS } from "./specialty";
import { parseCookingBranchState, type CookingBranchState } from "./branch";
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
  /** 지금 고르지 않은 분야에 남겨 둔 전문 숙련. 분야를 바꾼 적이 없으면 필드가 없다. */
  specialtyReserve?: Partial<Record<CookingField, number>>;
  /** 마지막으로 전문 분야를 "바꾼" 시각. 처음 고를 때는 두지 않는다. */
  specialtyChangedAt?: number;
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
  /** 요리 특화. 고른 적도 쌓은 숙련도 없으면 필드가 없다. */
  branch?: CookingBranchState;
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

const COOKING_FIELDS: readonly CookingField[] = ["hearth", "pot", "baking", "seafood", "medicinal"];
const SPECIALTY_XP_MAX = 10_000_000;

function parseSpecialty(raw: unknown): CookingSpecialty | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<CookingSpecialty>;
  if (!COOKING_FIELDS.includes(value.field as CookingField)) return null;
  return { field: value.field as CookingField, xp: safeInt(value.xp, SPECIALTY_XP_MAX) };
}

function parseSpecialtyReserve(
  raw: unknown,
  current: CookingField | null,
): Partial<Record<CookingField, number>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const reserve: Partial<Record<CookingField, number>> = {};
  for (const field of COOKING_FIELDS) {
    if (field === current) continue;
    const xp = safeInt((raw as Record<string, unknown>)[field], SPECIALTY_XP_MAX);
    if (xp > 0) reserve[field] = xp;
  }
  return reserve;
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
    typeof id === "string" &&
    COOKING_PUBLIC_RECIPE_BY_ID.has(id) &&
    // 특화 전용 요리는 발견 대상이 아니다. 만들 수 있는지는 특화와 랭크로 판정한다.
    COOKING_PUBLIC_RECIPE_BY_ID.get(id)?.discovery !== "branch",
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
  const specialty = parseSpecialty(source.specialty);
  const specialtyReserve = parseSpecialtyReserve(source.specialtyReserve, specialty?.field ?? null);
  const specialtyChangedAt =
    typeof source.specialtyChangedAt === "number" && Number.isFinite(source.specialtyChangedAt)
      ? source.specialtyChangedAt
      : null;
  const branch = parseCookingBranchState(source.branch, specialty?.field ?? null);
  const hasBranch =
    branch.current !== null ||
    branch.changedAt !== null ||
    Object.keys(branch.xp).length > 0;
  return {
    version: 2,
    levelCurveVersion: normalized.levelCurveVersion,
    xp: normalized.xp,
    discoveredRecipeIds: discovered,
    favoriteRecipeIds,
    researchScore: safeInt(source.researchScore, 100_000_000),
    specialty,
    ...(Object.keys(specialtyReserve).length > 0 ? { specialtyReserve } : {}),
    ...(specialty && specialtyChangedAt !== null ? { specialtyChangedAt } : {}),
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
    ...(hasBranch ? { branch } : {}),
  };
}

/** 전문 분야를 다시 바꿀 수 있는 시각. 바꾼 적이 없으면 null. 지났는지는 호출하는 쪽이 now 와 견준다. */
export function cookingSpecialtyNextChangeAt(state: CookingStateV2): number | null {
  return state.specialtyChangedAt === undefined
    ? null
    : state.specialtyChangedAt + COOKING_SPECIALTY_CHANGE_COOLDOWN_MS;
}

/**
 * 주 전문 분야를 고르거나 바꾼다. 처음 고를 때는 조건(Lv 20·숨은 발견 10종)만 보고 대기가 없다.
 * 바꾸면 쓰던 분야의 숙련은 남겨 두고, 새 분야는 남겨 둔 숙련(없으면 0)에서 이어 가며,
 * 고른 특화는 풀린다(특화 숙련은 남는다).
 */
export function chooseCookingSpecialty(
  state: CookingStateV2,
  field: CookingField,
  now: number,
): CookingStateV2 {
  if (!state.specialty) {
    const hiddenDiscoveries = state.discoveredRecipeIds.filter(
      (id) => COOKING_PUBLIC_RECIPE_BY_ID.get(id)?.discovery !== "basic",
    ).length;
    if (cookingLevelForXp(state.xp) < 20 || hiddenDiscoveries < 10) {
      throw new Error("specialty_locked");
    }
    return { ...state, specialty: { field, xp: 0 } };
  }
  if (state.specialty.field === field) throw new Error("specialty_unchanged");
  const nextChangeAt = cookingSpecialtyNextChangeAt(state);
  if (nextChangeAt !== null && now < nextChangeAt) throw new Error("specialty_cooldown");
  const reserve = { ...state.specialtyReserve };
  const resumedXp = reserve[field] ?? 0;
  delete reserve[field];
  if (state.specialty.xp > 0) reserve[state.specialty.field] = state.specialty.xp;
  const next: CookingStateV2 = {
    ...state,
    specialty: { field, xp: resumedXp },
    specialtyChangedAt: now,
  };
  if (Object.keys(reserve).length > 0) next.specialtyReserve = reserve;
  else delete next.specialtyReserve;
  if (state.branch) next.branch = { ...state.branch, current: null };
  return next;
}
