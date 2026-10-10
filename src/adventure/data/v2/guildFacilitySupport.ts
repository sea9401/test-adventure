import type {
  SettlementBuildingUpgradeCost,
  SettlementResourceKey,
  SettlementResources,
} from "./settlement";
import { MINING_MATERIAL_ID } from "./miningSpots";
import { WOODCUTTING_MATERIAL_ID } from "./woodcuttingSpots";

export const GUILD_FACILITY_SUPPORT_TOTAL = 200;

// basic = 통나무·철광석(교역소 Lv.1), advanced = 편백나무·아다만타이트(교역소 Lv.10).
// 배분 결과의 crop/ore 는 각 종류의 첫째·둘째 재료 몫이다.
export type GuildFacilitySupportKind = "basic" | "advanced";

export const GUILD_FACILITY_SUPPORT_RESOURCES: Record<
  GuildFacilitySupportKind,
  { keys: [SettlementResourceKey, SettlementResourceKey]; labels: [string, string] }
> = {
  basic: { keys: ["crop", "ore"], labels: ["통나무", "철광석"] },
  advanced: {
    keys: [
      WOODCUTTING_MATERIAL_ID.cypress as SettlementResourceKey,
      MINING_MATERIAL_ID.adamantite as SettlementResourceKey,
    ],
    labels: ["편백나무", "아다만타이트"],
  },
};

export type GuildFacilitySupportAllocation = {
  crop: number;
  ore: number;
  total: 200;
};

export function guildFacilitySupportAllocation(
  cost: SettlementBuildingUpgradeCost,
  donated: SettlementResources,
  kind: GuildFacilitySupportKind = "basic",
): GuildFacilitySupportAllocation | null {
  const [firstKey, secondKey] = GUILD_FACILITY_SUPPORT_RESOURCES[kind].keys;
  const cropRemaining = Math.max(
    0,
    Math.floor(cost[firstKey] ?? 0) - Math.floor(donated[firstKey] ?? 0),
  );
  const oreRemaining = Math.max(
    0,
    Math.floor(cost[secondKey] ?? 0) - Math.floor(donated[secondKey] ?? 0),
  );
  if (cropRemaining + oreRemaining < GUILD_FACILITY_SUPPORT_TOTAL) {
    return null;
  }

  let crop = Math.min(100, cropRemaining);
  let ore = Math.min(100, oreRemaining);
  let unassigned = GUILD_FACILITY_SUPPORT_TOTAL - crop - ore;

  const cropExtra = Math.min(unassigned, cropRemaining - crop);
  crop += cropExtra;
  unassigned -= cropExtra;

  const oreExtra = Math.min(unassigned, oreRemaining - ore);
  ore += oreExtra;
  unassigned -= oreExtra;

  if (unassigned !== 0) return null;
  return { crop, ore, total: GUILD_FACILITY_SUPPORT_TOTAL };
}

export function applyGuildFacilitySupport(
  donated: SettlementResources,
  allocation: GuildFacilitySupportAllocation,
  kind: GuildFacilitySupportKind = "basic",
): SettlementResources {
  const [firstKey, secondKey] = GUILD_FACILITY_SUPPORT_RESOURCES[kind].keys;
  return {
    ...donated,
    [firstKey]: Math.max(0, Math.floor(donated[firstKey] ?? 0)) + allocation.crop,
    [secondKey]: Math.max(0, Math.floor(donated[secondKey] ?? 0)) + allocation.ore,
  };
}
