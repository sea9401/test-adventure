import type {
  SettlementBuildingUpgradeCost,
  SettlementResources,
} from "./settlement";

export const GUILD_FACILITY_SUPPORT_TOTAL = 200;

export type GuildFacilitySupportAllocation = {
  crop: number;
  ore: number;
  total: 200;
};

export function guildFacilitySupportAllocation(
  cost: SettlementBuildingUpgradeCost,
  donated: SettlementResources,
): GuildFacilitySupportAllocation | null {
  const cropRemaining = Math.max(
    0,
    Math.floor(cost.crop ?? 0) - Math.floor(donated.crop ?? 0),
  );
  const oreRemaining = Math.max(
    0,
    Math.floor(cost.ore ?? 0) - Math.floor(donated.ore ?? 0),
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
): SettlementResources {
  return {
    ...donated,
    crop: Math.max(0, Math.floor(donated.crop ?? 0)) + allocation.crop,
    ore: Math.max(0, Math.floor(donated.ore ?? 0)) + allocation.ore,
  };
}
