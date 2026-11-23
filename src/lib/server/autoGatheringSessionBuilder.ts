// 자동 채집 세션을 만드는 계산. 바로 시작할 때와 예약한 작업이 이어서 시작될 때 같은 계산을 쓴다.
// `now`는 작업이 시작한 것으로 보는 시각이다. 예약 작업은 앞 작업이 끝난 시각을 넘긴다.

import { randomUUID } from "node:crypto";
import {
  MINING_MATERIALS,
  MINING_NODES,
  isMiningSpotId,
  type MiningSpotId,
} from "@/adventure/data/v2/miningSpots";
import {
  WOODCUTTING_MATERIALS,
  WOODCUTTING_TREES,
  isWoodcuttingSpotId,
  type WoodcuttingSpotId,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  applyLifeFieldDurationReduction,
  lifeFieldEnvironmentSnapshot,
} from "@/adventure/data/v2/lifeFieldEnvironment";
import {
  equippedMiningBonuses,
  equippedWoodcuttingBonuses,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  autoGatheringPlan,
  createAutoGatheringSession,
  type AutoGatheringActivity,
  type AutoGatheringPlanId,
  type AutoGatheringSession,
} from "@/adventure/v2/autoGathering";
import {
  gatheringSiteExtendedDurationMs,
  gatheringSiteStage,
  type GatheringSiteId,
} from "@/adventure/v2/gatheringSiteUpkeep";
import { lifeFestivalBonus } from "@/adventure/v2/lifeFestival";
import { lifeAidSpec } from "@/adventure/v2/lifeCrafting";
import {
  miningPost50Bonuses,
  woodcuttingPost50Bonuses,
} from "@/adventure/v2/lifeLevelBonuses";
import { lifeMajorBonusPct } from "@/adventure/v2/lifeMajor";
import {
  LIFE_TOOL_BONUS_MATERIAL_PCT,
  LIFE_TOOL_DURATION_REDUCTION_PCT,
  LIFE_WORKSHOP_SAVE_KEY,
  lifeGatheringBonusPct,
  parseLifeWorkshopState,
} from "@/adventure/v2/lifeWorkshop";
import { MINING_SETTLE_MS } from "@/adventure/v2/miningAnimation";
import {
  miningDurationWithPassive,
  miningFailureRate,
  miningProgressionView,
} from "@/adventure/v2/miningProgression";
import {
  MINING_LOG_KEY,
  parseMiningLog,
  pickMiningNodeId,
} from "@/adventure/v2/miningSession";
import { WOODCUTTING_TREE_FALL_MS } from "@/adventure/v2/woodcuttingAnimation";
import {
  woodcuttingDurationWithPassive,
  woodcuttingFailureRate,
  woodcuttingProgressionView,
} from "@/adventure/v2/woodcuttingProgression";
import {
  WOODCUTTING_LOG_KEY,
  parseWoodcuttingLog,
  pickWoodcuttingTreeId,
} from "@/adventure/v2/woodcuttingSession";
import { readLifeMajorState } from "@/lib/server/lifeMajor";
import { readLifeFieldFeatureSettings } from "@/lib/server/opsSettings";
import { readSave, type DbExecutor } from "@/lib/server/savesKv";

export type AutoGatheringBuildArgs = {
  planId?: AutoGatheringPlanId;
  /** 작업이 시작한 것으로 보는 시각. */
  now: number;
  /** 굳혀 둔 느긋한 작업 시간. 없으면 지금의 채집지 정비 단계로 정한다. */
  extendedDurationMs?: number;
};

export type BuiltAutoGatheringSession = {
  session: AutoGatheringSession;
  materialName: string;
  lifeEnvironment: ReturnType<typeof lifeFieldEnvironmentSnapshot> | null;
};

export type AutoGatheringSource = {
  sourceId: GatheringSiteId;
  sourceName: string;
};

/** 채집지 id가 그 활동의 것이면 거기서 캐는 대상(나무·광맥)을 돌려준다. */
export function autoGatheringSource(
  activity: AutoGatheringActivity,
  spotId: unknown,
): AutoGatheringSource | null {
  if (typeof spotId !== "string") return null;
  if (activity === "mining") {
    if (!isMiningSpotId(spotId)) return null;
    const node = MINING_NODES[pickMiningNodeId(spotId)];
    return { sourceId: node.id, sourceName: node.name };
  }
  if (!isWoodcuttingSpotId(spotId)) return null;
  const tree = WOODCUTTING_TREES[pickWoodcuttingTreeId(spotId)];
  return { sourceId: tree.id, sourceName: tree.name };
}

/** 지금의 정비 단계로 본 그 채집지의 작업 시간. 예약할 때 이 값을 굳힌다. */
export async function autoGatheringPlannedDurationMs(
  executor: DbExecutor,
  userId: string,
  sourceId: GatheringSiteId,
  planId: AutoGatheringPlanId,
): Promise<number> {
  if (planId !== "extended") return autoGatheringPlan(planId).durationMs;
  const workshop = parseLifeWorkshopState(
    await readSave(executor, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
  );
  return gatheringSiteExtendedDurationMs(
    gatheringSiteStage(workshop.siteUpkeep ?? {}, sourceId),
  );
}

export async function buildMiningAutoSession(
  executor: DbExecutor,
  userId: string,
  spotId: MiningSpotId,
  args: AutoGatheringBuildArgs,
): Promise<BuiltAutoGatheringSession> {
  const { now } = args;
  const [logRaw, skillsRaw, workshopRaw, lifeFeatures, lifeMajor] = await Promise.all([
    readSave(executor, userId, MINING_LOG_KEY, {}),
    readSave(executor, userId, "skills.v2", {}),
    readSave(executor, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
    readLifeFieldFeatureSettings(executor),
    readLifeMajorState(executor, userId),
  ]);
  const nodeId = pickMiningNodeId(spotId);
  const node = MINING_NODES[nodeId];
  const parsedLog = parseMiningLog(logRaw);
  const progression = miningProgressionView(parsedLog.successes, parsedLog.xp);
  const levelBonuses = miningPost50Bonuses(progression.level);
  const bonuses = equippedMiningBonuses(parseV2SkillsState(skillsRaw).equipped);
  const workshop = parseLifeWorkshopState(workshopRaw);
  const toolTier = workshop.tools.mining;
  const activeAid = workshop.crafting.activeAids.mining;
  const aidSpec = activeAid?.enabled ? lifeAidSpec(activeAid.itemId) : null;
  const aidApplies = Boolean(
    aidSpec && node.grade >= aidSpec.gradeMin && node.grade <= aidSpec.gradeMax,
  );
  const durationReductionPct =
    bonuses.durationReductionPct + LIFE_TOOL_DURATION_REDUCTION_PCT[toolTier];
  const bonusMaterialRate = Math.min(
    1,
    (bonuses.bonusOreChancePct +
      LIFE_TOOL_BONUS_MATERIAL_PCT[toolTier] +
      lifeGatheringBonusPct("mining", workshop, progression.level) +
      levelBonuses.bonusOreChancePct +
      lifeFestivalBonus("mining", new Date(now)).chancePct +
      lifeMajorBonusPct(lifeMajor, "mining")) /
      100,
  );
  const baseCycleDurationMs = miningDurationWithPassive(
    node.durationMs,
    progression.level,
    durationReductionPct,
  );
  const lifeEnvironment = lifeFeatures.environmentEnabled
    ? lifeFieldEnvironmentSnapshot("mining", spotId, now)
    : null;
  const cycleDurationMs = applyLifeFieldDurationReduction(
    node.durationMs,
    baseCycleDurationMs,
    lifeEnvironment?.environment.effect.durationReductionPct ?? 0,
  );
  const failureRate =
    miningFailureRate(node.baseFailureRate, progression.level) *
    (1 - bonuses.failureReductionPct / 100);
  const successRate = 1 - failureRate * (1 - bonuses.failureRecoveryPct / 100);
  const session = createAutoGatheringSession({
    sessionId: randomUUID(),
    sourceId: nodeId,
    sourceName: node.name,
    materialId: node.materialId,
    planId: args.planId,
    extendedDurationMs:
      args.extendedDurationMs ??
      gatheringSiteExtendedDurationMs(
        gatheringSiteStage(workshop.siteUpkeep ?? {}, nodeId),
      ),
    now,
    cycleDurationMs: cycleDurationMs + MINING_SETTLE_MS,
    successRate,
    bonusMaterialRate,
    baseXp: node.xp,
    aidItemId: aidApplies ? activeAid?.itemId : undefined,
    aidBonusMaterialRate: aidApplies ? (aidSpec?.bonusPct ?? 0) / 100 : 0,
    aidByproductMultiplier: aidApplies ? aidSpec?.byproductMultiplier ?? 1 : 1,
    spotId,
    lifeEnvironmentId: lifeEnvironment?.environment.id,
    lifeEnvironmentDayKey: lifeEnvironment?.dayKey,
    environmentPrimaryBonusChance:
      lifeEnvironment?.environment.effect.primaryBonusChance,
    environmentXpBonusPct: lifeEnvironment?.environment.effect.xpBonusPct,
    environmentByproductMultiplier:
      lifeEnvironment?.environment.effect.byproductMultiplier,
  });
  return {
    session,
    materialName: MINING_MATERIALS[node.materialId].name,
    lifeEnvironment,
  };
}

export async function buildWoodcuttingAutoSession(
  executor: DbExecutor,
  userId: string,
  spotId: WoodcuttingSpotId,
  args: AutoGatheringBuildArgs,
): Promise<BuiltAutoGatheringSession> {
  const { now } = args;
  const [logRaw, skillsRaw, workshopRaw, lifeFeatures, lifeMajor] = await Promise.all([
    readSave(executor, userId, WOODCUTTING_LOG_KEY, {}),
    readSave(executor, userId, "skills.v2", {}),
    readSave(executor, userId, LIFE_WORKSHOP_SAVE_KEY, {}),
    readLifeFieldFeatureSettings(executor),
    readLifeMajorState(executor, userId),
  ]);
  const treeId = pickWoodcuttingTreeId(spotId);
  const tree = WOODCUTTING_TREES[treeId];
  const parsedLog = parseWoodcuttingLog(logRaw);
  const progression = woodcuttingProgressionView(parsedLog.cuts, parsedLog.xp);
  const levelBonuses = woodcuttingPost50Bonuses(progression.level);
  const bonuses = equippedWoodcuttingBonuses(
    parseV2SkillsState(skillsRaw).equipped,
  );
  const workshop = parseLifeWorkshopState(workshopRaw);
  const toolTier = workshop.tools.woodcutting;
  const activeAid = workshop.crafting.activeAids.woodcutting;
  const aidSpec = activeAid?.enabled ? lifeAidSpec(activeAid.itemId) : null;
  const aidApplies = Boolean(
    aidSpec && tree.grade >= aidSpec.gradeMin && tree.grade <= aidSpec.gradeMax,
  );
  const durationReductionPct =
    bonuses.durationReductionPct + LIFE_TOOL_DURATION_REDUCTION_PCT[toolTier];
  const bonusMaterialRate = Math.min(
    1,
    (bonuses.bonusLogChancePct +
      LIFE_TOOL_BONUS_MATERIAL_PCT[toolTier] +
      lifeGatheringBonusPct("woodcutting", workshop, progression.level) +
      levelBonuses.bonusLogChancePct +
      lifeFestivalBonus("woodcutting", new Date(now)).chancePct +
      lifeMajorBonusPct(lifeMajor, "woodcutting")) /
      100,
  );
  const baseCycleDurationMs = woodcuttingDurationWithPassive(
    tree.durationMs,
    progression.level,
    durationReductionPct,
  );
  const lifeEnvironment = lifeFeatures.environmentEnabled
    ? lifeFieldEnvironmentSnapshot("woodcutting", spotId, now)
    : null;
  const cycleDurationMs = applyLifeFieldDurationReduction(
    tree.durationMs,
    baseCycleDurationMs,
    lifeEnvironment?.environment.effect.durationReductionPct ?? 0,
  );
  const failureRate =
    woodcuttingFailureRate(tree.baseFailureRate, progression.level) *
    (1 - bonuses.failureReductionPct / 100);
  const successRate = 1 - failureRate * (1 - bonuses.failureRecoveryPct / 100);
  const session = createAutoGatheringSession({
    sessionId: randomUUID(),
    sourceId: treeId,
    sourceName: tree.name,
    materialId: tree.materialId,
    planId: args.planId,
    extendedDurationMs:
      args.extendedDurationMs ??
      gatheringSiteExtendedDurationMs(
        gatheringSiteStage(workshop.siteUpkeep ?? {}, treeId),
      ),
    now,
    cycleDurationMs: cycleDurationMs + WOODCUTTING_TREE_FALL_MS,
    successRate,
    bonusMaterialRate,
    baseXp: tree.xp,
    aidItemId: aidApplies ? activeAid?.itemId : undefined,
    aidBonusMaterialRate: aidApplies ? (aidSpec?.bonusPct ?? 0) / 100 : 0,
    spotId,
    lifeEnvironmentId: lifeEnvironment?.environment.id,
    lifeEnvironmentDayKey: lifeEnvironment?.dayKey,
    environmentPrimaryBonusChance:
      lifeEnvironment?.environment.effect.primaryBonusChance,
    environmentXpBonusPct: lifeEnvironment?.environment.effect.xpBonusPct,
  });
  return {
    session,
    materialName: WOODCUTTING_MATERIALS[tree.materialId].name,
    lifeEnvironment,
  };
}

/** 예약처럼 활동이 문자열로만 남아 있을 때 쓰는 진입점. 채집지가 그 활동의 것이 아니면 null. */
export async function buildAutoGatheringSession(
  executor: DbExecutor,
  userId: string,
  activity: AutoGatheringActivity,
  spotId: string,
  args: AutoGatheringBuildArgs,
): Promise<BuiltAutoGatheringSession | null> {
  if (activity === "mining") {
    return isMiningSpotId(spotId)
      ? buildMiningAutoSession(executor, userId, spotId, args)
      : null;
  }
  return isWoodcuttingSpotId(spotId)
    ? buildWoodcuttingAutoSession(executor, userId, spotId, args)
    : null;
}
