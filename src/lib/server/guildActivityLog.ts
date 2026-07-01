import type { db as dbType } from "@/db";
import { guildActivityLog } from "@/db/schema";

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
  | "workshop_weekly_claim"
  | "workshop_delivery"
  | "workshop_craft_only"
  | "artisan_rank_reward"
  | "smithy_upgrade"
  | "building_upgrade"
  | "combat_supply_upgrade"
  | "nation_declare"
  | "guild_create";

export type GuildActivityMeta = {
  amount?: number; // gold_deposit
  role?: string; // role_change ("vice_master" | "manager" | "member")
  nationName?: string; // nation_declare
  questTitle?: string; // workshop_weekly_claim
  deliveryTitle?: string; // workshop_delivery
  itemName?: string; // workshop_delivery | workshop_craft_only
  smithyLevel?: number; // smithy_upgrade
  buildingName?: string; // building_upgrade
  buildingLevel?: number; // building_upgrade
  supplyName?: string; // combat_supply_upgrade
  supplyLevel?: number; // combat_supply_upgrade
  fameCost?: number; // combat_supply_upgrade
  artisanXp?: number; // workshop_delivery
  artisanRank?: number; // artisan_rank_reward
  titleName?: string; // artisan_rank_reward
  rewardGold?: number; // workshop_weekly_claim
  rewardFame?: number; // workshop_weekly_claim
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
  await tx.insert(guildActivityLog).values({
    guildId: entry.guildId,
    type: entry.type,
    actorUserId: entry.actorUserId ?? null,
    targetUserId: entry.targetUserId ?? null,
    meta: entry.meta ?? null,
  });
}
