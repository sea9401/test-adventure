import { hash32 } from "./hash";
import {
  FISHING_SPOT_IDS,
  type FishingSpotId,
} from "./fishingSpots";
import {
  WOODCUTTING_SPOT_IDS,
  type WoodcuttingSpotId,
} from "./woodcuttingSpots";
import {
  MINING_SPOT_IDS,
  type MiningSpotId,
} from "./miningSpots";
import { KST_OFFSET_MS, kstDayKey } from "@/lib/kst";

export const LIFE_FIELD_DAY_MS = 24 * 60 * 60 * 1_000;

export type LifeFieldActivity = "fishing" | "woodcutting" | "mining";
export type LifeFieldSpotId = FishingSpotId | WoodcuttingSpotId | MiningSpotId;

export type LifeFieldEnvironmentId =
  | "fishing_active_school"
  | "fishing_calm_water"
  | "fishing_feeding_time"
  | "woodcutting_dense_growth"
  | "woodcutting_clear_path"
  | "woodcutting_clear_rings"
  | "mining_exposed_vein"
  | "mining_stable_rock"
  | "mining_crystal_resonance";

export type LifeFieldEnvironmentEffect = {
  rareTierWeightMultiplier?: number;
  xpBonusPct?: number;
  waitReductionPct?: number;
  primaryBonusChance?: number;
  durationReductionPct?: number;
  byproductMultiplier?: number;
};

export type LifeFieldEnvironment = {
  id: LifeFieldEnvironmentId;
  activity: LifeFieldActivity;
  label: string;
  description: string;
  effectLabel: string;
  effect: LifeFieldEnvironmentEffect;
};

export const LIFE_FIELD_ENVIRONMENTS: Record<
  LifeFieldEnvironmentId,
  LifeFieldEnvironment
> = {
  fishing_active_school: {
    id: "fishing_active_school",
    activity: "fishing",
    label: "활발한 어군",
    description: "평소보다 희귀한 어종의 움직임이 활발합니다.",
    effectLabel: "희귀 이상 티어 가중치 ×1.08",
    effect: { rareTierWeightMultiplier: 1.08 },
  },
  fishing_calm_water: {
    id: "fishing_calm_water",
    activity: "fishing",
    label: "잔잔한 수면",
    description: "수면이 잔잔해 물길을 읽고 경험을 쌓기 좋습니다.",
    effectLabel: "낚시 경험치 +8%",
    effect: { xpBonusPct: 8 },
  },
  fishing_feeding_time: {
    id: "fishing_feeding_time",
    activity: "fishing",
    label: "왕성한 먹이 활동",
    description: "물고기의 먹이 활동이 활발해 입질이 빨라집니다.",
    effectLabel: "입질 대기시간 -5%",
    effect: { waitReductionPct: 5 },
  },
  woodcutting_dense_growth: {
    id: "woodcutting_dense_growth",
    activity: "woodcutting",
    label: "울창한 성장",
    description: "나무가 빽빽하게 자라 추가 원목을 얻을 기회가 생깁니다.",
    effectLabel: "주 목재 추가 획득 확률 5%",
    effect: { primaryBonusChance: 0.05 },
  },
  woodcutting_clear_path: {
    id: "woodcutting_clear_path",
    activity: "woodcutting",
    label: "맑은 작업로",
    description: "작업 동선이 정리되어 벌목 시간이 짧아집니다.",
    effectLabel: "작업 시간 -5%",
    effect: { durationReductionPct: 5 },
  },
  woodcutting_clear_rings: {
    id: "woodcutting_clear_rings",
    activity: "woodcutting",
    label: "선명한 나이테",
    description: "나이테가 선명해 숲을 이해하고 경험을 쌓기 좋습니다.",
    effectLabel: "벌목 경험치 +8%",
    effect: { xpBonusPct: 8 },
  },
  mining_exposed_vein: {
    id: "mining_exposed_vein",
    activity: "mining",
    label: "드러난 광맥",
    description: "광맥 일부가 드러나 추가 광석을 얻을 기회가 생깁니다.",
    effectLabel: "주 광석 추가 획득 확률 5%",
    effect: { primaryBonusChance: 0.05 },
  },
  mining_stable_rock: {
    id: "mining_stable_rock",
    activity: "mining",
    label: "안정된 암반",
    description: "암반이 안정되어 채광 작업을 빠르게 진행할 수 있습니다.",
    effectLabel: "작업 시간 -5%",
    effect: { durationReductionPct: 5 },
  },
  mining_crystal_resonance: {
    id: "mining_crystal_resonance",
    activity: "mining",
    label: "결정의 울림",
    description: "광맥 안쪽의 결정이 울려 부산물을 찾기 쉬워집니다.",
    effectLabel: "부산물 획득 확률 ×1.10",
    effect: { byproductMultiplier: 1.1 },
  },
};

export const LIFE_FIELD_ENVIRONMENT_IDS: Record<
  LifeFieldActivity,
  readonly LifeFieldEnvironmentId[]
> = {
  fishing: [
    "fishing_active_school",
    "fishing_calm_water",
    "fishing_feeding_time",
  ],
  woodcutting: [
    "woodcutting_dense_growth",
    "woodcutting_clear_path",
    "woodcutting_clear_rings",
  ],
  mining: [
    "mining_exposed_vein",
    "mining_stable_rock",
    "mining_crystal_resonance",
  ],
};

export function isLifeFieldEnvironmentId(
  value: unknown,
): value is LifeFieldEnvironmentId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(LIFE_FIELD_ENVIRONMENTS, value)
  );
}

export const LIFE_FIELD_SPOT_IDS: Record<
  LifeFieldActivity,
  readonly LifeFieldSpotId[]
> = {
  fishing: FISHING_SPOT_IDS,
  woodcutting: WOODCUTTING_SPOT_IDS,
  mining: MINING_SPOT_IDS,
};

export function lifeFieldActivityForSpot(
  spotId: string,
): LifeFieldActivity | null {
  for (const activity of Object.keys(LIFE_FIELD_SPOT_IDS) as LifeFieldActivity[]) {
    if ((LIFE_FIELD_SPOT_IDS[activity] as readonly string[]).includes(spotId)) {
      return activity;
    }
  }
  return null;
}

export function lifeFieldDayIndex(nowMs: number): number {
  return Math.floor((nowMs + KST_OFFSET_MS) / LIFE_FIELD_DAY_MS);
}

export function lifeFieldDayKey(nowMs: number): string {
  return kstDayKey(new Date(nowMs));
}

export function lifeFieldDayEndsAt(nowMs: number): number {
  return (lifeFieldDayIndex(nowMs) + 1) * LIFE_FIELD_DAY_MS - KST_OFFSET_MS;
}

function fixedSpotOrder(activity: LifeFieldActivity): LifeFieldSpotId[] {
  const spots = [...LIFE_FIELD_SPOT_IDS[activity]];
  for (let index = spots.length - 1; index > 0; index -= 1) {
    const target = hash32(`life-field:spots:${activity}:${index}`) % (index + 1);
    [spots[index], spots[target]] = [spots[target], spots[index]];
  }
  return spots;
}

function dailyEnvironmentOffset(activity: LifeFieldActivity, dayIndex: number) {
  const block = Math.floor(dayIndex / 3);
  const position = ((dayIndex % 3) + 3) % 3;
  const forward = hash32(`life-field:block:${activity}:${block}`) % 2 === 0;
  return (forward ? [0, 1, 2] : [0, 2, 1])[position];
}

export function lifeFieldEnvironmentAssignments(
  activity: LifeFieldActivity,
  nowMs: number,
): Record<string, LifeFieldEnvironmentId> {
  const environments = LIFE_FIELD_ENVIRONMENT_IDS[activity];
  const offset = dailyEnvironmentOffset(activity, lifeFieldDayIndex(nowMs));
  return Object.fromEntries(
    fixedSpotOrder(activity).map((spotId, index) => [
      spotId,
      environments[(index % environments.length + offset) % environments.length],
    ]),
  );
}

export function lifeFieldEnvironmentForSpot(
  activity: LifeFieldActivity,
  spotId: string,
  nowMs: number,
): LifeFieldEnvironment {
  const id = lifeFieldEnvironmentAssignments(activity, nowMs)[spotId];
  const fallbackId = LIFE_FIELD_ENVIRONMENT_IDS[activity][0];
  return LIFE_FIELD_ENVIRONMENTS[id ?? fallbackId];
}

export type LifeFieldEnvironmentSnapshot = {
  activity: LifeFieldActivity;
  spotId: string;
  dayKey: string;
  startsAt: number;
  endsAt: number;
  environment: LifeFieldEnvironment;
};

export function lifeFieldEnvironmentSnapshot(
  activity: LifeFieldActivity,
  spotId: string,
  nowMs: number,
): LifeFieldEnvironmentSnapshot {
  const dayIndex = lifeFieldDayIndex(nowMs);
  return {
    activity,
    spotId,
    dayKey: lifeFieldDayKey(nowMs),
    startsAt: dayIndex * LIFE_FIELD_DAY_MS - KST_OFFSET_MS,
    endsAt: (dayIndex + 1) * LIFE_FIELD_DAY_MS - KST_OFFSET_MS,
    environment: lifeFieldEnvironmentForSpot(activity, spotId, nowMs),
  };
}

export function lifeFieldEnvironmentForecast(
  activity: LifeFieldActivity,
  spotId: string,
  nowMs: number,
): LifeFieldEnvironmentSnapshot {
  return lifeFieldEnvironmentSnapshot(
    activity,
    spotId,
    lifeFieldDayEndsAt(nowMs) + 1,
  );
}

export function applyLifeFieldDurationReduction(
  baseDurationMs: number,
  currentDurationMs: number,
  reductionPct: number,
): number {
  const safeBase = Math.max(1_000, Math.floor(Number(baseDurationMs) || 1_000));
  const safeCurrent = Math.max(
    1_000,
    Math.floor(Number(currentDurationMs) || safeBase),
  );
  const pct = Math.min(100, Math.max(0, Number(reductionPct) || 0));
  return Math.max(
    1_000,
    Math.round(
      Math.max(safeBase * 0.4, safeCurrent * (1 - pct / 100)) / 100,
    ) * 100,
  );
}

export function lifeFieldXpBonus(
  baseXp: number,
  bonusPct: number,
  roll = 1,
): number {
  const expected =
    Math.max(0, Number(baseXp) || 0) *
    (Math.max(0, Number(bonusPct) || 0) / 100);
  const whole = Math.floor(expected);
  return whole + (Math.max(0, Math.min(1, roll)) < expected - whole ? 1 : 0);
}
