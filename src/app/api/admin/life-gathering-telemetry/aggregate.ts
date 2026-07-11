import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { kstDailyKey } from "@/adventure/data/v2/v2RepeatQuests";
import {
  LIFE_GATHERING_ATTEMPT_EVENT,
  LIFE_GATHERING_REWARD_EVENT,
  type LifeGatheringActivity,
} from "@/lib/server/lifeGatheringTelemetry";

export type LifeGatheringTelemetryRow = {
  userId: string | null;
  gameName: string | null;
  eventType: string;
  itemId: string | null;
  quantity: number | null;
  detail: unknown;
  createdAt: Date;
};

type MutableActivity = {
  attempts: number;
  successes: number;
  users: Set<string>;
  primaryQuantity: number;
  bonusQuantity: number;
  sources: Map<string, { name: string; attempts: number; successes: number }>;
  materials: Map<string, { quantity: number; primary: boolean }>;
  daily: Map<
    string,
    { attempts: number; successes: number; primaryQuantity: number; bonusQuantity: number }
  >;
  usersById: Map<
    string,
    { gameName: string | null; attempts: number; successes: number; quantity: number }
  >;
};

function emptyActivity(): MutableActivity {
  return {
    attempts: 0,
    successes: 0,
    users: new Set(),
    primaryQuantity: 0,
    bonusQuantity: 0,
    sources: new Map(),
    materials: new Map(),
    daily: new Map(),
    usersById: new Map(),
  };
}

function activityOf(eventType: string): LifeGatheringActivity | null {
  if (eventType.startsWith("life.woodcutting.")) return "woodcutting";
  if (eventType.startsWith("life.mining.")) return "mining";
  return null;
}

function detailOf(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function positiveInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function aggregateLifeGatheringTelemetry(
  rows: LifeGatheringTelemetryRow[],
) {
  const activityMap: Record<LifeGatheringActivity, MutableActivity> = {
    woodcutting: emptyActivity(),
    mining: emptyActivity(),
  };

  for (const row of rows) {
    const activity = activityOf(row.eventType);
    if (!activity) continue;
    const target = activityMap[activity];
    const detail = detailOf(row.detail);
    const day = kstDailyKey(row.createdAt);
    const daily = target.daily.get(day) ?? {
      attempts: 0,
      successes: 0,
      primaryQuantity: 0,
      bonusQuantity: 0,
    };

    if (row.eventType === LIFE_GATHERING_ATTEMPT_EVENT[activity]) {
      const success = positiveInt(row.quantity) > 0;
      target.attempts += 1;
      if (success) target.successes += 1;
      daily.attempts += 1;
      if (success) daily.successes += 1;
      const sourceId = row.itemId ?? String(detail.sourceId ?? "unknown");
      const source = target.sources.get(sourceId) ?? {
        name:
          typeof detail.sourceName === "string" && detail.sourceName
            ? detail.sourceName
            : sourceId,
        attempts: 0,
        successes: 0,
      };
      source.attempts += 1;
      if (success) source.successes += 1;
      target.sources.set(sourceId, source);
      if (row.userId) {
        target.users.add(row.userId);
        const user = target.usersById.get(row.userId) ?? {
          gameName: row.gameName,
          attempts: 0,
          successes: 0,
          quantity: 0,
        };
        user.gameName = row.gameName ?? user.gameName;
        user.attempts += 1;
        if (success) user.successes += 1;
        target.usersById.set(row.userId, user);
      }
    } else if (row.eventType === LIFE_GATHERING_REWARD_EVENT[activity]) {
      const quantity = positiveInt(row.quantity);
      const primary = detail.primary === true;
      if (primary) {
        target.primaryQuantity += quantity;
        daily.primaryQuantity += quantity;
      } else {
        target.bonusQuantity += quantity;
        daily.bonusQuantity += quantity;
      }
      if (row.itemId && quantity > 0) {
        const material = target.materials.get(row.itemId) ?? {
          quantity: 0,
          primary,
        };
        material.quantity += quantity;
        material.primary = material.primary && primary;
        target.materials.set(row.itemId, material);
      }
      if (row.userId) {
        const user = target.usersById.get(row.userId) ?? {
          gameName: row.gameName,
          attempts: 0,
          successes: 0,
          quantity: 0,
        };
        user.gameName = row.gameName ?? user.gameName;
        user.quantity += quantity;
        target.usersById.set(row.userId, user);
      }
    }
    target.daily.set(day, daily);
  }

  const activities = (["woodcutting", "mining"] as const).map((activity) => {
    const data = activityMap[activity];
    return {
      activity,
      attempts: data.attempts,
      successes: data.successes,
      failures: data.attempts - data.successes,
      successRate:
        data.attempts > 0 ? Math.round((data.successes / data.attempts) * 10_000) / 100 : 0,
      uniqueUsers: data.users.size,
      primaryQuantity: data.primaryQuantity,
      bonusQuantity: data.bonusQuantity,
      sources: [...data.sources.entries()]
        .map(([sourceId, value]) => ({
          sourceId,
          ...value,
          failures: value.attempts - value.successes,
          successRate:
            value.attempts > 0
              ? Math.round((value.successes / value.attempts) * 10_000) / 100
              : 0,
        }))
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
      materials: [...data.materials.entries()]
        .map(([materialId, value]) => ({
          materialId,
          name: V2_MATERIALS[materialId]?.name ?? materialId,
          ...value,
        }))
        .sort(
          (a, b) =>
            Number(b.primary) - Number(a.primary) ||
            b.quantity - a.quantity ||
            a.name.localeCompare(b.name, "ko"),
        ),
      daily: [...data.daily.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, value]) => ({ day, ...value })),
      topUsers: [...data.usersById.entries()]
        .map(([userId, value]) => ({ userId, ...value }))
        .sort(
          (a, b) =>
            b.quantity - a.quantity || b.successes - a.successes || b.attempts - a.attempts,
        )
        .slice(0, 10),
    };
  });

  return {
    totals: {
      attempts: activities.reduce((sum, item) => sum + item.attempts, 0),
      successes: activities.reduce((sum, item) => sum + item.successes, 0),
      failures: activities.reduce((sum, item) => sum + item.failures, 0),
      primaryQuantity: activities.reduce(
        (sum, item) => sum + item.primaryQuantity,
        0,
      ),
      bonusQuantity: activities.reduce(
        (sum, item) => sum + item.bonusQuantity,
        0,
      ),
    },
    activities,
  };
}
