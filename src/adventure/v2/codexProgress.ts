import { MAX_FRONTIER_DEPTH } from "@/adventure/data/v2/dungeon";
import type { FloorEquipDropPool } from "@/adventure/data/v2/dungeonEquipDrops";
import { EQUIPMENT_CODEX_SP_MILESTONES } from "@/adventure/data/v2/equipmentCodex";
import {
  V2_EQUIPMENT,
  isUnique,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { FISHING_CODEX_SP_MILESTONES } from "./fishingCodex";
import { SP_FRUIT, type SpFruitTier } from "@/adventure/data/v2/spFruit";
import { COOP_BOSSES } from "@/adventure/data/v2/coopBosses";
import { STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID } from "@/adventure/data/v2/stormExpeditionRewards";
import { jobUnlockSpForCount } from "@/adventure/data/v2/jobSpPolicy";

export function spFruitCodexSource(tier: SpFruitTier): string {
  const def = SP_FRUIT[tier];
  const sources: string[] = [];
  if (def.bossKind) {
    sources.push(`${COOP_BOSSES[def.bossKind]?.name ?? "협동 보스"} 보상`);
  }
  if (def.materialId === STORM_EXPEDITION_SP_FRUIT_MATERIAL_ID) {
    sources.push("폭풍 원정 완주 보상");
  }
  return sources.join(" · ");
}

export function spEligibleJobProgress(
  jobs: Array<{ tier?: unknown; unlocked?: unknown }>,
): { current: number; total: number } {
  const eligibleJobs = jobs.filter(
    (job) => typeof job.tier === "number" && job.tier > 0,
  );
  return {
    current: eligibleJobs.filter((job) => job.unlocked === true).length,
    total: eligibleJobs.length,
  };
}

export function spCollectionSpRange({
  label,
  value,
  jobUnlockTotal,
}: {
  label: string;
  value: number;
  jobUnlockTotal: number;
}): { current: number; maximum: number } {
  const current = Number.isFinite(value) ? Math.trunc(value) : 0;
  const normalizedJobTotal = Number.isFinite(jobUnlockTotal)
    ? Math.max(0, Math.trunc(jobUnlockTotal))
    : 0;
  const configuredMaximum =
    label === "직업 해금"
      ? jobUnlockSpForCount(normalizedJobTotal)
      : label === "어보"
        ? FISHING_CODEX_SP_MILESTONES.length
        : label === "장비 도감"
          ? EQUIPMENT_CODEX_SP_MILESTONES.length
          : current;

  return {
    current,
    maximum: Math.max(current, configuredMaximum),
  };
}

export function codexEquipmentProgress(
  ids: Iterable<V2EquipmentId>,
  registeredIds: ReadonlySet<string>,
): {
  registeredCount: number;
  totalCount: number;
  complete: boolean;
} {
  const uniqueIds = new Set(ids);
  let registeredCount = 0;
  for (const id of uniqueIds) {
    if (registeredIds.has(id)) registeredCount += 1;
  }
  const totalCount = uniqueIds.size;
  return {
    registeredCount,
    totalCount,
    complete: totalCount > 0 && registeredCount === totalCount,
  };
}

export function starterGridIds(
  pool: FloorEquipDropPool,
): V2EquipmentId[] {
  const catalogTiers = new Set(
    Object.entries(pool.catalogTierWeights)
      .filter(([, weight]) => (weight ?? 0) > 0)
      .map(([tier]) => Number(tier)),
  );
  return (Object.keys(V2_EQUIPMENT) as V2EquipmentId[]).filter((id) => {
    const item = V2_EQUIPMENT[id];
    return (
      catalogTiers.has(item.tier) &&
      !isUnique(item) &&
      !item.craftOnly &&
      !item.starterOnly &&
      !item.noDrop
    );
  });
}

export function codexThemeDeepDepth(depthStart: number): number {
  return Math.min(MAX_FRONTIER_DEPTH, Math.max(1, depthStart + 5));
}

export function classifyCodexEquipmentIds(ids: V2EquipmentId[]): {
  common: V2EquipmentId[];
  set: V2EquipmentId[];
} {
  const common: V2EquipmentId[] = [];
  const set: V2EquipmentId[] = [];
  for (const id of ids) {
    const item = V2_EQUIPMENT[id];
    if (item?.setId || (item?.setTags?.length ?? 0) > 0) set.push(id);
    else common.push(id);
  }
  return { common, set };
}
