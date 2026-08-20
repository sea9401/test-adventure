import { STORM_ORIGIN_FRAGMENT_MATERIAL_ID } from "./stormExpeditionRewards";
import {
  isTier7CombatJobId,
  TIER7_COMBAT_JOB_PREREQS,
  type Tier7CombatJobId,
} from "./tier7Jobs";

export const TIER7_PREREQUISITE_MASTERY = 100_000;
export const TIER7_FIRST_UNLOCK_LEVEL = 100;
export const TIER7_FIRST_UNLOCK_MATERIAL_ID =
  STORM_ORIGIN_FRAGMENT_MATERIAL_ID;
export const TIER7_FIRST_UNLOCK_MATERIAL_COST = 30;

export type Tier7AdvancementFailure =
  | "tier7_prerequisite_proficiency"
  | "tier7_current_job"
  | "level_too_low"
  | "tier7_material_shortage";

export type Tier7AdvancementStatus = {
  jobId: Tier7CombatJobId;
  permanentlyUnlocked: boolean;
  prerequisiteProgress: readonly [
    { jobId: string; current: number; required: number; met: boolean },
    { jobId: string; current: number; required: number; met: boolean },
  ];
  currentJob: {
    current: string;
    allowed: readonly [string, string];
    met: boolean;
  };
  level: { current: number; required: 100; met: boolean };
  material: { id: string; current: number; required: 30; met: boolean };
  nonLevelRequirementsMet: boolean;
  firstUnlockReady: boolean;
  failure: Tier7AdvancementFailure | null;
};

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function materialCounts(materials: unknown): Record<string, number> {
  if (!materials || typeof materials !== "object" || Array.isArray(materials)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [id, rawCount] of Object.entries(materials)) {
    const count = nonNegativeInteger(rawCount);
    if (count > 0) result[id] = count;
  }
  return result;
}

export function tier7AdvancementStatus(input: {
  targetJobId: string;
  currentJobId: string;
  currentLevel: number;
  jobCumLevel: Readonly<Record<string, number>>;
  jobHistory: readonly string[];
  materials: unknown;
}): Tier7AdvancementStatus | null {
  if (!isTier7CombatJobId(input.targetJobId)) return null;

  const jobId = input.targetJobId;
  const allowed = TIER7_COMBAT_JOB_PREREQS[jobId];
  const prerequisiteProgressFor = (prerequisiteJobId: string) => {
    const current = nonNegativeInteger(input.jobCumLevel[prerequisiteJobId]);
    return {
      jobId: prerequisiteJobId,
      current,
      required: TIER7_PREREQUISITE_MASTERY,
      met: current >= TIER7_PREREQUISITE_MASTERY,
    };
  };
  const prerequisiteProgress: Tier7AdvancementStatus["prerequisiteProgress"] =
    [prerequisiteProgressFor(allowed[0]), prerequisiteProgressFor(allowed[1])];
  const currentLevel = nonNegativeInteger(input.currentLevel);
  const materialCurrent = materialCounts(input.materials)[
    TIER7_FIRST_UNLOCK_MATERIAL_ID
  ] ?? 0;
  const currentJobMet = allowed.includes(input.currentJobId);
  const levelMet = currentLevel >= TIER7_FIRST_UNLOCK_LEVEL;
  const materialMet = materialCurrent >= TIER7_FIRST_UNLOCK_MATERIAL_COST;
  const masteryMet = prerequisiteProgress.every((row) => row.met);
  const permanentlyUnlocked = input.jobHistory.includes(jobId);
  const nonLevelRequirementsMet = masteryMet && currentJobMet && materialMet;
  const firstUnlockReady = nonLevelRequirementsMet && levelMet;

  let failure: Tier7AdvancementFailure | null = null;
  if (!permanentlyUnlocked) {
    if (!masteryMet) failure = "tier7_prerequisite_proficiency";
    else if (!currentJobMet) failure = "tier7_current_job";
    else if (!levelMet) failure = "level_too_low";
    else if (!materialMet) failure = "tier7_material_shortage";
  }

  return {
    jobId,
    permanentlyUnlocked,
    prerequisiteProgress,
    currentJob: {
      current: input.currentJobId,
      allowed,
      met: currentJobMet,
    },
    level: {
      current: currentLevel,
      required: TIER7_FIRST_UNLOCK_LEVEL,
      met: levelMet,
    },
    material: {
      id: TIER7_FIRST_UNLOCK_MATERIAL_ID,
      current: materialCurrent,
      required: TIER7_FIRST_UNLOCK_MATERIAL_COST,
      met: materialMet,
    },
    nonLevelRequirementsMet,
    firstUnlockReady,
    failure,
  };
}

export function spendTier7FirstUnlockMaterial(
  materials: unknown,
  status: Tier7AdvancementStatus,
): Record<string, number> {
  if (status.permanentlyUnlocked || !status.firstUnlockReady) {
    throw new Error("tier 7 first unlock is not ready");
  }
  const next = materialCounts(materials);
  const remaining =
    (next[TIER7_FIRST_UNLOCK_MATERIAL_ID] ?? 0) -
    TIER7_FIRST_UNLOCK_MATERIAL_COST;
  if (remaining < 0) throw new Error("tier 7 first unlock is not ready");
  if (remaining === 0) delete next[TIER7_FIRST_UNLOCK_MATERIAL_ID];
  else next[TIER7_FIRST_UNLOCK_MATERIAL_ID] = remaining;
  return next;
}
