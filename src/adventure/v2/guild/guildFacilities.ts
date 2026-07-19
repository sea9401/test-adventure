import type { SettlementBuildingId } from "@/adventure/data/v2/settlement";

export const GUILD_FACILITY_IDS = [
  "guild_smithy",
  "training_ground",
  "exploration_hq",
  "alchemy_workshop",
  "dining_hall",
  "trade_post",
] as const satisfies readonly SettlementBuildingId[];

export type GuildFacilityId = (typeof GUILD_FACILITY_IDS)[number];

export const GUILD_FACILITY_LABELS: Record<GuildFacilityId, string> = {
  guild_smithy: "제작소",
  training_ground: "훈련장",
  exploration_hq: "탐사 본부",
  alchemy_workshop: "연금 공방",
  dining_hall: "길드 식당",
  trade_post: "교역소",
};

export function isGuildFacilityId(
  value: string | null | undefined,
): value is GuildFacilityId {
  return (
    typeof value === "string" &&
    (GUILD_FACILITY_IDS as readonly string[]).includes(value)
  );
}

export function unlockedGuildFacilityIds(
  buildings?: Partial<Record<SettlementBuildingId, number>>,
): GuildFacilityId[] {
  return GUILD_FACILITY_IDS.filter((id) => (buildings?.[id] ?? 0) > 0);
}
