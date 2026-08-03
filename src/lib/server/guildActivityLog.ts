import type { db as dbType } from "@/db";
import { guildActivityLog, guildContributionEvents } from "@/db/schema";
import type { GuildAlchemyChargeTarget } from "@/adventure/data/v2/guildAlchemy";
import { guildContributionForActivity } from "@/adventure/data/v2/guildContribution";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

// 길드원 활동 내역 기록. 이벤트가 일어나는 라우트의 같은 tx 안에서 호출 — 행위가 롤백되면
// 로그도 함께 롤백(원자성). 이름은 저장 안 함(userId 만; 읽을 때 현재 닉네임으로 batch 해석).
// ⚠️ 트림 없음 — 읽기는 limit 30 이지만 행은 무한 누적. 현재 규모(테스터 소수)는 무방.
//   대량화 전 길드당 최근 N행 유지 트림을 cron(guilds-cleanup)에 추가할 것(핫패스 밖).
export type GuildActivityType =
  | "member_join"
  | "member_leave"
  | "member_kick"
  | "leadership_transfer"
  | "role_change"
  | "gold_deposit"
  | "facility_material_donation"
  | "dining_ingredient_donation"
  | "trade_delivery"
  | "workshop_weekly_claim"
  | "exploration_weekly_claim"
  | "exploration_expedition_dispatch"
  | "exploration_expedition_claim"
  | "exploration_event_resolve"
  | "workshop_delivery"
  | "workshop_craft_only"
  | "artisan_rank_reward"
  | "smithy_upgrade"
  | "building_upgrade"
  | "guild_level_upgrade"
  | "combat_supply_upgrade"
  | "training_drill_claim"
  | "alchemy_craft"
  | "emblem_change"
  | "dining_meal"
  | "trade_contract_complete"
  | "nation_declare"
  | "guild_create";

export type GuildActivityMeta = {
  amount?: number; // gold_deposit | emblem_change
  quantity?: number; // 시설·식당·교역 재료 기부량
  contributionPoints?: number; // 해당 활동에서 확정한 길드 기여 점수
  role?: string; // role_change ("manager" | "member")
  nationName?: string; // nation_declare
  questTitle?: string; // workshop_weekly_claim | exploration_weekly_claim
  deliveryTitle?: string; // workshop_delivery
  itemName?: string; // workshop_delivery | workshop_craft_only | alchemy_craft | dining_meal | trade_contract_complete
  smithyLevel?: number; // smithy_upgrade
  buildingName?: string; // building_upgrade
  buildingLevel?: number; // building_upgrade
  guildLevel?: number; // guild_level_upgrade
  goldCost?: number; // guild_level_upgrade
  supplyName?: string; // combat_supply_upgrade
  supplyLevel?: number; // combat_supply_upgrade
  fameCost?: number; // combat_supply_upgrade
  drillTitle?: string; // training_drill_claim
  rewardMastery?: number; // training_drill_claim
  chargeTarget?: GuildAlchemyChargeTarget; // alchemy_craft
  chargeAmount?: number; // alchemy_craft
  artisanXp?: number; // workshop_delivery
  artisanRank?: number; // artisan_rank_reward
  titleName?: string; // artisan_rank_reward
  rewardGold?: number; // workshop_weekly_claim | exploration_weekly_claim | workshop_delivery
  rewardFame?: number; // workshop_weekly_claim | exploration_weekly_claim
  mapFragments?: number; // exploration_weekly_claim | exploration_expedition_claim
};

export async function logGuildActivity(
  tx: Tx,
  entry: {
    guildId: number;
    type: GuildActivityType;
    actorUserId?: string | null;
    targetUserId?: string | null;
    meta?: GuildActivityMeta | null;
  },
): Promise<void> {
  const activity = (
    await tx
      .insert(guildActivityLog)
      .values({
        guildId: entry.guildId,
        type: entry.type,
        actorUserId: entry.actorUserId ?? null,
        targetUserId: entry.targetUserId ?? null,
        meta: entry.meta ?? null,
      })
      .returning({ id: guildActivityLog.id, createdAt: guildActivityLog.createdAt })
  )[0];
  const contribution = guildContributionForActivity(
    entry.type,
    entry.meta ?? null,
  );
  if (!activity || !entry.actorUserId || !contribution) return;
  await tx.insert(guildContributionEvents).values({
    guildId: entry.guildId,
    userId: entry.actorUserId,
    activityLogId: activity.id,
    source: entry.type,
    category: contribution.category,
    points: contribution.points,
    createdAt: activity.createdAt,
  });
}
