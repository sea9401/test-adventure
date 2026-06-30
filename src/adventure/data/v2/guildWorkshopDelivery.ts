import { V2_EQUIPMENT, type V2EquipInstance } from "./v2Equipment";

export type GuildWorkshopDeliveryId =
  | "daily_crafted_any"
  | "daily_quality_any"
  | "daily_craft_only"
  | "daily_masterwork";

export type GuildWorkshopDelivery = {
  id: GuildWorkshopDeliveryId;
  title: string;
  description: string;
  rewardArtisanXp: number;
  rewardGold: number;
  accepts: (inst: V2EquipInstance) => boolean;
};

export type GuildWorkshopDeliveryReward = {
  rewardArtisanXp: number;
  rewardGold: number;
  bonusPct: number;
};

export type GuildWorkshopDeliveryState = {
  dayKey: string;
  claimed: GuildWorkshopDeliveryId[];
};

export const GUILD_WORKSHOP_DELIVERIES: Record<
  GuildWorkshopDeliveryId,
  GuildWorkshopDelivery
> = {
  daily_crafted_any: {
    id: "daily_crafted_any",
    title: "장인 제작품 납품",
    description: "길드 대장간에서 만든 장비 1개 납품",
    rewardArtisanXp: 25,
    rewardGold: 100_000,
    accepts: (inst) => inst.craftedBy?.profession === "blacksmith",
  },
  daily_quality_any: {
    id: "daily_quality_any",
    title: "품질 제작품 납품",
    description: "★ 품질 이상 제작 장비 1개 납품",
    rewardArtisanXp: 45,
    rewardGold: 250_000,
    accepts: (inst) =>
      inst.craftedBy?.profession === "blacksmith" &&
      (inst.craftQuality?.level ?? 0) >= 1,
  },
  daily_craft_only: {
    id: "daily_craft_only",
    title: "전용 장비 납품",
    description: "제작 전용 장비 1개 납품",
    rewardArtisanXp: 60,
    rewardGold: 400_000,
    accepts: (inst) =>
      inst.craftedBy?.profession === "blacksmith" &&
      V2_EQUIPMENT[inst.id]?.craftOnly === true,
  },
  daily_masterwork: {
    id: "daily_masterwork",
    title: "명장 제작품 납품",
    description: "명장 제작으로 만든 제작 전용 장비 1개 납품",
    rewardArtisanXp: 90,
    rewardGold: 700_000,
    accepts: (inst) =>
      inst.craftedBy?.profession === "blacksmith" &&
      inst.craftedBy.masterwork === true &&
      V2_EQUIPMENT[inst.id]?.craftOnly === true,
  },
};

export const GUILD_WORKSHOP_DELIVERY_IDS = Object.keys(
  GUILD_WORKSHOP_DELIVERIES,
) as GuildWorkshopDeliveryId[];

export function isGuildWorkshopDeliveryId(
  v: unknown,
): v is GuildWorkshopDeliveryId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(GUILD_WORKSHOP_DELIVERIES, v)
  );
}

export function todayDeliveryKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseGuildWorkshopDeliveryState(
  raw: unknown,
  dayKey: string,
): GuildWorkshopDeliveryState {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { dayKey, claimed: [] };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.dayKey !== dayKey) return { dayKey, claimed: [] };
  const claimedRaw = Array.isArray(obj.claimed) ? obj.claimed : [];
  return {
    dayKey,
    claimed: claimedRaw.filter(isGuildWorkshopDeliveryId),
  };
}

export function guildWorkshopDeliveryViews(
  state: GuildWorkshopDeliveryState,
  owned: V2EquipInstance[],
  equippedIids: ReadonlySet<string>,
  smithyLevel = 1,
) {
  return GUILD_WORKSHOP_DELIVERY_IDS.map((id) => {
    const delivery = GUILD_WORKSHOP_DELIVERIES[id];
    const claimed = state.claimed.includes(id);
    const deliverable = owned
      .filter((inst) => !inst.locked && !equippedIids.has(inst.iid))
      .filter(delivery.accepts)
      .map((inst) => {
        const reward = guildWorkshopDeliveryReward(delivery, inst, smithyLevel);
        return {
          iid: inst.iid,
          itemId: inst.id,
          itemName: V2_EQUIPMENT[inst.id]?.name ?? inst.id,
          enhanceLevel: inst.enhance?.level ?? 0,
          craftQualityLevel: inst.craftQuality?.level ?? 0,
          craftOnly: V2_EQUIPMENT[inst.id]?.craftOnly === true,
          crafterLevel: inst.craftedBy?.level ?? 1,
          ...reward,
        };
      });
    return {
      id,
      title: delivery.title,
      description: delivery.description,
      rewardArtisanXp: delivery.rewardArtisanXp,
      rewardGold: delivery.rewardGold,
      claimed,
      canClaim: !claimed && deliverable.length > 0,
      deliverable,
    };
  });
}

export function guildWorkshopDeliveryReward(
  delivery: GuildWorkshopDelivery,
  inst: V2EquipInstance,
  smithyLevel = 1,
): GuildWorkshopDeliveryReward {
  const safeSmithyLevel = Math.max(1, Math.floor(Number(smithyLevel) || 1));
  const craftQualityLevel = Math.max(0, Math.floor(inst.craftQuality?.level ?? 0));
  const bonusPct = Math.min(
    100,
    Math.max(0, (safeSmithyLevel - 1) * 5 + craftQualityLevel * 10),
  );
  const mult = 1 + bonusPct / 100;
  return {
    rewardArtisanXp: Math.floor(delivery.rewardArtisanXp * mult),
    rewardGold: Math.floor(delivery.rewardGold * mult),
    bonusPct,
  };
}

export function claimGuildWorkshopDelivery(
  state: GuildWorkshopDeliveryState,
  id: GuildWorkshopDeliveryId,
): GuildWorkshopDeliveryState {
  if (state.claimed.includes(id)) return state;
  return { ...state, claimed: [...state.claimed, id] };
}
