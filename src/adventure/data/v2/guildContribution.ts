import { MINING_MATERIAL_ID } from "./miningSpots";
import { WOODCUTTING_MATERIAL_ID } from "./woodcuttingSpots";
import type { SettlementDonationMaterialId } from "./settlement";

// 길드 기여 점수는 서로 다른 길드 활동을 한 눈금으로 비교하기 위한 표시 전용 값이다.
// 10점 = 기본 기여 1단위(골드 10만, 일반 활동 1회, 식당·교역 기여 1점).
export const GUILD_CONTRIBUTION_POINT_SCALE = 10;
export const GUILD_CONTRIBUTION_GOLD_UNIT = 100_000;

export const GUILD_CONTRIBUTION_CATEGORIES = [
  "funding",
  "facilities",
  "workshop",
  "exploration",
  "training",
  "alchemy",
  "dining",
  "trade",
] as const;

export type GuildContributionCategory =
  (typeof GUILD_CONTRIBUTION_CATEGORIES)[number];

// 길드 전체가 함께 채우고 한 사람만 수령하는 공동 보상은 수령자를 개인 기여자로
// 볼 수 없다. 활동·보상 원장은 유지하되 개인 기여 원장/순위에서는 제외한다.
export const GUILD_NON_PERSONAL_CONTRIBUTION_SOURCES = [
  "workshop_weekly_claim",
  "exploration_weekly_claim",
  "exploration_expedition_claim",
  "exploration_event_resolve",
] as const;

export function isPersonalGuildContributionSource(type: string): boolean {
  return !(GUILD_NON_PERSONAL_CONTRIBUTION_SOURCES as readonly string[]).includes(
    type,
  );
}

export const GUILD_CONTRIBUTION_CATEGORY_LABEL: Record<
  GuildContributionCategory,
  string
> = {
  funding: "길드 자금",
  facilities: "시설 재료",
  workshop: "제작소",
  exploration: "탐사",
  training: "훈련",
  alchemy: "연금",
  dining: "식당",
  trade: "교역",
};

type Contribution = {
  category: GuildContributionCategory;
  points: number;
};

type ContributionActivityMeta = {
  amount?: number;
  contributionPoints?: number;
  rewardGold?: number;
  rewardFame?: number;
};

const MATERIAL_BATCH_VALUE: Record<
  SettlementDonationMaterialId,
  { batchSize: number; pointValue: number }
> = {
  [WOODCUTTING_MATERIAL_ID.pine]: { batchSize: 10, pointValue: 1 },
  [WOODCUTTING_MATERIAL_ID.birch]: { batchSize: 5, pointValue: 1 },
  [WOODCUTTING_MATERIAL_ID.willow]: { batchSize: 3, pointValue: 1 },
  [WOODCUTTING_MATERIAL_ID.oak]: { batchSize: 2, pointValue: 1 },
  [WOODCUTTING_MATERIAL_ID.cedar]: { batchSize: 1, pointValue: 1 },
  [WOODCUTTING_MATERIAL_ID.cypress]: { batchSize: 1, pointValue: 2 },
  [MINING_MATERIAL_ID.iron]: { batchSize: 10, pointValue: 1 },
  [MINING_MATERIAL_ID.copper]: { batchSize: 5, pointValue: 1 },
  [MINING_MATERIAL_ID.silver]: { batchSize: 3, pointValue: 1 },
  [MINING_MATERIAL_ID.gold]: { batchSize: 2, pointValue: 1 },
  [MINING_MATERIAL_ID.mythril]: { batchSize: 1, pointValue: 1 },
  [MINING_MATERIAL_ID.adamantite]: { batchSize: 1, pointValue: 2 },
};

function nonNegativeInt(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function guildGoldContributionPoints(amount: unknown): number {
  // 10만 골드 = 10점. 1만 골드 단위까지 기여가 보이되 쪼개기 이득은 없다.
  return Math.floor(
    (nonNegativeInt(amount) * GUILD_CONTRIBUTION_POINT_SCALE) /
      GUILD_CONTRIBUTION_GOLD_UNIT,
  );
}

export function guildFacilityMaterialContributionPoints(
  donations: Partial<Record<SettlementDonationMaterialId, number>>,
): number {
  let scaled = 0;
  for (const [materialId, amountRaw] of Object.entries(donations)) {
    const value = MATERIAL_BATCH_VALUE[materialId as SettlementDonationMaterialId];
    if (!value) continue;
    scaled +=
      (nonNegativeInt(amountRaw) * value.pointValue *
        GUILD_CONTRIBUTION_POINT_SCALE) /
      value.batchSize;
  }
  // 여러 재료를 한 번에 기부할 때는 합산 후 내림해 자투리 손실을 줄인다.
  return Math.floor(scaled);
}

export function guildExistingActivityContributionPoints(points: unknown): number {
  return nonNegativeInt(points) * GUILD_CONTRIBUTION_POINT_SCALE;
}

function guildRewardContributionPoints(
  meta: ContributionActivityMeta | null,
): number {
  return (
    guildGoldContributionPoints(meta?.rewardGold) +
    nonNegativeInt(meta?.rewardFame) * GUILD_CONTRIBUTION_POINT_SCALE
  );
}

export function guildContributionForActivity(
  type: string,
  meta: ContributionActivityMeta | null,
): Contribution | null {
  if (!isPersonalGuildContributionSource(type)) return null;

  const explicit = nonNegativeInt(meta?.contributionPoints);
  if (explicit > 0) {
    const category = contributionCategory(type);
    return category ? { category, points: explicit } : null;
  }

  let points = 0;
  switch (type) {
    case "gold_deposit":
      points = guildGoldContributionPoints(meta?.amount);
      break;
    case "workshop_delivery":
      points = guildGoldContributionPoints(meta?.rewardGold);
      break;
    case "workshop_craft_only":
    case "training_drill_claim":
    case "alchemy_craft":
      points = GUILD_CONTRIBUTION_POINT_SCALE;
      break;
    case "trade_contract_complete":
    case "artisan_rank_reward":
      points = guildRewardContributionPoints(meta);
      break;
    default:
      points = 0;
  }
  const category = contributionCategory(type);
  return points > 0 && category ? { category, points } : null;
}

function contributionCategory(
  type: string,
): GuildContributionCategory | null {
  switch (type) {
    case "gold_deposit":
      return "funding";
    case "facility_material_donation":
      return "facilities";
    case "workshop_delivery":
    case "workshop_craft_only":
    case "workshop_weekly_claim":
    case "artisan_rank_reward":
      return "workshop";
    case "exploration_weekly_claim":
    case "exploration_expedition_claim":
    case "exploration_event_resolve":
      return "exploration";
    case "training_drill_claim":
      return "training";
    case "alchemy_craft":
      return "alchemy";
    case "dining_ingredient_donation":
      return "dining";
    case "trade_delivery":
    case "trade_contract_complete":
      return "trade";
    default:
      return null;
  }
}
