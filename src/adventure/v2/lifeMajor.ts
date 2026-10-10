// 생활 전공과 명장 단계 — Lv.100 이후 고른 생활만 더 깊게 성장한다.
// 주전공 1 + 부전공 1. 전공 생활에서 Lv.100 상한을 넘겨 버려지던 경험치를 명장 경험치로 받고,
// 단계에 따라 효율 보너스와 명장 산물(거래 가능 재료) 확률을 준다. 고르지 않은 생활은 불이익 없음.

import { cookingLevelXpThreshold } from "./cooking/state";
import { farmingLevelXpThreshold } from "./farm";
import { fishingLevelXpThreshold } from "./fishingProgression";
import { LIFE_LEVEL_CAP } from "./lifeLevelProgression";
import { miningXpForLevel } from "./miningProgression";
import { woodcuttingXpForLevel } from "./woodcuttingProgression";

import type { CookingField } from "./cooking/types";
import { LIFE_MAJOR_PRODUCT_ID, LIFE_MAJOR_PRODUCTS, TEMPERING_CATALYST } from "./lifeMajorProducts";

export {
  TEMPERING_CATALYST,
  LIFE_MAJOR_PRODUCT_ID,
  LIFE_MAJOR_PRODUCTS,
  type LifeMajorProductActivity,
} from "./lifeMajorProducts";

export const LIFE_MAJOR_SAVE_KEY = "life-major.v1";
export const LIFE_MAJOR_MAX_STAGE = 10;
export const LIFE_MAJOR_CHANGE_COOLDOWN_MS = 30 * 86_400_000;
export const LIFE_MAJOR_MAJOR_BONUS_PER_STAGE = 1;
export const LIFE_MAJOR_MINOR_FACTOR = 0.5;
export const LIFE_MAJOR_PRODUCT_BASE_PCT = 0.5;
export const LIFE_MAJOR_PRODUCT_PER_STAGE_PCT = 0.15;
/** 명장 제작(명장 요리·단련 촉매)에 필요한 주전공 명장 단계. */
export const LIFE_MAJOR_CRAFT_MIN_STAGE = 3;

export const LIFE_MAJOR_ACTIVITIES = [
  "farming",
  "woodcutting",
  "mining",
  "fishing",
  "cooking",
] as const;

export type LifeMajorActivity = (typeof LIFE_MAJOR_ACTIVITIES)[number];

export const LIFE_MAJOR_ACTIVITY_NAME: Record<LifeMajorActivity, string> = {
  farming: "농사",
  woodcutting: "벌목",
  mining: "채광",
  fishing: "낚시",
  cooking: "요리",
};

/** 효율 보너스가 붙는 생활별 주력 수치(표시용). */
export const LIFE_MAJOR_EFFECT_LABEL: Record<LifeMajorActivity, { label: string; unit: "%" | "%p" }> = {
  farming: { label: "수확량", unit: "%" },
  woodcutting: { label: "추가 원목 확률", unit: "%p" },
  mining: { label: "추가 광석 확률", unit: "%p" },
  fishing: { label: "특수 어종 가중치", unit: "%p" },
  cooking: { label: "걸작 확률", unit: "%p" },
};

export type LifeMajorState = {
  version: 1;
  major: LifeMajorActivity | null;
  minor: LifeMajorActivity | null;
  lastChangedAt: number | null;
  masteryXp: Partial<Record<LifeMajorActivity, number>>;
  masterProductsEarned: Partial<Record<LifeMajorActivity, number>>;
};

const ACTIVITY_SET = new Set<string>(LIFE_MAJOR_ACTIVITIES);

export function isLifeMajorActivity(value: unknown): value is LifeMajorActivity {
  return typeof value === "string" && ACTIVITY_SET.has(value);
}

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function activityCounts(value: unknown): Partial<Record<LifeMajorActivity, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const counts: Partial<Record<LifeMajorActivity, number>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isLifeMajorActivity(key)) continue;
    const count = nonNegativeInt(raw);
    if (count > 0) counts[key] = count;
  }
  return counts;
}

export function parseLifeMajorState(raw: unknown): LifeMajorState {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const major = isLifeMajorActivity(value.major) ? value.major : null;
  const minorRaw = isLifeMajorActivity(value.minor) ? value.minor : null;
  const lastChangedAt =
    typeof value.lastChangedAt === "number" && Number.isFinite(value.lastChangedAt)
      ? value.lastChangedAt
      : null;
  return {
    version: 1,
    major,
    minor: minorRaw && minorRaw !== major ? minorRaw : null,
    lastChangedAt,
    masteryXp: activityCounts(value.masteryXp),
    masterProductsEarned: activityCounts(value.masterProductsEarned),
  };
}

const T100: Record<LifeMajorActivity, () => number> = {
  farming: () => farmingLevelXpThreshold(LIFE_LEVEL_CAP),
  woodcutting: () => woodcuttingXpForLevel(LIFE_LEVEL_CAP),
  mining: () => miningXpForLevel(LIFE_LEVEL_CAP),
  fishing: () => fishingLevelXpThreshold(LIFE_LEVEL_CAP),
  cooking: () => cookingLevelXpThreshold(LIFE_LEVEL_CAP),
};

export function lifeMajorT100(activity: LifeMajorActivity): number {
  return T100[activity]();
}

/** 단계 k 누적 요구치 M(k) = round(T100 × k(k+1) / 110). M(10) = T100. */
export function lifeMajorStageXp(activity: LifeMajorActivity, stage: number): number {
  const k = Math.max(0, Math.min(LIFE_MAJOR_MAX_STAGE, Math.floor(stage)));
  return Math.round((lifeMajorT100(activity) * k * (k + 1)) / 110);
}

export function lifeMajorStageForXp(
  activity: LifeMajorActivity,
  xp: number,
): { stage: number; xpInto: number; xpForNext: number; capped: boolean } {
  const safeXp = nonNegativeInt(xp);
  let stage = 0;
  while (stage < LIFE_MAJOR_MAX_STAGE && lifeMajorStageXp(activity, stage + 1) <= safeXp) {
    stage += 1;
  }
  if (stage >= LIFE_MAJOR_MAX_STAGE) {
    return { stage, xpInto: 0, xpForNext: 0, capped: true };
  }
  const start = lifeMajorStageXp(activity, stage);
  return {
    stage,
    xpInto: safeXp - start,
    xpForNext: lifeMajorStageXp(activity, stage + 1) - start,
    capped: false,
  };
}

export function lifeMajorRole(
  state: LifeMajorState,
  activity: LifeMajorActivity,
): "major" | "minor" | null {
  if (state.major === activity) return "major";
  if (state.minor === activity) return "minor";
  return null;
}

export function lifeMajorStage(state: LifeMajorState, activity: LifeMajorActivity): number {
  return lifeMajorStageForXp(activity, state.masteryXp[activity] ?? 0).stage;
}

function roleFactor(role: "major" | "minor" | null): number {
  return role === "major" ? 1 : role === "minor" ? LIFE_MAJOR_MINOR_FACTOR : 0;
}

export function lifeMajorBonusPct(state: LifeMajorState, activity: LifeMajorActivity): number {
  const factor = roleFactor(lifeMajorRole(state, activity));
  return factor * LIFE_MAJOR_MAJOR_BONUS_PER_STAGE * lifeMajorStage(state, activity);
}

export function lifeMajorProductChancePct(
  state: LifeMajorState,
  activity: LifeMajorActivity,
): number {
  if (activity === "cooking") return 0;
  const factor = roleFactor(lifeMajorRole(state, activity));
  if (factor === 0) return 0;
  return (
    factor *
    (LIFE_MAJOR_PRODUCT_BASE_PCT + LIFE_MAJOR_PRODUCT_PER_STAGE_PCT * lifeMajorStage(state, activity))
  );
}

/** Lv.100 상한 때문에 반영되지 못한 경험치 = 획득량 − 실제 증가량. */
export function lifeXpOverflow({
  gained,
  before,
  after,
}: {
  gained: number;
  before: number;
  after: number;
}): number {
  return Math.max(0, nonNegativeInt(gained) - Math.max(0, after - before));
}

export function addLifeMajorXp(
  state: LifeMajorState,
  activity: LifeMajorActivity,
  overflowXp: number,
): { state: LifeMajorState; gained: number } {
  const amount = nonNegativeInt(overflowXp);
  if (amount <= 0 || lifeMajorRole(state, activity) === null) return { state, gained: 0 };
  const current = state.masteryXp[activity] ?? 0;
  const next = Math.min(lifeMajorStageXp(activity, LIFE_MAJOR_MAX_STAGE), current + amount);
  if (next === current) return { state, gained: 0 };
  return {
    state: { ...state, masteryXp: { ...state.masteryXp, [activity]: next } },
    gained: next - current,
  };
}

export type LifeMajorAssignError =
  | "invalid_activity"
  | "not_level_100"
  | "same_activity"
  | "major_required"
  | "change_cooldown";

export function lifeMajorNextChangeAt(state: LifeMajorState): number | null {
  return state.lastChangedAt === null ? null : state.lastChangedAt + LIFE_MAJOR_CHANGE_COOLDOWN_MS;
}

export function assignLifeMajors(
  state: LifeMajorState,
  request: { major: unknown; minor: unknown },
  levels: Record<LifeMajorActivity, number>,
  now: number,
): { state: LifeMajorState } | { error: LifeMajorAssignError } {
  const { major, minor } = request;
  if ((major !== null && !isLifeMajorActivity(major)) || (minor !== null && !isLifeMajorActivity(minor))) {
    return { error: "invalid_activity" };
  }
  if (major === null && minor !== null) return { error: "major_required" };
  if (major !== null && major === minor) return { error: "same_activity" };
  for (const activity of [major, minor]) {
    if (activity !== null && (levels[activity] ?? 0) < LIFE_LEVEL_CAP) {
      return { error: "not_level_100" };
    }
  }
  // 처음 채우기(null → 값)는 무료. 기존 값을 바꾸거나 비우면 변경.
  const isChange = (previous: LifeMajorActivity | null, next: LifeMajorActivity | null) =>
    previous !== null && previous !== next;
  const changed = isChange(state.major, major) || isChange(state.minor, minor);
  if (major === state.major && minor === state.minor) return { state };
  if (changed) {
    const nextChangeAt = lifeMajorNextChangeAt(state);
    if (nextChangeAt !== null && now < nextChangeAt) return { error: "change_cooldown" };
  }
  return {
    state: {
      ...state,
      major,
      minor,
      lastChangedAt: changed ? now : state.lastChangedAt,
    },
  };
}

export type LifeMajorActivityView = {
  id: LifeMajorActivity;
  name: string;
  level: number;
  eligible: boolean;
  role: "major" | "minor" | null;
  masteryXp: number;
  stage: number;
  stageXpInto: number;
  stageXpForNext: number;
  capped: boolean;
  effectText: string | null;
  productName: string | null;
  productChancePct: number;
};

export type LifeMajorCraftingView = {
  catalystUnlocked: boolean;
  requiredStage: number;
  alloy: number;
  wood: number;
  catalysts: number;
};

export type LifeMajorView = {
  major: LifeMajorActivity | null;
  minor: LifeMajorActivity | null;
  nextChangeAt: number | null;
  activities: LifeMajorActivityView[];
  crafting: LifeMajorCraftingView;
};

function formatPct(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function lifeMajorView(
  state: LifeMajorState,
  levels: Record<LifeMajorActivity, number>,
  materials: Record<string, unknown> = {},
): LifeMajorView {
  const held = (id: string) => nonNegativeInt(materials[id]);
  return {
    crafting: {
      catalystUnlocked: lifeMajorCanCraft(state, "mining"),
      requiredStage: LIFE_MAJOR_CRAFT_MIN_STAGE,
      alloy: held(LIFE_MAJOR_PRODUCT_ID.mining),
      wood: held(LIFE_MAJOR_PRODUCT_ID.woodcutting),
      catalysts: held(TEMPERING_CATALYST.id),
    },
    major: state.major,
    minor: state.minor,
    nextChangeAt: lifeMajorNextChangeAt(state),
    activities: LIFE_MAJOR_ACTIVITIES.map((id) => {
      const progress = lifeMajorStageForXp(id, state.masteryXp[id] ?? 0);
      const role = lifeMajorRole(state, id);
      const bonus = lifeMajorBonusPct(state, id);
      const effect = LIFE_MAJOR_EFFECT_LABEL[id];
      return {
        id,
        name: LIFE_MAJOR_ACTIVITY_NAME[id],
        level: levels[id] ?? 1,
        eligible: (levels[id] ?? 1) >= LIFE_LEVEL_CAP,
        role,
        masteryXp: state.masteryXp[id] ?? 0,
        stage: progress.stage,
        stageXpInto: progress.xpInto,
        stageXpForNext: progress.xpForNext,
        capped: progress.capped,
        effectText: role && bonus > 0 ? `${effect.label} +${formatPct(bonus)}${effect.unit}` : null,
        productName: id === "cooking" ? null : LIFE_MAJOR_PRODUCTS[id].name,
        productChancePct: lifeMajorProductChancePct(state, id),
      };
    }),
  };
}

/** 명장 제작은 주전공 명장 3단계 이상만 할 수 있다(부전공 불가). */
export function lifeMajorCanCraft(state: LifeMajorState, activity: LifeMajorActivity): boolean {
  return state.major === activity && lifeMajorStage(state, activity) >= LIFE_MAJOR_CRAFT_MIN_STAGE;
}

/** 명장 요리에 쓰는 명장 산물 — 해산물 분야는 명장 어획, 그 밖은 명장 작물. */
export function signatureIngredientFor(field: CookingField): string {
  return field === "seafood" ? LIFE_MAJOR_PRODUCT_ID.fishing : LIFE_MAJOR_PRODUCT_ID.farming;
}
