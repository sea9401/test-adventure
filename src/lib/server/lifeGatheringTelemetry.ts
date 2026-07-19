import { recordEconomyEventSoon } from "./economyLog";

export type LifeGatheringActivity =
  | "fishing"
  | "woodcutting"
  | "mining"
  | "farming";

export const LIFE_GATHERING_ATTEMPT_EVENT: Record<
  LifeGatheringActivity,
  string
> = {
  fishing: "life.fishing.attempt",
  woodcutting: "life.woodcutting.attempt",
  mining: "life.mining.attempt",
  farming: "life.farming.attempt",
};

export const LIFE_GATHERING_REWARD_EVENT: Record<
  LifeGatheringActivity,
  string
> = {
  fishing: "life.fishing.gather",
  woodcutting: "life.woodcutting.gather",
  mining: "life.mining.gather",
  farming: "life.farming.gather",
};

export const LIFE_GATHERING_EVENT_TYPES = [
  ...Object.values(LIFE_GATHERING_ATTEMPT_EVENT),
  ...Object.values(LIFE_GATHERING_REWARD_EVENT),
] as const;

export type LifeGatheringDrop = {
  materialId: string;
  materialName?: string;
  quantity: number;
  primary: boolean;
  itemKind?: string;
};

export function recordLifeGatheringTelemetrySoon(args: {
  userId: string;
  activity: LifeGatheringActivity;
  sourceId: string;
  sourceName: string;
  grade: number;
  success: boolean;
  failureRate: number;
  xpGained: number;
  drops: LifeGatheringDrop[];
}) {
  const detail = {
    activity: args.activity,
    sourceId: args.sourceId.slice(0, 80),
    sourceName: args.sourceName.slice(0, 120),
    grade: Math.max(1, Math.floor(args.grade)),
    success: args.success,
    failureRate: Math.min(1, Math.max(0, args.failureRate)),
    xpGained: Math.max(0, Math.floor(args.xpGained)),
  };
  recordEconomyEventSoon({
    userId: args.userId,
    eventType: LIFE_GATHERING_ATTEMPT_EVENT[args.activity],
    itemKind: "activity",
    itemId: args.sourceId,
    quantity: args.success ? 1 : 0,
    detail,
  });

  if (!args.success) return;
  for (const drop of args.drops) {
    const quantity = Math.max(0, Math.floor(drop.quantity));
    if (!drop.materialId || quantity <= 0) continue;
    recordEconomyEventSoon({
      userId: args.userId,
      eventType: LIFE_GATHERING_REWARD_EVENT[args.activity],
      itemKind: drop.itemKind ?? "material",
      itemId: drop.materialId,
      quantity,
      detail: {
        ...detail,
        primary: drop.primary,
        ...(drop.materialName ? { materialName: drop.materialName } : {}),
      },
    });
  }
}
