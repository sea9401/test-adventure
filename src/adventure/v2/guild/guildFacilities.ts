import type { SettlementBuildingId } from "@/adventure/data/v2/settlement";

export const GUILD_FACILITY_IDS = [
  "guild_smithy",
  "training_ground",
  "exploration_hq",
  "alchemy_workshop",
  "dining_hall",
  "trade_post",
  "guild_warehouse",
] as const satisfies readonly SettlementBuildingId[];

export type GuildFacilityId = (typeof GUILD_FACILITY_IDS)[number];

export const GUILD_FACILITY_LABELS: Record<GuildFacilityId, string> = {
  guild_smithy: "제작소",
  training_ground: "훈련장",
  exploration_hq: "탐사 본부",
  alchemy_workshop: "연금 공방",
  dining_hall: "길드 식당",
  trade_post: "교역소",
  guild_warehouse: "길드 창고",
};

// 메인 길드 드롭다운과 길드 시설 목록이 공유하는 아이콘 색상.
export const GUILD_FACILITY_ICON_COLORS: Record<GuildFacilityId, string> = {
  guild_smithy: "text-orange-600 dark:text-orange-400",
  training_ground: "text-rose-600 dark:text-rose-400",
  exploration_hq: "text-sky-600 dark:text-sky-400",
  alchemy_workshop: "text-violet-600 dark:text-violet-400",
  dining_hall: "text-emerald-600 dark:text-emerald-400",
  trade_post: "text-teal-600 dark:text-teal-400",
  guild_warehouse: "text-blue-600 dark:text-blue-400",
};

export function isGuildFacilityId(
  value: string | null | undefined,
): value is GuildFacilityId {
  return (
    typeof value === "string" &&
    (GUILD_FACILITY_IDS as readonly string[]).includes(value)
  );
}

export function availableGuildFacilityIds(
  buildings?: Partial<Record<SettlementBuildingId, number>>,
): GuildFacilityId[] {
  return GUILD_FACILITY_IDS.filter((id) => (buildings?.[id] ?? 0) > 0);
}
